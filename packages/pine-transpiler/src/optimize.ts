import type { BacktestResult } from "./backtest.js";

/** One input key and the candidate values to try for it. */
export interface ParamSpec {
  key: string;
  values: number[];
}

/** One grid point: the exact inputs handed to the runner, and its result. */
export interface OptimizeRun {
  inputs: Record<string, number>;
  result: BacktestResult;
}

export interface OptimizationResult {
  /** Ranked best-first; empty when the grid was empty or every combo failed. */
  runs: OptimizeRun[];
  /** Top-ranked run, or null when there were none. */
  best: OptimizeRun | null;
  /** True when the cartesian product exceeded `maxCombos` and generation stopped early. */
  capped: boolean;
}

export interface OptimizeOptions {
  /** Hard stop on combos generated; default {@link DEFAULT_MAX_COMBOS}. */
  maxCombos?: number;
  /** Ranking metric, higher is better; default `totalPnl`. */
  metric?: (r: BacktestResult) => number;
}

/** Default combo budget — a few hundred backtests stays interactive; thousands does not. */
export const DEFAULT_MAX_COMBOS = 500;

/**
 * Run a grid search over the cartesian product of `specs`.
 *
 * The runner receives exactly the spec keys for each combo — no base-inputs
 * merge — so it can close over whatever defaults the caller wants and layer
 * the grid on top. A fresh inputs object is built per combo. Combos whose
 * runner call throws are dropped from `runs` rather than aborting the grid.
 *
 * Ranking is by `metric` descending; ties prefer fewer trades, then the JSON
 * serialization of the inputs map, so the order is fully deterministic.
 */
export function optimizePine(
  run: (inputs: Record<string, number>) => BacktestResult,
  specs: ParamSpec[],
  opts?: OptimizeOptions,
): OptimizationResult {
  const maxCombos = opts?.maxCombos ?? DEFAULT_MAX_COMBOS;
  const metric = opts?.metric ?? ((r: BacktestResult) => r.totalPnl);
  const { combos, capped } = cartesian(specs, maxCombos);

  const runs: OptimizeRun[] = [];
  for (const inputs of combos) {
    try {
      runs.push({ inputs, result: run(inputs) });
    } catch {
      // A combo that blows up inside the script is skipped, not fatal.
    }
  }

  runs.sort((a, b) => {
    const byMetric = metric(b.result) - metric(a.result);
    if (byMetric !== 0) return byMetric;
    const byTrades = a.result.trades.length - b.result.trades.length;
    if (byTrades !== 0) return byTrades;
    const aj = JSON.stringify(a.inputs);
    const bj = JSON.stringify(b.inputs);
    return aj < bj ? -1 : aj > bj ? 1 : 0;
  });

  return { runs, best: runs[0] ?? null, capped };
}

/**
 * Cartesian product in spec order, hard-stopped at `maxCombos`.
 *
 * An empty `specs` list yields the single empty combo — one run with `{}`.
 * A spec with no values collapses the product to nothing.
 */
function cartesian(
  specs: ParamSpec[],
  maxCombos: number,
): { combos: Record<string, number>[]; capped: boolean } {
  let combos: Record<string, number>[] = [{}];
  let capped = false;
  for (const spec of specs) {
    const next: Record<string, number>[] = [];
    for (const base of combos) {
      for (const value of spec.values) {
        if (next.length >= maxCombos) {
          capped = true;
          break;
        }
        next.push({ ...base, [spec.key]: value });
      }
      if (capped) break;
    }
    combos = next;
    if (capped) break;
  }
  return { combos, capped };
}
