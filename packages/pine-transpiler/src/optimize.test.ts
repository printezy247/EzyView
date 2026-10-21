import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MAX_COMBOS, optimizePine } from "./optimize.js";
import type { ParamSpec } from "./optimize.js";
import type { BacktestResult, Trade } from "./backtest.js";

/** Minimal BacktestResult; tests override only the fields ranking reads. */
function fakeResult(partial: Partial<BacktestResult> = {}): BacktestResult {
  return {
    trades: [],
    equity: [],
    finalEquity: 10_000,
    totalPnl: 0,
    winRate: 0,
    profitFactor: null,
    maxDrawdown: 0,
    bars: 0,
    ...partial,
  };
}

/** Trade stubs — ranking only ever reads `.length`, never the fields. */
const tradesOf = (n: number): Trade[] => Array.from({ length: n }, () => ({} as Trade));

/** totalPnl prefers a=2; winRate prefers a=1. */
const pnlVsWinRate = (inputs: Record<string, number>): BacktestResult =>
  fakeResult({ totalPnl: inputs.a! * 100, winRate: inputs.a === 1 ? 0.9 : 0.1 });

/** Constant pnl; trade count rises with the input so fewer trades can win. */
const moreTradesWorse = (inputs: Record<string, number>): BacktestResult =>
  fakeResult({ totalPnl: 5, trades: tradesOf(inputs.a!) });

describe("optimizePine", () => {
  it("runs once with empty inputs when there are no specs", () => {
    const run = vi.fn(() => fakeResult({ totalPnl: 7 }));
    const out = optimizePine(run, []);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({});
    expect(out.runs).toHaveLength(1);
    expect(out.runs[0]?.inputs).toEqual({});
    expect(out.best).toBe(out.runs[0]);
    expect(out.capped).toBe(false);
  });

  it("runs the full 2×3 cartesian grid, ranked best-first by totalPnl", () => {
    const specs: ParamSpec[] = [
      { key: "a", values: [1, 2] },
      { key: "b", values: [10, 20, 30] },
    ];
    const out = optimizePine((inputs) => fakeResult({ totalPnl: inputs.a! * 100 + inputs.b! }), specs);

    expect(out.runs).toHaveLength(6);
    expect(out.capped).toBe(false);
    expect(out.best?.inputs).toEqual({ a: 2, b: 30 });
    // Ranked desc by pnl; ties would fall through to the trade/JSON tiebreaks.
    expect(out.runs.map((r) => r.inputs)).toEqual([
      { a: 2, b: 30 },
      { a: 2, b: 20 },
      { a: 2, b: 10 },
      { a: 1, b: 30 },
      { a: 1, b: 20 },
      { a: 1, b: 10 },
    ]);
    expect(out.runs.map((r) => r.result.totalPnl)).toEqual([230, 220, 210, 130, 120, 110]);
  });

  it("hands the runner only the spec keys, never a base-inputs merge", () => {
    const seen: Record<string, number>[] = [];
    optimizePine(
      (inputs) => {
        seen.push({ ...inputs });
        return fakeResult();
      },
      [
        { key: "a", values: [1] },
        { key: "b", values: [2] },
      ],
    );

    expect(seen).toEqual([{ a: 1, b: 2 }]);
    expect(Object.keys(seen[0] ?? {}).toSorted()).toEqual(["a", "b"]);
  });

  it("stops at maxCombos and flags the grid capped", () => {
    const specs: ParamSpec[] = [
      { key: "a", values: [1, 2, 3] },
      { key: "b", values: [1, 2] },
    ];
    const run = vi.fn(() => fakeResult());
    const out = optimizePine(run, specs, { maxCombos: 4 });

    expect(out.runs).toHaveLength(4);
    expect(out.capped).toBe(true);
    // Generation order: first-spec-major, so the cut drops the a=3 row.
    expect(out.runs.map((r) => r.inputs)).toEqual([
      { a: 1, b: 1 },
      { a: 1, b: 2 },
      { a: 2, b: 1 },
      { a: 2, b: 2 },
    ]);
  });

  it("does not flag capped when the product lands exactly on maxCombos", () => {
    const out = optimizePine(() => fakeResult(), [{ key: "a", values: [1, 2] }], { maxCombos: 2 });

    expect(out.runs).toHaveLength(2);
    expect(out.capped).toBe(false);
  });

  it("defaults the combo budget to 500", () => {
    expect(DEFAULT_MAX_COMBOS).toBe(500);
    const values = Array.from({ length: DEFAULT_MAX_COMBOS + 1 }, (_, i) => i + 1);
    const out = optimizePine(() => fakeResult(), [{ key: "a", values }]);

    expect(out.runs).toHaveLength(DEFAULT_MAX_COMBOS);
    expect(out.capped).toBe(true);
  });

  it("ranks by a custom metric when one is given", () => {
    const out = optimizePine(pnlVsWinRate, [{ key: "a", values: [1, 2] }], { metric: (r) => r.winRate });

    expect(out.best?.inputs).toEqual({ a: 1 });
  });

  it("breaks metric ties by fewer trades", () => {
    const out = optimizePine(moreTradesWorse, [{ key: "a", values: [3, 1, 2] }]);

    expect(out.best?.inputs).toEqual({ a: 1 });
    expect(out.runs.map((r) => r.inputs)).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
  });

  it("breaks remaining ties by JSON key order of the inputs map", () => {
    const out = optimizePine(() => fakeResult({ totalPnl: 1 }), [{ key: "k", values: [2, 10] }]);

    // '{"k":10}' sorts before '{"k":2}' lexicographically.
    expect(out.runs.map((r) => r.inputs)).toEqual([{ k: 10 }, { k: 2 }]);
    expect(out.best?.inputs).toEqual({ k: 10 });
  });

  it("skips combos whose runner throws instead of aborting the grid", () => {
    const out = optimizePine(
      (inputs) => {
        if (inputs.a === 2) throw new Error("boom");
        return fakeResult({ totalPnl: inputs.a! });
      },
      [{ key: "a", values: [1, 2, 3] }],
    );

    expect(out.runs.map((r) => r.inputs)).toEqual([{ a: 3 }, { a: 1 }]);
    expect(out.best?.inputs).toEqual({ a: 3 });
  });

  it("yields no runs when a spec has an empty values list", () => {
    const run = vi.fn(() => fakeResult());
    const out = optimizePine(run, [{ key: "a", values: [] }]);

    expect(run).not.toHaveBeenCalled();
    expect(out.runs).toHaveLength(0);
    expect(out.best).toBeNull();
    expect(out.capped).toBe(false);
  });
});
