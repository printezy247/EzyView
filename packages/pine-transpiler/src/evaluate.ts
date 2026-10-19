import { color, location, NA, isNa, math, nz, shape, size, ta } from "./runtime.js";
import type { Context, PineOrder, PineOutput, PinePlot, PineValue } from "./runtime.js";
import { transpile } from "./transpile.js";
import type { ScriptOptions } from "./transpile.js";

export interface PineResult extends PineOutput {
  options: ScriptOptions;
  /** Highest bar index any plot wrote to, for axis alignment. */
  barIndexUsed: number;
}

/**
 * Run Pine source over one symbol's bars.
 *
 * The transpiled body is evaluated inside a `with`-free scope by constructing
 * a function whose parameter names are the helpers the emitter emits. That
 * keeps the generated code readable and avoids an interpreter loop.
 */
/** Shape of the object the generated script body returns. */
interface EmittedResult extends PineOutput {
  barIndexUsed: number;
}

export function runPine(source: string, ctx: Context): PineResult {
  const { code, options } = transpile(source);
  const factory = new Function(
    "helpers",
    `"use strict";
     const {
       NA, isNa, nz, ta, math, color, strategy, shape, location, size,
       add, sub, mul, div, mod, eq, ne, lt, le, gt, ge, and, or,
       truthy, num, at, plotCall, shapeCall, bgcolorCall, inputCall, inputScalar,
       strategyEntry, strategyClose, strategyExit, strategyCloseAll,
     } = helpers;
     let barIndexUsed = 0;
     return function (ctx) {
       ${code}
     };`,
  ) as (h: unknown) => (ctx: Context) => EmittedResult;

  const fn = factory(buildHelpers());
  const out = fn(ctx);
  return { plots: out.plots, orders: out.orders, options, barIndexUsed: out.barIndexUsed ?? 0 };
}

/**
 * Scalar-or-series arithmetic.
 *
 * Pine operators broadcast: `close * 2` is a series, `2 * 2` is a scalar, and
 * `series + scalar` maps. `na` propagates through every op.
 */
function broadcast(
  a: PineValue | PineValue[],
  b: PineValue | PineValue[],
  fn: (x: number, y: number) => number,
): PineValue | PineValue[] {
  const aIsSeries = Array.isArray(a);
  const bIsSeries = Array.isArray(b);
  if (!aIsSeries && !bIsSeries) {
    if (isNa(a) || isNa(b)) return NA;
    return fn(num(a), num(b));
  }
  const len = aIsSeries ? (a as PineValue[]).length : (b as PineValue[]).length;
  const out: PineValue[] = Array.from({ length: len }, () => NA);
  for (let i = 0; i < len; i++) {
    const x = aIsSeries ? (a as PineValue[])[i] : a;
    const y = bIsSeries ? (b as PineValue[])[i] : b;
    if (isNa(x as PineValue) || isNa(y as PineValue)) continue;
    out[i] = fn(num(x as PineValue), num(y as PineValue));
  }
  return out;
}

function map1(v: PineValue | PineValue[], fn: (x: number) => number): PineValue | PineValue[] {
  if (!Array.isArray(v)) return isNa(v) ? NA : fn(num(v));
  return v.map((x) => (isNa(x) ? NA : fn(num(x))));
}

/** Truthiness of a single value: `na` is falsy, and 0 is falsy like Pine's convention. */
function truthy(v: PineValue | PineValue[], barIndex?: number): boolean {
  if (Array.isArray(v)) return truthy(barIndex === undefined ? (v[v.length - 1] ?? NA) : (v[barIndex] ?? NA));
  if (isNa(v)) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0;
  return false;
}

function num(v: PineValue | PineValue[]): number {
  if (Array.isArray(v)) return num(v[v.length - 1] ?? NA);
  if (isNa(v)) return Number.NaN;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  return Number.NaN;
}

