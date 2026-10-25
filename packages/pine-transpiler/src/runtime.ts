import {
  change,
  ema,
  fillForward,
  highest,
  lowest,
  map2,
  rma,
  sma,
  stdev,
  trueRange,
  wma,
} from "@ezyview/indicators";
import type { SeriesValue } from "@ezyview/indicators";

/** The `na` sentinel. Distinct from `null`/`undefined` so `nz()` can see it. */
export const NA: unique symbol = Symbol.for("pine.na");

export type PineValue = number | string | boolean | typeof NA | PineValue[];

export interface Context {
  /** Full bar series for the current run. */
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  /** Mid-price series (`hl2`/`hlc3`/`ohlc4`); `runPine` derives them from OHLC. */
  hl2?: number[];
  hlc3?: number[];
  ohlc4?: number[];
  /** Bar index of the bar currently being evaluated. */
  barIndex: number;
  /** User inputs declared with `input.*`, keyed by call site id. */
  inputs: Record<string, PineValue>;
}

export const isNa = (v: PineValue | undefined): boolean => v === NA || v === undefined || v === null;

/** Coerce a Pine value to a number, treating `na` as 0. */
export function nz(value: PineValue | undefined, fallback = 0): number {
  return isNa(value) ? fallback : (value as number);
}

function toNumber(v: PineValue): number {
  if (isNa(v)) return NaN;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  return Number.NaN;
}

/** Per-element binary op that propagates `na`. */
function series2(
  a: PineValue | PineValue[],
  b: PineValue | PineValue[],
  fn: (x: number, y: number) => number,
): PineValue[] {
  const av = Array.isArray(a) ? a : null;
  const bv = Array.isArray(b) ? b : null;
  const len = Math.max(av?.length ?? 0, bv?.length ?? 0);
  const out: PineValue[] = Array.from({ length: len }, () => NA);
  for (let i = 0; i < len; i++) {
    const x = av ? av[i] : a;
    const y = bv ? bv[i] : b;
    if (isNa(x as PineValue) || isNa(y as PineValue)) continue;
    out[i] = fn(toNumber(x as PineValue), toNumber(y as PineValue));
  }
  return out;
}

const taCache = new WeakMap<object, Map<string, PineValue[]>>();

