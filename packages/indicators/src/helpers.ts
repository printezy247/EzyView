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

/** Highest value over a rolling window (inclusive of current bar) in O(N) using a monotonic deque. */
export function highest(values: number[], period: number): SeriesValue[] {
  const p = Math.max(1, Math.floor(period));
  const n = values.length;
  const out: SeriesValue[] = Array.from({ length: n }, () => null);
  if (p <= 0 || n < p) return out;

  const deque: number[] = [];
  let head = 0;

  for (let i = 0; i < n; i++) {
    const val = values[i]!;
    while (head < deque.length && deque[head]! <= i - p) {
      head++;
    }
    while (deque.length > head && values[deque[deque.length - 1]!]! <= val) {
      deque.pop();
    }
    deque.push(i);

    if (i >= p - 1) {
      out[i] = values[deque[head]!]!;
    }
  }
  return out;
}

/** Lowest value over a rolling window (inclusive of current bar) in O(N) using a monotonic deque. */
export function lowest(values: number[], period: number): SeriesValue[] {
  const p = Math.max(1, Math.floor(period));
  const n = values.length;
  const out: SeriesValue[] = Array.from({ length: n }, () => null);
  if (p <= 0 || n < p) return out;

  const deque: number[] = [];
  let head = 0;

  for (let i = 0; i < n; i++) {
    const val = values[i]!;
    while (head < deque.length && deque[head]! <= i - p) {
      head++;
    }
    while (deque.length > head && values[deque[deque.length - 1]!]! >= val) {
      deque.pop();
    }
    deque.push(i);

    if (i >= p - 1) {
      out[i] = values[deque[head]!]!;
    }
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

/** Fill leading/interior nulls with the previous known value (or backfilled first valid value). */
export function fillForward(values: SeriesValue[], fallback = 0): number[] {
  const firstNonNull = values.find((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
  const initial = firstNonNull !== undefined ? firstNonNull : fallback;
  const out: number[] = Array.from<number>({ length: values.length });
  let last = initial;
  for (let i = 0; i < values.length; i++) {
    const v = values[i] ?? null;
    if (v !== null && Number.isFinite(v)) last = v;
    out[i] = last;
  }
  return out;
}

/** Round to `precision` decimals so outputs stay deterministic across runs. */
export function round(values: SeriesValue[], precision = 6): SeriesValue[] {
  const f = 10 ** precision;
  return values.map((v) => (v === null ? null : Math.round(v * f) / f));
}

/** Weighted moving average: linear weights, most recent sample weighted `period`. */
export function wma(values: number[], period: number): SeriesValue[] {
  const out: SeriesValue[] = Array.from({ length: values.length }, () => null);
  const denom = (period * (period + 1)) / 2;
  if (period <= 0) return out;
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += values[i - j]! * (period - j);
    out[i] = sum / denom;
  }
  return out;
}

/** Hull MA: WMA(2*WMA(n/2) - WMA(n), sqrt(n)). Responsive with little lag. */
export function hma(values: number[], period: number): SeriesValue[] {
  const half = Math.max(1, Math.floor(period / 2));
  const sqrtP = Math.max(1, Math.round(Math.sqrt(period)));
  const raw = map2(wma(values, half), wma(values, period), (a, b) => 2 * a - b);
  // Map2 output feeds WMA; nulls become 0 so the window math stays aligned.
  return wma(fillForward(raw), sqrtP).map((v, i) => (i < period - 1 + sqrtP - 1 ? null : v));
}

/** Arnaud Legoux MA — gaussian-weighted, configurable lag/sigma tradeoff. */
export function alma(values: number[], period: number, offset = 0.85, sigma = 6): SeriesValue[] {
  const out: SeriesValue[] = Array.from({ length: values.length }, () => null);
  if (period <= 0) return out;
  const m = offset * (period - 1);
  const s = period / sigma;
  let norm = 0;
  const weights: number[] = [];
  for (let j = 0; j < period; j++) {
    const w = Math.exp(-((j - m) ** 2) / (2 * s * s));
    weights.push(w);
    norm += w;
  }
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += values[i - j]! * weights[j]!;
    out[i] = sum / norm;
  }
  return out;
}

/** Zero-lag EMA: removes dominant-cycle lag by re-centering the input. */
export function zlema(values: number[], period: number): SeriesValue[] {
  const lag = Math.floor((period - 1) / 2);
  const src = values.map((v, i) => (i < lag ? v : 2 * v - values[i - lag]!));
  return ema(src, period);
}

/** Least-squares slope over a trailing `period` window, per bar. */
export function linregSlope(values: number[], period: number): SeriesValue[] {
  const out: SeriesValue[] = Array.from({ length: values.length }, () => null);
  if (period <= 1) return out;
  // Σx and Σx² are constants for a fixed window of x = 0..period-1.
  const sumX = (period * (period - 1)) / 2;
  const sumXX = (period * (period - 1) * (2 * period - 1)) / 6;
  const denom = period * sumXX - sumX * sumX;
  for (let i = period - 1; i < values.length; i++) {
    let sumY = 0;
    let sumXY = 0;
    for (let j = 0; j < period; j++) {
      const y = values[i - j]!;
      sumY += y;
      sumXY += j * y;
    }
    out[i] = (period * sumXY - sumX * sumY) / denom;
  }
  return out;
}

/** Sum of `values` over a rolling window. */
export function sumRolling(values: number[], period: number): SeriesValue[] {
  const out: SeriesValue[] = Array.from({ length: values.length }, () => null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum;
  }
  return out;
}

/** True when every element of `a` exceeds its partner in `b` (both warm). */
export function greater(a: SeriesValue[], b: SeriesValue[]): boolean[] {
  return a.map((x, i) => {
    const y = b[i] ?? null;
    return x !== null && y !== null && x > y;
  });
}

/** Cumulative sum, treating leading nulls as zero. */
export function cumSum(values: SeriesValue[]): number[] {
  let total = 0;
  return values.map((v) => {
    if (typeof v === "number") total += v;
    return total;
  });
}