/** Series offset: `src[1]` is the previous bar, `src[-1]` the next. */
function at(src: PineValue | PineValue[], offset: PineValue | PineValue[], barIndex: number): PineValue {
  if (!Array.isArray(src)) return NA;
  const off = Math.trunc(num(offset));
  const idx = barIndex - off;
  if (idx < 0 || idx >= src.length) return NA;
  return src[idx] ?? NA;
}

function eq(a: PineValue | PineValue[], b: PineValue | PineValue[]): PineValue | PineValue[] {
  return broadcast(a, b, (x, y) => (x === y ? 1 : 0));
}

/** Index a series at the bar currently being evaluated, or pass scalars through. */
function atBar(v: PineValue | PineValue[], barIndex: number): PineValue {
  return Array.isArray(v) ? (v[barIndex] ?? NA) : v;
}

/** Comparison helpers collapse to a scalar on the current bar. */
function compare(
  a: PineValue | PineValue[],
  b: PineValue | PineValue[],
  fn: (x: number, y: number) => boolean,
  barIndex: number,
): boolean {
  const av = atBar(a, barIndex);
  const bv = atBar(b, barIndex);
  if (isNa(av) || isNa(bv)) return false;
  return fn(num(av), num(bv));
}

function and(a: PineValue | PineValue[], b: PineValue | PineValue[], barIndex: number): boolean {
  return truthy(atBar(a, barIndex)) && truthy(atBar(b, barIndex));
}

function or(a: PineValue | PineValue[], b: PineValue | PineValue[], barIndex: number): boolean {
  return truthy(atBar(a, barIndex)) || truthy(atBar(b, barIndex));
}

/**
 * Get-or-create the plot entry for a call site, so per-bar writes land in one
 * series.
 *
 * The script body runs once per bar, so a `plot()` call fires every bar. When
 * the argument is a full series array (`plot(close)`) it is stored once on
 * first sight. When it is a per-bar scalar (`plot(x)` inside the loop) each
 * bar writes its own slot, which is what accumulates the series.
 *
 * Sites are keyed by the emitter's compile-time id, not by title: a title
 * derived from `plots.length` would shift as plots accumulate and defeat the
 * dedupe.
 */
function ensurePlot(
  plots: PinePlot[],
  site: number,
  title: string | undefined,
  barIndex: number,
  series: PineValue | PineValue[],
  base: Omit<PinePlot, "title" | "values">,
): PinePlot {
  // One entry per call site; the site index fixes its position in the array.
  let plot = plots[site];
  if (!plot) {
    plot = { title: title ?? `Plot ${site + 1}`, values: [], ...base };
    plots[site] = plot;
  }
  if (Array.isArray(series)) {
    // A full series argument is complete on first sight.
    if (plot.values.length === 0) plot.values = series;
  } else {
    plot.values[barIndex] = series;
  }
  return plot;
}

/** Keyword arguments the emitter parked in the fixed options slot. */
type Kwargs = Record<string, PineValue>;

/** A named keyword argument as a string, or `undefined` when absent/`na`. */
function optStr(kwargs: Kwargs, name: string): string | undefined {
  const value = kwargs[name];
  return typeof value === "string" ? value : undefined;
}

/** `plot()` — record one series. Extra args follow Pine's positional order. */
function plotCall(
  site: number,
  barIndex: number,
  plots: PinePlot[],
  kwargs: Kwargs,
  series: PineValue | PineValue[],
  title?: string,
  plotColor?: string,
  lineWidth?: PineValue,
  plotStyle?: string,
  _editable?: PineValue,
  _showLast?: PineValue,
  fillTo?: PineValue,
  _trackPrice?: PineValue,
  _display?: PineValue,
): void {
  void fillTo;
  // Positional wins; `plot(x, "T", color=…)` is the common way to override.
  const resolvedColor = plotColor ?? optStr(kwargs, "color");
  const width = lineWidth ?? kwargs.linewidth;
  const style = plotStyle ?? optStr(kwargs, "style");
  ensurePlot(plots, site, title ?? optStr(kwargs, "title"), barIndex, series, {
    color: typeof resolvedColor === "string" ? resolvedColor : "#2962ff",
    linewidth: width === undefined || isNa(width) ? 2 : Math.max(1, Math.trunc(num(width))),
    style: normalizeStyle(style),
    overlay: true,
  });
}