function memoizeTa(fnName: string, src: PineValue[], period: number, compute: () => PineValue[]): PineValue[] {
  if (typeof src !== "object" || src === null) return compute();
  let cache = taCache.get(src);
  if (!cache) {
    cache = new Map();
    taCache.set(src, cache);
  }
  const key = `${fnName}:${period}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const result = compute();
  cache.set(key, result);
  return result;
}

/** Wrap a helper so it accepts Pine's `SeriesValue[]` and returns one. */
function wrap(name: string, fn: (values: number[], period: number) => SeriesValue[]) {
  return (src: PineValue[], length: number): PineValue[] => {
    const period = Math.max(1, Math.floor(length));
    return memoizeTa(name, src, period, () => {
      const values = src.map((v) => (isNa(v) ? Number.NaN : toNumber(v)));
      return fn(values, period) as PineValue[];
    });
  };
}

const series1 = (src: PineValue[], fn: (v: number) => number): PineValue[] =>
  src.map((v) => (isNa(v) ? NA : fn(toNumber(v))));

/** Every `ta.*` function the transpiler exposes. */
export const ta = {
  sma: wrap("sma", sma),
  ema: wrap("ema", ema),
  rma: wrap("rma", rma),
  wma: wrap("wma", wma),
  stdev: wrap("stdev", stdev),
  hma: (src: PineValue[], length: number): PineValue[] => {
    const period = Math.max(1, Math.floor(length));
    return memoizeTa("hma", src, period, () => {
      const values = src.map((v) => (isNa(v) ? Number.NaN : toNumber(v)));
      const half = Math.max(1, Math.floor(period / 2));
      const sqrtLen = Math.max(1, Math.round(Math.sqrt(period)));
      const a = wma(values, half) as number[];
      const b = wma(values, period) as number[];
      const diff = a.map((x, i) => 2 * x - (b[i] ?? Number.NaN));
      const smoothed = wma(fillForward(diff.map((v) => (Number.isNaN(v) ? null : v))), sqrtLen) as number[];
      return smoothed.map((v) => (Number.isNaN(v) ? NA : v));
    });
  },
  highest: (src: PineValue[], length: number): PineValue[] => {
    const period = Math.max(1, Math.floor(length));
    return memoizeTa("highest", src, period, () => {
      const values = src.map((v) => (isNa(v) ? Number.NaN : toNumber(v)));
      return highest(values, period) as PineValue[];
    });
  },
  lowest: (src: PineValue[], length: number): PineValue[] => {
    const period = Math.max(1, Math.floor(length));
    return memoizeTa("lowest", src, period, () => {
      const values = src.map((v) => (isNa(v) ? Number.NaN : toNumber(v)));
      return lowest(values, period) as PineValue[];
    });
  },
  change: (src: PineValue[], length = 1): PineValue[] => {
    const period = Math.max(1, Math.floor(length));
    return memoizeTa("change", src, period, () => {
      const values = src.map((v) => (isNa(v) ? Number.NaN : toNumber(v)));
      return change(values, period) as PineValue[];
    });
  },
  tr: (_ctx: Context): PineValue[] => {
    const data = { open: _ctx.open, high: _ctx.high, low: _ctx.low, close: _ctx.close, volume: _ctx.volume };
    return trueRange(data).map((v) => (Number.isNaN(v) ? NA : v));
  },
  atr: (ctx: Context, length: number): PineValue[] => {
    const data = { open: ctx.open, high: ctx.high, low: ctx.low, close: ctx.close, volume: ctx.volume };
    return wrap("rma", rma)(trueRange(data), length);
  },
  rsi: (src: PineValue[], length: number): PineValue[] => {
    const period = Math.max(1, Math.floor(length));
    return memoizeTa("rsi", src, period, () => {
      const values = src.map((v) => (isNa(v) ? Number.NaN : toNumber(v)));
      const deltas = change(values, 1).map((v) => v ?? 0);
      const gains = deltas.map((v) => (v > 0 ? v : 0));
      const losses = deltas.map((v) => (v < 0 ? -v : 0));
      return map2(rma(gains, period), rma(losses, period), (g, l) =>
        l === 0 ? 100 : 100 - 100 / (1 + g / l),
      ) as PineValue[];
    });
  },
  crossover: (a: PineValue[], b: PineValue | PineValue[]): PineValue[] => {
    const bv = Array.isArray(b) ? b : Array.from({ length: a.length }, () => b);
    const out: PineValue[] = Array.from({ length: a.length }, () => false);
    for (let i = 1; i < a.length; i++) {
      const prevA = a[i - 1];
      const prevB = bv[i - 1];
      if (isNa(prevA as PineValue) || isNa(prevB as PineValue) || isNa(a[i]!) || isNa(bv[i]!)) continue;
      out[i] = toNumber(prevA as PineValue) <= toNumber(prevB as PineValue) && toNumber(a[i]!) > toNumber(bv[i]!);
    }
    return out;
  },
  crossunder: (a: PineValue[], b: PineValue | PineValue[]): PineValue[] => {
    const bv = Array.isArray(b) ? b : Array.from({ length: a.length }, () => b);
    const out: PineValue[] = Array.from({ length: a.length }, () => false);
    for (let i = 1; i < a.length; i++) {
      const prevA = a[i - 1];
      const prevB = bv[i - 1];
      if (isNa(prevA as PineValue) || isNa(prevB as PineValue) || isNa(a[i]!) || isNa(bv[i]!)) continue;
      out[i] = toNumber(prevA as PineValue) >= toNumber(prevB as PineValue) && toNumber(a[i]!) < toNumber(bv[i]!);
    }
    return out;
  },
  cross: (a: PineValue[], b: PineValue | PineValue[]): PineValue[] =>
    series2(ta.crossover(a, b), ta.crossunder(a, b), (x, y) => (x || y ? 1 : 0)).map((v) => v !== NA && v !== 0),
};

/** Every `math.*` function. Scalars stay scalar; series map elementwise. */
export const math = {
  abs: (v: PineValue | PineValue[]): PineValue | PineValue[] =>
    Array.isArray(v) ? series1(v, Math.abs) : Math.abs(toNumber(v)),
  max: (...args: (PineValue | PineValue[])[]): PineValue | PineValue[] => reduce2(args, Math.max),
  min: (...args: (PineValue | PineValue[])[]): PineValue | PineValue[] => reduce2(args, Math.min),
  round: (v: PineValue | PineValue[]): PineValue | PineValue[] =>
    Array.isArray(v) ? series1(v, Math.round) : Math.round(toNumber(v)),
  floor: (v: PineValue | PineValue[]): PineValue | PineValue[] =>
    Array.isArray(v) ? series1(v, Math.floor) : Math.floor(toNumber(v)),
  ceil: (v: PineValue | PineValue[]): PineValue | PineValue[] =>
    Array.isArray(v) ? series1(v, Math.ceil) : Math.ceil(toNumber(v)),
  sqrt: (v: PineValue | PineValue[]): PineValue | PineValue[] =>
    Array.isArray(v) ? series1(v, Math.sqrt) : Math.sqrt(toNumber(v)),
  pow: (a: PineValue | PineValue[], b: PineValue | PineValue[]): PineValue | PineValue[] =>
    binaryScalarOrSeries(a, b, (x, y) => x ** y),
  log: (v: PineValue | PineValue[]): PineValue | PineValue[] =>
    Array.isArray(v) ? series1(v, Math.log) : Math.log(toNumber(v)),
  log10: (v: PineValue | PineValue[]): PineValue | PineValue[] =>
    Array.isArray(v) ? series1(v, Math.log10) : Math.log10(toNumber(v)),
  exp: (v: PineValue | PineValue[]): PineValue | PineValue[] =>
    Array.isArray(v) ? series1(v, Math.exp) : Math.exp(toNumber(v)),
  sign: (v: PineValue | PineValue[]): PineValue | PineValue[] =>
    Array.isArray(v) ? series1(v, Math.sign) : Math.sign(toNumber(v)),
  avg: (...args: (PineValue | PineValue[])[]): PineValue | PineValue[] => {
    const n = args.length || 1;
    return reduce2(args, (a, b) => a + b, (v) => v / n);
  },
  sum: (src: PineValue[], length: number): PineValue[] => {
    const out: PineValue[] = Array.from({ length: src.length }, () => NA);
    let total = 0;
    for (let i = 0; i < src.length; i++) {
      const v = src[i]!;
      total += isNa(v) ? 0 : toNumber(v);
      if (i >= length) {
        const old = src[i - length]!;
        total -= isNa(old) ? 0 : toNumber(old);
      }
      if (i >= length - 1) out[i] = total;
    }
    return out;
  },
};

function reduce2(
  args: (PineValue | PineValue[])[],
  fn: (a: number, b: number) => number,
  post?: (v: number) => number,
): PineValue | PineValue[] {
  const seriesArgs = args.filter(Array.isArray) as PineValue[][];
  // `Array.reduce` forwards (acc, cur, index, array) — four args. Handing those
  // straight to `Math.max`/`Math.min` coerces the trailing array to `NaN` and
  // poisons the result, so the reducer is clamped to two operands.
  const reduce = (nums: number[]): number => nums.reduce((a, b) => fn(a, b));
  if (seriesArgs.length === 0) {
    // Pine propagates `na` through every math fn — `math.max(na, 1000)` is `na`.
    if (args.some((v) => isNa(v as PineValue))) return NA;
    const total = reduce(args.map((v) => toNumber(v as PineValue)));
    return post ? post(total) : total;
  }
  const len = Math.max(...seriesArgs.map((s) => s.length));
  const out: PineValue[] = Array.from({ length: len }, () => NA);
  for (let i = 0; i < len; i++) {
    const vals = args.map((a) => (Array.isArray(a) ? a[i] : a) as PineValue);
    // Any `na` operand makes the whole result `na` at this bar.
    if (vals.some((v) => isNa(v))) continue;
    const total = reduce(vals.map((v) => toNumber(v)));
    out[i] = post ? post(total) : total;
  }
  return out;
}

function binaryScalarOrSeries(
  a: PineValue | PineValue[],
  b: PineValue | PineValue[],
  fn: (x: number, y: number) => number,
): PineValue | PineValue[] {
  if (Array.isArray(a) || Array.isArray(b)) return series2(a, b, fn);
  return fn(toNumber(a), toNumber(b));
}

/** `color.*` constants used by `plot()` and `plotshape()`. */
export const color = {  red: "#ef5350",
  green: "#26a69a",
  blue: "#2962ff",
  orange: "#ff9800",
  purple: "#9c27b0",
  yellow: "#ffeb3b",
  teal: "#00bcd4",
  black: "#000000",
  white: "#ffffff",
  gray: "#787b86",
  silver: "#d1d4dc",
  new: (base: string, transp: number): string => {
    // Pine's second argument is transparency, not opacity: 0 is solid and
    // 100 is invisible. Feeding it straight through paints the opposite.
    const opacity = 100 - Math.max(0, Math.min(100, transp));
    return hexToRgba(base, Math.round(opacity * 2.55));
  },
};

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${(alpha / 255).toFixed(3)})`;
}

