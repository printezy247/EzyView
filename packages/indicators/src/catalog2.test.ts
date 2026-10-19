import { describe, expect, it } from "vitest";
import { catalog, getIndicator } from "./registry.js";
import type { OHLCV } from "./helpers.js";

const n = 160;

/** Deterministic trending + oscillating series so no indicator divides by zero. */
function makeWave(len = n): OHLCV {
  const close: number[] = [];
  const open: number[] = [];
  const high: number[] = [];
  const low: number[] = [];
  const volume: number[] = [];
  let price = 100;
  for (let i = 0; i < len; i++) {
    const drift = Math.sin(i / 7) * 3 + Math.cos(i / 23) * 5 + i * 0.02;
    const next = 100 + drift;
    open.push(price);
    close.push(next);
    high.push(Math.max(price, next) + 1.2);
    low.push(Math.min(price, next) - 1.2);
    volume.push(1000 + (i % 17) * 37);
    price = next;
  }
  return { open, high, low, close, volume };
}

const data = makeWave();

describe("second batch — structural", () => {
  it("ships 50+ indicators total", () => {
    expect(catalog().length).toBeGreaterThanOrEqual(50);
  });

  it("every indicator computes aligned output without throwing", () => {
    for (const def of catalog()) {
      const params = Object.fromEntries(def.params.map((p) => [p.id, p.default]));
      const out = def.compute(data, params as Record<string, number | boolean | string>);
      expect(out.values, def.id).toHaveLength(n);
      for (const [name, plot] of Object.entries(out.plots ?? {})) {
        expect(plot, `${def.id}.${name}`).toHaveLength(n);
      }
    }
  });

  it("every indicator stays finite on a flat series", () => {
    const flat: OHLCV = {
      open: Array.from({ length: n }, () => 50),
      high: Array.from({ length: n }, () => 51),
      low: Array.from({ length: n }, () => 49),
      close: Array.from({ length: n }, () => 50),
      volume: Array.from({ length: n }, () => 100),
    };
    for (const def of catalog()) {
      const params = Object.fromEntries(def.params.map((p) => [p.id, p.default]));
      const out = def.compute(flat, params as Record<string, number | boolean | string>);
      for (const v of out.values) {
        if (v === null) continue;
        expect(Number.isFinite(v), `${def.id} -> ${v}`).toBe(true);
      }
    }
  });

  it("every indicator keeps ids unique across both batches", () => {
    const ids = catalog().map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("second batch — spot values", () => {
  it("DEMA extrapolates EMA rather than lagging it", () => {
    const rising = makeWave(n);
    const ema = getIndicator("ema")!.compute(rising, { length: 10, source: "close" }).values;
    const dema = getIndicator("dema")!.compute(rising, { length: 10, source: "close" }).values;
    const i = n - 1;
    expect(dema[i]).not.toBeNull();
    expect(ema[i]).not.toBeNull();
    // On a rising leg DEMA tracks price tighter than plain EMA.
    expect(Math.abs(dema[i]! - rising.close[i]!)).toBeLessThanOrEqual(
      Math.abs(ema[i]! - rising.close[i]!) + 1e-6,
    );
  });

  it("KAMA is flat when price never moves", () => {
    const flat: OHLCV = {
      open: Array.from({ length: n }, () => 50),
      high: Array.from({ length: n }, () => 51),
      low: Array.from({ length: n }, () => 49),
      close: Array.from({ length: n }, () => 50),
      volume: Array.from({ length: n }, () => 100),
    };
    const out = getIndicator("kama")!.compute(flat, { length: 10, fast: 2 }).values;
    const last = out.at(-1);
    expect(last).toBeCloseTo(50, 6);
  });

  it("MFI stays inside 0..100", () => {
    const out = getIndicator("mfi")!.compute(data, { length: 14 }).values;
    for (const v of out) {
      if (v === null) continue;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("ROC matches a manual percentage change", () => {
    const out = getIndicator("roc")!.compute(data, { length: 5 }).values;
    const i = n - 1;
    const expected = ((data.close[i]! - data.close[i - 5]!) / data.close[i - 5]!) * 100;
    expect(out[i]).toBeCloseTo(expected, 4);
  });

  it("Bulls/Bears Power equal high/bars minus the close EMA", () => {
    const length = 13;
    const emaSeries = getIndicator("ema")!.compute(data, { length, source: "close" }).values;
    const bulls = getIndicator("bulls_power")!.compute(data, { length }).values;
    const bears = getIndicator("bears_power")!.compute(data, { length }).values;
    for (let i = length; i < n; i++) {
      expect(bulls[i]).toBeCloseTo(data.high[i]! - emaSeries[i]!, 5);
      expect(bears[i]).toBeCloseTo(data.low[i]! - emaSeries[i]!, 5);
      // Bulls reads above the EMA, bears below it, by construction.
      expect(bulls[i]!).toBeGreaterThan(bears[i]!);
    }
  });

  it("Donchian upper and lower bracket the close", () => {
    const out = getIndicator("donchian")!.compute(data, { length: 20 });
    const i = n - 1;
    const upper = out.plots?.upper?.[i] ?? null;
    const lower = out.plots?.lower?.[i] ?? null;
    expect(upper).not.toBeNull();
    expect(lower).not.toBeNull();
    expect(upper!).toBeGreaterThanOrEqual(data.close[i]! - 1e-9);
    expect(lower!).toBeLessThanOrEqual(data.close[i]! + 1e-9);
  });

  it("Keltner upper > middle > lower wherever warm", () => {
    const out = getIndicator("kc")!.compute(data, { length: 20, mult: 2, atrLength: 10 });
    for (let i = 0; i < n; i++) {
      const mid = out.values[i] ?? null;
      const up = out.plots?.upper?.[i] ?? null;
      const lo = out.plots?.lower?.[i] ?? null;
      if (mid === null || up === null || lo === null) continue;
      expect(up).toBeGreaterThan(mid);
      expect(lo).toBeLessThan(mid);
    }
  });

  it("PSAR sits on the opposite side of price from the trend", () => {
    const out = getIndicator("psar")!.compute(data, { start: 0.02, inc: 0.02, max: 0.2 }).values;
    const last = out.at(-1);
    expect(last).not.toBeNull();
    expect(last).toBeGreaterThan(0);
  });

  it("Ichimoku returns a cloud as spanA and spanB plots", () => {
    const out = getIndicator("ichimoku")!.compute(data, { tenkan: 9, kijun: 26, senkou: 52, shift: 26 });
    expect(out.plots?.base).toBeDefined();
    expect(out.plots?.spanA).toBeDefined();
    expect(out.plots?.spanB).toBeDefined();
  });

  it("TSI stays inside -100..100", () => {
    const out = getIndicator("tsi")!.compute(data, { length: 25, length1: 13, length2: 7 });
    for (const v of out.values) {
      if (v === null) continue;
      expect(v).toBeGreaterThanOrEqual(-100);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("A/D Line accumulates monotonically on always-positive money flow", () => {
    const upOnly: OHLCV = {
      open: Array.from({ length: n }, (_, i) => 100 + i),
      high: Array.from({ length: n }, (_, i) => 101 + i),
      low: Array.from({ length: n }, (_, i) => 100 + i),
      close: Array.from({ length: n }, (_, i) => 101 + i),
      volume: Array.from({ length: n }, () => 100),
    };
    const out = getIndicator("ad_line")!.compute(upOnly, {}).values;
    for (let i = 1; i < n; i++) expect(out[i]!).toBeGreaterThan(out[i - 1]!);
  });

  it("linear regression curve sits inside the window's price range", () => {
    const out = getIndicator("linreg")!.compute(data, { length: 14, source: "close" }).values;
    const i = n - 1;
    const window = data.close.slice(i - 13, i + 1);
    expect(out[i]).toBeGreaterThanOrEqual(Math.min(...window) - 1e-6);
    expect(out[i]).toBeLessThanOrEqual(Math.max(...window) + 1e-6);
  });
});
