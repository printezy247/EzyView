import { describe, expect, it } from "vitest";
import { backtest } from "./backtest.js";
import { transpile } from "./transpile.js";
import { runPine } from "./evaluate.js";
import type { Context, PineValue } from "./runtime.js";

/**
 * Pine-compatibility smoke tests (Phase 8).
 *
 * Whole-scripts modeled after scripts traders actually publish — the pieces
 * that transpilers usually break: `var` state across bars, `nz()` fallbacks,
 * color/plotshape options, strategy calls inside conditionals, and inputs
 * written as keywords. Each script must transpile, run, and produce a sane
 * plot/order shape; the backtest turn orders into fills end to end.
 */

const makeContext = (n = 60): Context => {
  const open: number[] = [];
  const high: number[] = [];
  const low: number[] = [];
  const close: number[] = [];
  const volume: number[] = [];
  for (let i = 0; i < n; i++) {
    // Alternating warm-up (feeds EMA/RSI seeds), then a clean rise over bars
    // 40..59 and a clean fall from bar 60: two true trend reversals a real
    // cross must fire on. A pure alternating zig-zag never crosses — the fast
    // EMA rides above the slow one through the whole cycle.
    const swing = i < 40 ? (i % 2 === 0 ? 2.5 : -2.5) : i < 60 ? (i - 40) * 2.5 : -(i - 60) * 2.5;
    const base = 100 + i * 0.1 + swing;
    open.push(base);
    close.push(base + 0.5);
    high.push(base + 1.5);
    low.push(base - 1.5);
    volume.push(1000 + i * 10);
  }
  return { open, high, low, close, volume, barIndex: n - 1, inputs: {} };
};

const nums = (v: PineValue[]): number[] => v.filter((x): x is number => typeof x === "number");

describe(" Pine script compatibility (full scripts)", () => {
  it("EMA cross strategy: transpiles, runs, and orders backtest into fills", () => {
    const src = [
      '//@version=5',
      'strategy("EMA Cross", overlay=true)',
      "fast = input.int(9, title=\"Fast\")",
      "slow = input.int(21, title=\"Slow\")",
      "emaFast = ta.ema(close, fast)",
      "emaSlow = ta.ema(close, slow)",
      "long = ta.crossover(emaFast, emaSlow)",
      "short = ta.crossunder(emaFast, emaSlow)",
      "if long",
      '    strategy.entry("Long", strategy.long)',
      "if short",
      '    strategy.entry("Short", strategy.short)',
      "plot(emaFast, color=color.new(color.green, 0))",
      "plot(emaSlow, color=color.new(color.red, 0))",
    ].join("\n");
    const ctx = makeContext(80);
    const out = runPine(src, ctx);
    expect(out.plots).toHaveLength(2);
    expect(nums(out.plots[0]!.values).length).toBeGreaterThan(60); // warm, not empty
    expect(out.orders.length).toBeGreaterThan(0); // the cross fires on the zig-zag
    const fills = backtest(out.orders, { close: ctx.close });
    expect(fills.trades.length).toBeGreaterThan(0);
    expect(Number.isFinite(fills.totalPnl)).toBe(true);
  });

  it("RSI mean reversion with nz fallback and strategy exit", () => {
    const src = [
      'indicator("RSI MR")',
      "len = input.int(14)",
      "ob = input.int(70)",
      "os = input.int(30)",
      "r = ta.rsi(close, len)",
      "prev = nz(r[1], 50)",
      "if ta.crossunder(r, os)",
      '    strategy.entry("Buy", strategy.long)',
      "if ta.crossover(r, ob)",
      '    strategy.close("Buy")',
      "plot(r)",
      "plotshape(ta.crossover(r, ob), title=\"OB\", location=location.top)",
    ].join("\n");
    const ctx = makeContext(120);
    const out = runPine(src, ctx);
    const rsi = nums(out.plots[0]!.values);
    expect(rsi.every((v) => v >= 0 && v <= 100)).toBe(true);
    expect(out.orders.length).toBeGreaterThan(0);
    const fills = backtest(out.orders, { close: ctx.close });
    expect(Number.isFinite(fills.totalPnl)).toBe(true);
  });

  it("var accumulator across bars matches its hand-computed target", () => {
    const src = [
      'indicator("Run-up")',
      "var float acc = 0.0",
      "acc := acc + nz(close - close[1], 0)",
      "plot(acc)",
    ].join("\n");
    const ctx = makeContext(30);
    const out = runPine(src, ctx);
    const acc = nums(out.plots[0]!.values);
    // close[i] - close[i-1] telescopes to close[last] - close[0].
    expect(acc[acc.length - 1]).toBeCloseTo(ctx.close[ctx.close.length - 1]! - ctx.close[0]!, 8);
  });

  it("two runs on the same source cannot leak state between runs", () => {
    // Same fresh-context contract the Pine runner uses per worker job.
    const run = (): number => {
      const ctx = makeContext(40);
      const out = runPine('var c = 0.0\nc := c + 1\nstrategy.entry("E", strategy.long)\nplot(c)', ctx);
      const c = nums(out.plots[0]!.values);
      return c[c.length - 1]!;
    };
    expect(run()).toBe(run());
  });

  it("every published-style script transpiles without throwing", () => {
    const samples = [
      'indicator("SMA tactic")\nsm = ta.sma(close, 20)\nplot(sm)\nplot(ta.sma(close, 50))',
      'strategy("ATR stop")\natr = ta.rma(high - low, 14)\nlong = ta.crossover(close, ta.sma(close, 10))\nif long\n    strategy.entry("L", strategy.long)\nplot(atr)',
      'indicator("MACD-ish")\nfast = ta.ema(close, 12)\nslow = ta.ema(close, 26)\nplot(fast - slow)\nplotshape(fast > slow, style=shape.triangleup)',
    ];
    for (const src of samples) {
      expect(() => transpile(src)).not.toThrow();
    }
  });
});