function normalizeStyle(style: string | undefined): PinePlot["style"] {
  switch (style) {
    case "histogram":
    case "cross":
    case "shape":
    case "circle":
    case "triangle":
      return style;
    default:
      return "line";
  }
}

/** `plotshape()` — a marker series; rendered as points on the chart. */
function shapeCall(
  site: number,
  barIndex: number,
  plots: PinePlot[],
  kwargs: Kwargs,
  series: PineValue | PineValue[],
  title?: string,
  _style?: string,
  markerLocation?: string,
  plotColor?: string,
  offset?: PineValue,
  _text?: string,
  _textcolor?: string,
  _size?: PineValue,
): void {
  void offset;
  const where = markerLocation ?? optStr(kwargs, "location");
  const resolvedColor = plotColor ?? optStr(kwargs, "color");
  // Shapes sit at the series value, or pinned to top/bottom by `location`.
  const pinned =
    where === "top"
      ? Number.MAX_SAFE_INTEGER
      : where === "bottom"
        ? -Number.MAX_SAFE_INTEGER
        : null;
  const shaped: PineValue | PineValue[] = Array.isArray(series)
    ? series.map((v) => (truthy(v) ? (pinned ?? (isNa(v) ? NA : num(v))) : NA))
    : truthy(series)
      ? (pinned ?? (isNa(series) ? NA : num(series)))
      : NA;
  ensurePlot(plots, site, title ?? optStr(kwargs, "title") ?? `Shape ${site + 1}`, barIndex, shaped, {
    color: typeof resolvedColor === "string" ? resolvedColor : "#2962ff",
    linewidth: 2,
    style: "shape",
    overlay: true,
  });
}

/** `bgcolor()` — paints the chart background where the condition is true. */
function bgcolorCall(
  site: number,
  barIndex: number,
  plots: PinePlot[],
  kwargs: Kwargs,
  condition: PineValue | PineValue[],
): void {
  const flagged: PineValue | PineValue[] = Array.isArray(condition)
    ? condition.map((v) => (truthy(v) ? 1 : NA))
    : truthy(condition)
      ? 1
      : NA;
  // Default to a faint blue unless `bgcolor(cond, color=…)` says otherwise.
  const named = optStr(kwargs, "color");
  ensurePlot(plots, site, `BG ${site + 1}`, barIndex, flagged, {
    color: typeof named === "string" ? named : color.new("#2962ff", 88),
    linewidth: 0,
    style: "histogram",
    overlay: true,
  });
}

/** `input.int()` / `input.float()` / `input.bool()` / `input.string()`. */
function inputCall(
  inputs: Record<string, PineValue>,
  kwargs: Kwargs,
  defval?: PineValue,
  title?: string,
  options?: PineValue,
  confirm?: PineValue,
  active?: PineValue,
  id?: string,
): PineValue {
  // Pine keys an input by `id` when given, else by declaration order.
  const key = id ?? optStr(kwargs, "id") ?? String(Object.keys(inputs).length);
  if (!(key in inputs)) inputs[key] = defval ?? kwargs.defval ?? NA;
  return inputs[key] ?? NA;
}

/** Bare `input(…)` — the v4 name, equivalent to `input.int`. */
function inputScalar(inputs: Record<string, PineValue>, kwargs: Kwargs, defval?: PineValue, title?: string): PineValue {
  return inputCall(inputs, kwargs, defval, title);
}

/**
 * The `strategy.*` namespace.
 *
 * `long`/`short` are just the direction strings Pine's `strategy.entry` expects;
 * the order fns themselves are wired in as helpers because they need the bar
 * index and the shared `orders` sink.
 */
const strategy = {
  long: "long",
  short: "short",
  direction: { long: "long", short: "short" },
};

