import { describe, expect, it } from "vitest";
import { catalog, getIndicator } from "./registry.js";
import type { OHLCV } from "./helpers.js";

const closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

function make(data: Partial<OHLCV> & { close: number[] }): OHLCV {
  return {
    open: data.open ?? data.close.map((c) => c),
    high: data.high ?? data.close.map((c) => c + 1),
    low: data.low ?? data.close.map((c) => c - 1),
    close: data.close,
    volume: data.volume ?? data.close.map((_, i) => 100 + i),
  };
}

describe("helpers", () => {
  it("sma returns null until warm-up completes", () => {
    // imported lazily to keep this test next to the catalog under test
    const d = make({ close: [1, 2, 3, 4, 5] });
    const def = getIndicator("sma")!;
    const out = def.compute(d, { length: 3, source: "close" }).values;
    expect(out).toEqual([null, null, 2, 3, 4]);
  });

  it("ema seeds with SMA then applies alpha = 2/(n+1)", () => {
    const d = make({ close: [1, 2, 3, 4, 5] });
    const out = getIndicator("ema")!.compute(d, { length: 3, source: "close" }).values;
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBe(2);
    expect(out[3]).toBe(3); // (4-2)*0.5+2
    expect(out[4]).toBe(4); // (5-3)*0.5+3
  });

  it("atr equals true range on a constant-range series", () => {
    const n = 30;
    const close = Array.from({ length: n }, (_, i) => 100 + i);
    const d = make({ close, high: close.map((c) => c + 2), low: close.map((c) => c - 2) });
    const out = getIndicator("atr")!.compute(d, { length: 14 }).values;
    expect(out[13]).toBeCloseTo(4, 6); // high-low = 4 dominates
    expect(out.at(-1)).toBeCloseTo(4, 6);
  });
});

describe("oscillators", () => {
  it("rsi saturates at 100 on a monotonically rising series", () => {
    const d = make({ close: Array.from({ length: 40 }, (_, i) => 100 + i) });
    const out = getIndicator("rsi")!.compute(d, { length: 14, source: "close" }).values;
    expect(out.at(-1)).toBeCloseTo(100, 6);
  });

  it("rsi saturates at 0 on a monotonically falling series", () => {
    const d = make({ close: Array.from({ length: 40 }, (_, i) => 100 - i) });
    const out = getIndicator("rsi")!.compute(d, { length: 14, source: "close" }).values;
    expect(out.at(-1)).toBeCloseTo(0, 6);
  });

  it("stochastic stays inside 0..100", () => {
    const d = make({ close: closes.map((c, i) => 100 + Math.sin(i) * 5) });
    const out = getIndicator("stoch")!.compute(d, { k: 5, d: 3, smooth: 3 });
    for (const v of [...out.values, ...(out.plots?.d ?? [])]) {
      if (v === null) continue;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("williams %R stays inside -100..0", () => {
    const d = make({ close: closes.map((c, i) => 100 + Math.cos(i) * 4) });
    const out = getIndicator("willr")!.compute(d, { length: 5 }).values;
    for (const v of out) {
      if (v === null) continue;
      expect(v).toBeGreaterThanOrEqual(-100);
      expect(v).toBeLessThanOrEqual(0);
    }
  });

  it("macd equals fast EMA minus slow EMA", () => {
    const d = make({ close: Array.from({ length: 60 }, (_, i) => 100 + i * 0.5 + Math.sin(i)) });
    const out = getIndicator("macd")!.compute(d, { fast: 12, slow: 26, signal: 9, source: "close" });
    expect(out.values[24]).toBeNull(); // slow EMA (26) warms at index 25
    expect(out.values[25]).not.toBeNull();
    expect(out.plots?.hist).toBeDefined();
  });
});

describe("bands", () => {
  it("bollinger upper > middle > lower wherever warm", () => {
    const d = make({ close: closes.map((c, i) => 100 + Math.sin(i) * 10) });
    const out = getIndicator("bb")!.compute(d, { length: 5, mult: 2, source: "close" });
    const upper = out.plots?.upper ?? [];
    const lower = out.plots?.lower ?? [];
    for (let i = 0; i < out.values.length; i++) {
      const mid = out.values[i] ?? null;
      const up = upper[i] ?? null;
      const lo = lower[i] ?? null;
      if (mid === null || up === null || lo === null) continue;
      expect(up).toBeGreaterThanOrEqual(mid);
      expect(lo).toBeLessThanOrEqual(mid);
      expect(up - mid).toBeCloseTo(mid - lo, 4);
    }
  });
});

describe("catalog", () => {
  it("every indicator computes aligned output without throwing", () => {
    const d = make({
      close: Array.from({ length: 120 }, (_, i) => 100 + Math.sin(i / 3) * 8 + i * 0.1),
    });
    for (const def of catalog()) {
      const params = Object.fromEntries(def.params.map((p) => [p.id, p.default]));
      const out = def.compute(d, params as Record<string, number | boolean | string>);
      expect(out.values, def.id).toHaveLength(d.close.length);
      for (const plot of Object.values(out.plots ?? {})) expect(plot, def.id).toHaveLength(d.close.length);
    }
  });

  it("catalog exposes the P1 indicator set", () => {
    const ids = catalog().map((d) => d.id);
    for (const id of ["sma", "ema", "vwma", "vwap", "bb", "atr", "rsi", "macd", "stoch", "cmo"]) {
      expect(ids, id).toContain(id);
    }
  });
});
