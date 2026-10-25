/**
 * Front door for Pine execution (Phase 4 safety).
 *
 * All `runPine`/`optimizePine` calls go to a dedicated Worker when one can be
 * created: user scripts cannot freeze the chart tab, and a runaway script is
 * stopped by terminating the worker at the time budget (the caller receives
 * an error; the next request gets a fresh worker). Where no Worker is
 * available — vitest, very old hosts — the call runs inline with identical
 * semantics, so tests and every call site share one contract.
 */
import { backtest, optimizePine, runPine } from "@ezyview/pine-transpiler";
import type { BacktestOptions, BacktestResult, Context, OptimizationResult, ParamSpec, PineResult } from "@ezyview/pine-transpiler";
import type { PineBars, PineErrorResponse, PineResponse } from "./pine.worker";

const DEFAULT_RUN_BUDGET_MS = 5_000;
const DEFAULT_OPTIMIZE_BUDGET_MS = 15_000;

/** Scalar inputs the tester panel (and the optimizer) can show/apply. */
export type PineScalarInput = number | string | boolean;

export interface PineRunOutcome {
  result: PineResult;
  inputs: Record<string, PineScalarInput>;
  /** Backtest of the returned strategy orders (empty for indicators). */
  tested: BacktestResult;
}

export class PineBudgetError extends Error {
  constructor(ms: number) {
    super(`Pine script exceeded its ${(ms / 1000).toFixed(1)}s time budget and was stopped.`);
  }
}

/** Vitest installs a happy-dom Worker stub that cannot load the module, so
 * units pin the inline path; the app always gets a real Worker. Detected via
 * vitest's globals rather than import.meta.env — the tsconfig types neither. */
const isTestRun = (): boolean =>
  typeof globalThis === "object" && "__vitest_worker__" in globalThis;

const workerCtor = (): typeof Worker | null => {
  if (typeof Worker === "undefined") return null;
  // Inline mode keeps unit tests deterministic (happy-dom's Worker stub
  // cannot load the module). Using the same contract in tests and the app
  // means the fallback path is exactly what runs inside real workers.
  if (isTestRun()) return null;
  return Worker as typeof Worker;
};

const toScalarInputs = (raw: Record<string, unknown> | undefined): Record<string, PineScalarInput> => {
  const inputs: Record<string, PineScalarInput> = {};
  for (const [key, value] of raw ? Object.entries(raw) : []) {
    if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
      inputs[key] = value;
    }
  }
  return inputs;
};

interface Job {
  timer: ReturnType<typeof setTimeout>;
  resolve: (response: PineResponse) => void;
  reject: (error: Error) => void;
}

let singleWorker: Worker | null = null;
let pending = new Map<number, Job>();
/**
 * Lazily created; replaced wholesale after a budget kill. `null` (after a
 * failed creation) pins the module to inline mode for the session.
 */
const obtainWorker = (): Worker | null => {
  if (singleWorker) return singleWorker;
  const Ctor = workerCtor();
  if (!Ctor) return null;
  try {
    const w = new Ctor(new URL("./pine.worker.ts", import.meta.url), { type: "module" });
    w.addEventListener("message", (event: MessageEvent<PineResponse>) => {
      const job = pending.get(event.data.id);
      if (!job) return;
      pending.delete(event.data.id);
      clearTimeout(job.timer);
      if (event.data.ok) job.resolve(event.data);
      else job.reject(new Error((event.data as PineErrorResponse).message));
    });
    w.addEventListener("error", () => {
      const failed = pending;
      pending = new Map();
      for (const [, job] of failed) {
        clearTimeout(job.timer);
        job.reject(new Error("Pine runner crashed; please run again."));
      }
      w.terminate();
      if (singleWorker === w) singleWorker = null;
    });
    singleWorker = w;
    return w;
  } catch {
    return null;
  }
};

/** Hard-stop everything the worker is doing: budget enforcement and cancel(). */
export function cancelPineJobs(): void {
  const w = singleWorker;
  singleWorker = null;
  const running = pending;
  pending = new Map();
  w?.terminate();
  for (const [, job] of running) {
    clearTimeout(job.timer);
    job.reject(new Error("Pine run was cancelled."));
  }
}

const respond = (
  worker: Worker | null,
  msg: unknown,
  budgetMs: number,
): Promise<Extract<PineResponse, { ok: true }>> => {
  if (!worker) {
    return Promise.reject(new Error("pine worker unavailable"));
  }
  const id = (msg as { id: number }).id;
  return new Promise<Extract<PineResponse, { ok: true }>>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      cancelPineJobs(); // Kill the whole worker: a busy script cannot be interrupted.
      reject(new PineBudgetError(budgetMs));
    }, budgetMs);
    pending.set(id, {
      timer,
      resolve: (response) => resolve(response as Extract<PineResponse, { ok: true }>),
      reject,
    });
    // A dedicated worker has no target origin; the parent is implicit.
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    worker.postMessage(msg);
  });
};

export interface PineBudgetOptions {
  timeBudgetMs?: number;
  backtestOpts?: Partial<BacktestOptions>;
}

/** Run one Pine script inside the worker; never blocks the caller's thread. */
export async function runPineWithBudget(source: string, ctx: Context, opts: PineBudgetOptions = {}): Promise<PineRunOutcome> {
  const budgetMs = opts.timeBudgetMs ?? DEFAULT_RUN_BUDGET_MS;
  const backtestOpts: BacktestOptions = {
    close: ctx.close,
    open: ctx.open,
    high: ctx.high,
    low: ctx.low,
    ...opts.backtestOpts,
  };
  const worker = obtainWorker();
  if (!worker) {
    // Inline fallback (tests and worker-less hosts): shared semantics with
    // the worker mirror of this code.
    const inlineCtx: Context = { ...ctx, inputs: { ...ctx.inputs } };
    const result = runPine(source, inlineCtx);
    return {
      result,
      inputs: toScalarInputs(inlineCtx.inputs),
      tested: backtest(result.orders, backtestOpts),
    };
  }
  const req = { id: newJobId(), kind: "run", source, ctx, backtestOpts: opts.backtestOpts };
  const response = await respond(worker, req, budgetMs);
  if (response.kind !== "run") throw new Error("pine runner sent an unexpected reply");
  return {
    result: response.result,
    inputs: toScalarInputs(response.inputs as Record<string, unknown>),
    tested: backtest(response.result.orders, backtestOpts),
  };
}

let nextJobId = 1;
const newJobId = (): number => nextJobId++;

/** CFO grid over the worker — combos never tie up the host tab. */
export async function optimizePineWithBudget(
  source: string,
  bars: PineBars,
  baseInputs: Record<string, number>,
  specs: ParamSpec[],
  opts: PineBudgetOptions = {},
): Promise<OptimizationResult> {
  const budgetMs = opts.timeBudgetMs ?? DEFAULT_OPTIMIZE_BUDGET_MS;
  const worker = obtainWorker();
  if (!worker) {
    const closeCopy = bars.close;
    return optimizePine((vals) => {
      const ctx: Context = {
        open: bars.open,
        high: bars.high,
        low: bars.low,
        close: closeCopy,
        volume: bars.volume,
        barIndex: bars.close.length - 1,
        inputs: { ...baseInputs, ...vals },
      };
      return backtest(runPine(source, ctx).orders, { close: closeCopy });
    }, specs);
  }
  const req = { id: newJobId(), kind: "optimize", source, bars, baseInputs, specs };
  const response = await respond(worker, req, budgetMs);
  if (response.kind !== "optimize") throw new Error("pine runner sent an unexpected reply");
  return response.result;
}
