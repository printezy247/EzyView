import type { SeriesValue } from "./types.js";

/** OHLCV columns, aligned 1:1. */
export interface OHLCV {
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
}

/** Simple moving average. Null until `period - 1` samples exist. */
export function sma(values: number[], period: number): SeriesValue[] {
  const out: SeriesValue[] = Array.from({ length: values.length }, () => null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Exponential moving average seeded with an SMA of the first `period` samples,
 * then alpha = 2 / (period + 1).
 */
export function ema(values: number[], period: number): SeriesValue[] {
  const out: SeriesValue[] = Array.from({ length: values.length }, () => null);
  if (period <= 0 || values.length < period) return out;
  const alpha = 2 / (period + 1);

  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i]!;
  let prev = seed / period;
  out[period - 1] = prev;

  for (let i = period; i < values.length; i++) {
    prev = (values[i]! - prev) * alpha + prev;
    out[i] = prev;
  }
  return out;
}

/** Wilder's running moving average (RMA / SMMA), alpha = 1 / period. */
export function rma(values: number[], period: number): SeriesValue[] {
  const out: SeriesValue[] = Array.from({ length: values.length }, () => null);
  if (period <= 0 || values.length < period) return out;

  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i]!;
  let prev = seed / period;
  out[period - 1] = prev;

  for (let i = period; i < values.length; i++) {
    prev = (prev * (period - 1) + values[i]!) / period;
    out[i] = prev;
  }
  return out;
}

/** Rolling standard deviation (population) over `values`. */
export function stdev(values: number[], period: number): SeriesValue[] {
  const out: SeriesValue[] = Array.from({ length: values.length }, () => null);
  if (period <= 0) return out;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    sum += v;
    sumSq += v * v;
    if (i >= period) {
      const drop = values[i - period]!;
      sum -= drop;
      sumSq -= drop * drop;
    }
    if (i >= period - 1) {
      const mean = sum / period;
      out[i] = Math.sqrt(Math.max(0, sumSq / period - mean * mean));
    }
  }
  return out;
}

/** Highest value over a rolling window (inclusive of current bar). */
export function highest(values: number[], period: number): SeriesValue[] {
  const out: SeriesValue[] = Array.from({ length: values.length }, () => null);
  for (let i = period - 1; i < values.length; i++) {
    let m = -Infinity;
    for (let j = i - period + 1; j <= i; j++) m = Math.max(m, values[j]!);
    out[i] = m;
  }
  return out;
}

/** Lowest value over a rolling window (inclusive of current bar). */
export function lowest(values: number[], period: number): SeriesValue[] {
  const out: SeriesValue[] = Array.from({ length: values.length }, () => null);
  for (let i = period - 1; i < values.length; i++) {
    let m = Infinity;
    for (let j = i - period + 1; j <= i; j++) m = Math.min(m, values[j]!);
    out[i] = m;
  }
  return out;
}

/** `values[i] - values[i - period]`. */
export function change(values: number[], period = 1): SeriesValue[] {
  const out: SeriesValue[] = Array.from({ length: values.length }, () => null);
  for (let i = period; i < values.length; i++) out[i] = values[i]! - values[i - period]!;
  return out;
}

/** True range: max(high-low, |high-prevClose|, |low-prevClose|). */
export function trueRange(data: OHLCV): number[] {
  const out: number[] = Array.from<number>({ length: data.close.length });
  for (let i = 0; i < data.close.length; i++) {
    const h = data.high[i]!;
    const l = data.low[i]!;
    if (i === 0) {
      out[i] = h - l;
      continue;
    }
    const pc = data.close[i - 1]!;
    out[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  return out;
}

/** Per-element arithmetic over two aligned series; null if either side is null. */
export function map2(a: SeriesValue[], b: SeriesValue[], fn: (x: number, y: number) => number): SeriesValue[] {
  const out: SeriesValue[] = Array.from({ length: a.length }, () => null);
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? null;
    const y = b[i] ?? null;
    out[i] = x === null || y === null ? null : fn(x, y);
  }
  return out;
}

/** Fill leading/interior nulls with the previous known value (or `fallback`). */
export function fillForward(values: SeriesValue[], fallback = 0): number[] {
  const out: number[] = Array.from<number>({ length: values.length });
  let last = fallback;
  for (let i = 0; i < values.length; i++) {
    const v = values[i] ?? null;
    if (v !== null) last = v;
    out[i] = last;
  }
  return out;
}

/** Round to `precision` decimals so outputs stay deterministic across runs. */
export function round(values: SeriesValue[], precision = 6): SeriesValue[] {
  const f = 10 ** precision;
  return values.map((v) => (v === null ? null : Math.round(v * f) / f));
}
