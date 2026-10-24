/**
 * Pine runner worker.
 *
 * `runPine` executes transpiled user code with `new Function` (CSP still
 * carries `'unsafe-eval'` until the interpreter rewrite lands), and a hostile
 * or heavy script can tie up the host tab. Running it here keeps the UI
 * thread free and lets the caller hard-kill the whole worker on a time
 * budget — no in-flight state to clean up, the worker is replaced wholesale
 * on the next request.
 *
 * Protocol: { id, kind, ... } in; { id, ok, ... } out. The runner owns the
 * budget; this side just answers.
 */
import { backtest, optimizePine, runPine } from "@ezyview/pine-transpiler";
import type { Context, OptimizationResult, ParamSpec, PineResult, PineValue } from "@ezyview/pine-transpiler";

export interface PineRunRequest {
  id: number;
  kind: "run";
  source: string;
  ctx: Context;
}

/** Numeric input bars for the optimizer grid. */
export interface PineBars {
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
}

export interface PineOptimizeRequest {
  id: number;
  kind: "optimize";
  source: string;
  bars: PineBars;
  baseInputs: Record<string, number>;
  specs: ParamSpec[];
}

export type PineRequest = PineRunRequest | PineOptimizeRequest;

export interface PineRunResponse {
  id: number;
  ok: true;
  kind: "run";
  result: PineResult;
  /** ctx.inputs after the run — scalar inputs the tester/optimizer can show. */
  inputs: Record<string, PineValue>;
}

export interface PineOptimizeResponse {
  id: number;
  ok: true;
  kind: "optimize";
  result: OptimizationResult;
}

export interface PineErrorResponse {
  id: number;
  ok: false;
  message: string;
}

export type PineResponse = PineRunResponse | PineOptimizeResponse | PineErrorResponse;

self.addEventListener("message", (event): void => {
  const req = (event as MessageEvent<PineRequest>).data;
  try {
    if (req.kind === "run") {
      const ctx: Context = { ...req.ctx, inputs: { ...req.ctx.inputs } };
      const result = runPine(req.source, ctx);
      const reply: PineRunResponse = { id: req.id, ok: true, kind: "run", result, inputs: ctx.inputs };
      // A dedicated worker has no target origin; the parent is implicit.
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      self.postMessage(reply);
      return;
    }
    if (req.kind === "optimize") {
      if (req.bars.close.length === 0) throw new Error("no bars for the optimizer");
      const result: OptimizationResult = optimizePine((vals) => {
        const ctx: Context = {
          open: req.bars.open,
          high: req.bars.high,
          low: req.bars.low,
          close: req.bars.close,
          volume: req.bars.volume,
          barIndex: req.bars.close.length - 1,
          // Fresh map per grid point: runPine mutates inputs in place, the
          // copy keeps combos from leaking into each other.
          inputs: { ...req.baseInputs, ...vals },
        };
        // Orders → fills here; the close array rides along on the request.
        return backtest(runPine(req.source, ctx).orders, { close: req.bars.close });
      }, req.specs);
      const reply: PineOptimizeResponse = { id: req.id, ok: true, kind: "optimize", result };
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      self.postMessage(reply);
      return;
    }
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    self.postMessage({ id: (req as PineRequest).id, ok: false, message: `unknown job kind` } satisfies PineErrorResponse);
  } catch (e) {
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    self.postMessage({ id: req.id, ok: false, message: e instanceof Error ? e.message : String(e) } satisfies PineErrorResponse);
  }
});
