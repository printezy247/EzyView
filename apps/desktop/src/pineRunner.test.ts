import { describe, expect, it } from "vitest";
import { PineBudgetError, optimizePineWithBudget, runPineWithBudget } from "./pineRunner";
import type { Context } from "@ezyview/pine-transpiler";

/**
 * Tests run under vitest, so the runner takes its documented inline path —
 * the same contract the worker mirrors.
 */

const ctx = (close: number[]): Context => ({
  open: close.map(() => close[0]!),
  high: close,
  low: close,
  close,
  volume: close.map(() => 0),
  barIndex: close.length - 1,
  inputs: {},
});

describe("runPineWithBudget (inline path)", () => {
  it("runs an indicator script and returns plots", async () => {
    const out = await runPineWithBudget("plot(ta.sma(close, 3))", ctx([1, 2, 3, 4, 5]));
    expect(out.result.plots.length).toBeGreaterThan(0);
    expect(out.tested.trades).toEqual([]);
  });

  it("returns scalar inputs after the run (mirrors ctx.inputs on the main thread)", async () => {
    const out = await runPineWithBudget("plot(input.int(3))", ctx([1, 2, 3, 4, 5]));
    // Positional key of the first input site is "0".
    expect(out.inputs["0"]).toBe(3);
  });

  it("propagates script errors with their original message", async () => {
    await expect(runPineWithBudget("plot(ta.nonexistent(close, 3))", ctx([1, 2, 3]))).rejects.toThrow(/nonexistent|unknown/i);
  });

  it("honours a custom budget by still finishing fast scripts", async () => {
    const out = await runPineWithBudget("plot(close)", ctx([1, 2, 3]), { timeBudgetMs: 50 });
    expect(out.result.plots).toHaveLength(1);
  });

  it("passes backtest costs and OHLC fills; a costed fixture loses money", async () => {
    // Break-even roundtrip without costs
    const strategy = `strategy("Cost Test")
if bar_index == 0
    strategy.entry("Buy", strategy.long)
if bar_index == 1
    strategy.close("Buy")
`;
    const free = await runPineWithBudget(strategy, ctx([100, 100, 100]));
    expect(free.tested.totalPnl).toBe(0);

    // Costed fixture: commission and slippage make it lose money
    const costed = await runPineWithBudget(strategy, ctx([100, 100, 100]), {
      backtestOpts: {
        commission: 2.5,
        slippage: 0.5,
        contractMultiplier: 1,
      },
    });
    expect(costed.tested.totalPnl).toBeLessThan(0);
  });
});

describe("optimizePineWithBudget (inline path)", () => {
  it("grids numeric inputs and returns sorted runs", async () => {
    const bars = [1, 2, 3, 4, 5, 6];
    const out = await optimizePineWithBudget(
      "plot(input.int(2))",
      { open: bars, high: bars, low: bars, close: bars, volume: bars.map(() => 0) },
      { "0": 1 },
      [{ key: "0", values: [1, 2] }],
    );
    expect(out.runs).toHaveLength(2);
    const first = out.runs[0]!;
    const second = out.runs[1]!;
    expect(first.result.totalPnl >= second.result.totalPnl).toBe(true);
  });
});

describe("budget error shape", () => {
  it("names the user-visible budget in seconds", () => {
    const error = new PineBudgetError(5_000);
    expect(error.message).toContain("5.0s time budget");
  });
});