/** `strategy.entry(id, direction)` — open (or flip to) a position. */
function strategyEntry(
  barIndex: number,
  orders: PineOrder[],
  kwargs: Kwargs,
  id?: string,
  direction?: PineValue,
): void {
  // `direction=` is current Pine; `long=true`/`short=true` are the legacy flags.
  const named =
    direction ??
    kwargs.direction ??
    (kwargs.long !== undefined ? "long" : kwargs.short !== undefined ? "short" : undefined);
  const side = String(named ?? "long") === "short" ? "short" : "long";
  const qty = kwargs.qty;
  orders.push({
    side: side as "long" | "short",
    action: "entry",
    barIndex,
    price: Number.NaN, // filled in by the tester from the bar's close
    qty: qty === undefined || isNa(qty) ? 1 : num(qty),
    id: id ?? optStr(kwargs, "id") ?? side,
  });
}

/** `strategy.close(id)` — flatten the named position. */
function strategyClose(barIndex: number, orders: PineOrder[], kwargs: Kwargs, id?: string): void {
  orders.push({
    side: "long",
    action: "close",
    barIndex,
    price: Number.NaN,
    qty: 0,
    id: id ?? optStr(kwargs, "id") ?? "",
  });
}

/** `strategy.exit(id, from_entry, profit=, stop=)` — attach an exit to an entry. */
function strategyExit(
  barIndex: number,
  orders: PineOrder[],
  kwargs: Kwargs,
  id?: string,
  fromEntry?: string,
): void {
  const stop = kwargs.stop;
  const profit = kwargs.profit;
  orders.push({
    side: "long",
    action: "exit",
    barIndex,
    price: Number.NaN,
    qty: stop !== undefined ? num(stop) : profit !== undefined ? num(profit) : 0,
    id: fromEntry ?? id ?? optStr(kwargs, "id") ?? "",
  });
}

/** `strategy.close_all()` — flatten everything. */
function strategyCloseAll(barIndex: number, orders: PineOrder[], _kwargs: Kwargs): void {
  orders.push({ side: "long", action: "close", barIndex, price: Number.NaN, qty: 0, id: "*" });
}

function buildHelpers(): Record<string, unknown> {
  return {
    NA,
    isNa,
    nz,
    ta,
    math,
    color,
    shape,
    location,
    size,
    add: (a: PineValue | PineValue[], b: PineValue | PineValue[]) => broadcast(a, b, (x, y) => x + y),
    sub: (a: PineValue | PineValue[], b: PineValue | PineValue[]) => broadcast(a, b, (x, y) => x - y),
    mul: (a: PineValue | PineValue[], b: PineValue | PineValue[]) => broadcast(a, b, (x, y) => x * y),
    div: (a: PineValue | PineValue[], b: PineValue | PineValue[]) => broadcast(a, b, (x, y) => x / y),
    mod: (a: PineValue | PineValue[], b: PineValue | PineValue[]) => broadcast(a, b, (x, y) => x % y),
    eq,
    ne: (a: PineValue | PineValue[], b: PineValue | PineValue[]) => map1(eq(a, b) as PineValue[], (x) => (x ? 0 : 1)),
    lt: (a: PineValue | PineValue[], b: PineValue | PineValue[], barIndex: number) => compare(a, b, (x, y) => x < y, barIndex),
    le: (a: PineValue | PineValue[], b: PineValue | PineValue[], barIndex: number) => compare(a, b, (x, y) => x <= y, barIndex),
    gt: (a: PineValue | PineValue[], b: PineValue | PineValue[], barIndex: number) => compare(a, b, (x, y) => x > y, barIndex),
    ge: (a: PineValue | PineValue[], b: PineValue | PineValue[], barIndex: number) => compare(a, b, (x, y) => x >= y, barIndex),
    and,
    or,
    truthy,
    num,
    at,
    plotCall,
    shapeCall,
    bgcolorCall,
    inputCall,
    inputScalar,
    strategy,
    strategyEntry,
    strategyClose,
    strategyExit,
    strategyCloseAll,
  };
}