/** `shape.*` — marker glyphs for `plotshape()`. Values are the marker style. */
export const shape = {
  cross: "cross",
  xcross: "xcross",
  circle: "circle",
  triangleup: "triangleup",
  trailedtriangleup: "triangleup",
  triangledown: "triangledown",
  arrowup: "arrowup",
  arrowdown: "arrowdown",
  labelup: "labelup",
  labeldown: "labeldown",
  square: "square",
  diamond: "diamond",
} as const;

/** `location.*` — where a `plotshape()` marker sits relative to the bar. */
export const location = {
  abovebar: "abovebar",
  belowbar: "belowbar",
  top: "top",
  bottom: "bottom",
  absolute: "absolute",
} as const;

/** `size.*` — marker sizes for `plotshape()`. */
export const size = {
  auto: "auto",
  tiny: "tiny",
  small: "small",
  normal: "normal",
  large: "large",
} as const;

/** One recorded `plot()`/`plotshape()` output. */
export interface PinePlot {
  title: string;
  values: PineValue[];
  color: string;
  linewidth: number;
  style: "line" | "histogram" | "cross" | "shape" | "circle" | "triangle";
  /** `overlay=false` puts the plot in its own pane. */
  overlay: boolean;
}

/** One recorded `strategy.entry()`/`close()` order intent. */
export interface PineOrder {
  side: "long" | "short";
  action: "entry" | "exit" | "close";
  barIndex: number;
  price: number;
  qty: number;
  id?: string;
  stop?: number;
  limit?: number;
  trail?: { points?: number; offset?: number };
  fromEntry?: string;
  oca?: string;
}

/** Mutable sink the compiled script writes into. */
export interface PineOutput {
  plots: PinePlot[];
  orders: PineOrder[];
}
