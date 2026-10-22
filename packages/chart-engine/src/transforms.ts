import type { Candle } from "@ezyview/data-adapters";

/**
 * Pure candle → chart-type transforms.
 *
 * Heikin Ashi keeps one bar per candle. Renko, Kagi and Point & Figure are
 * price-only: they emit a bar only when price moves far enough, so their output
 * is shorter than the input and carries the time of the candle that made it.
 */

/** Smoothed candles: each bar averages into the previous one. */
export function heikinAshi(candles: readonly Candle[]): Candle[] {
  const out: Candle[] = [];
  let prevOpen = 0;
  let prevClose = 0;
  candles.forEach((c, i) => {
    const close = (c.open + c.high + c.low + c.close) / 4;
    const open = i === 0 ? (c.open + c.close) / 2 : (prevOpen + prevClose) / 2;
    out.push({
      time: c.time,
      open,
      high: Math.max(c.high, open, close),
      low: Math.min(c.low, open, close),
      close,
      volume: c.volume,
    });
    prevOpen = open;
    prevClose = close;
  });
  return out;
}

/**
 * A box size sized to the market: the 14-bar average true range, rounded to a
 * 1/2/2.5/5 × 10ⁿ step so levels land on readable prices.
 */
export function autoBoxSize(candles: readonly Candle[], period = 14): number {
  const n = candles.length;
  if (n === 0) return 1;
  const from = Math.max(1, n - period);
  let sum = 0;
  let count = 0;
  for (let i = from; i < n; i++) {
    const c = candles[i]!;
    const prev = candles[i - 1]!.close;
    sum += Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
    count++;
  }
  const last = candles[n - 1]!;
  const atr = count > 0 ? sum / count : last.high - last.low;
  const raw = atr > 0 ? atr : Math.abs(last.close) * 0.01;
  return niceStep(raw > 0 ? raw : 1);
}

function niceStep(value: number): number {
  const exp = Math.floor(Math.log10(value));
  const base = 10 ** exp;
  const f = value / base;
  const m = f < 1.5 ? 1 : f < 2.25 ? 2 : f < 3.75 ? 2.5 : f < 7.5 ? 5 : 10;
  // Round off float noise such as 0.30000000000000004.
  return Number((m * base).toPrecision(6));
}

/** One price-only bar: a Renko brick or a Point & Figure column. */
export interface PriceBox {
  /** Time of the candle that completed this bar. */
  time: number;
  open: number;
  close: number;
  up: boolean;
}

/**
 * Close-based Renko. A brick prints each time the close travels one box past
 * the last brick; turning around needs two boxes, from the far end.
 */
/** Hard cap on bricks: a tiny box over a long history would otherwise print
 * millions of bricks and freeze the tab. */
const MAX_RENKO_BRICKS = 5000;

export function renko(candles: readonly Candle[], box: number): PriceBox[] {
  const out: PriceBox[] = [];
  if (candles.length === 0 || !(box > 0)) return out;
  const first = candles[0]!.close;
  for (const c of candles) {
    for (;;) {
      if (out.length >= MAX_RENKO_BRICKS) return out;
      const last = out.at(-1);
      const top = last ? Math.max(last.open, last.close) : first;
      const bottom = last ? Math.min(last.open, last.close) : first;
      if (c.close >= top + box) {
        out.push({ time: c.time, open: top, close: top + box, up: true });
      } else if (c.close <= bottom - box) {
        out.push({ time: c.time, open: bottom, close: bottom - box, up: false });
      } else break;
    }
  }
  return out;
}

/** One vertical Kagi line, from a reversal to the next. */
export interface KagiLine {
  time: number;
  start: number;
  end: number;
  /** Thick (yang) after breaking a prior shoulder; thin (yin) after a waist. */
  yang: boolean;
}

/**
 * Close-based Kagi. The line extends while price keeps going its way and turns
 * when it retraces by `reversal` from the extreme.
 */
export function kagi(candles: readonly Candle[], reversal: number): KagiLine[] {
  const out: KagiLine[] = [];
  if (candles.length === 0 || !(reversal > 0)) return out;
  let cur: KagiLine = { time: candles[0]!.time, start: candles[0]!.close, end: candles[0]!.close, yang: true };
  let dir = 0;
  for (const c of candles) {
    const p = c.close;
    if (dir === 0) {
      if (Math.abs(p - cur.start) >= reversal) {
        dir = p > cur.start ? 1 : -1;
        cur.end = p;
        cur.yang = dir > 0;
      }
    } else if (dir > 0 ? p > cur.end : p < cur.end) {
      cur.end = p;
    } else if (Math.abs(cur.end - p) >= reversal) {
      out.push(cur);
      cur = { time: c.time, start: cur.end, end: p, yang: cur.yang };
      dir = -dir;
    }
  }
  if (dir !== 0) out.push(cur);

  // Shoulder = top of the previous up line; waist = bottom of the previous down line.
  let shoulder = Number.POSITIVE_INFINITY;
  let waist = Number.NEGATIVE_INFINITY;
  let yang = out[0]?.yang ?? true;
  for (const line of out) {
    const up = line.end > line.start;
    if (up && line.end > shoulder) yang = true;
    if (!up && line.end < waist) yang = false;
    line.yang = yang;
    if (up) shoulder = line.end;
    else waist = line.end;
  }
  return out;
}

/**
 * Close-based Point & Figure. X columns rise, O columns fall; a new column
 * needs `reversal` boxes of retracement. `open`/`close` are the column's
 * bottom/top for X and top/bottom for O.
 */
export function pointAndFigure(candles: readonly Candle[], box: number, reversal = 3): PriceBox[] {
  const out: PriceBox[] = [];
  if (candles.length === 0 || !(box > 0)) return out;
  // Work in whole boxes so float drift never splits a level.
  const eps = 1e-9;
  const down = (p: number) => Math.floor(p / box + eps);
  const up = (p: number) => Math.ceil(p / box - eps);
  const start = down(candles[0]!.close);
  let col: { time: number; x: boolean; lo: number; hi: number } | null = null;

  for (const c of candles) {
    const p = c.close;
    if (!col) {
      if (down(p) >= start + 1) col = { time: c.time, x: true, lo: start, hi: down(p) };
      else if (up(p) <= start - 1) col = { time: c.time, x: false, lo: up(p), hi: start };
      continue;
    }
    if (col.x) {
      if (down(p) > col.hi) col.hi = down(p);
      else if (p <= (col.hi - reversal) * box + eps * box) {
        out.push(toBox(col, box));
        col = { time: c.time, x: false, lo: up(p), hi: col.hi - 1 };
      }
    } else if (up(p) < col.lo) {
      col.lo = up(p);
    } else if (p >= (col.lo + reversal) * box - eps * box) {
      out.push(toBox(col, box));
      col = { time: c.time, x: true, lo: col.lo + 1, hi: down(p) };
    }
  }
  if (col) out.push(toBox(col, box));
  return out;
}

function toBox(col: { time: number; x: boolean; lo: number; hi: number }, box: number): PriceBox {
  const lo = Number((col.lo * box).toPrecision(12));
  const hi = Number((col.hi * box).toPrecision(12));
  return col.x ? { time: col.time, open: lo, close: hi, up: true } : { time: col.time, open: hi, close: lo, up: false };
}

/**
 * Strictly increasing timestamps for bars that may share a source candle.
 *
 * Lightweight Charts rejects duplicate times. Price-only bars keep their source
 * candle's time for the axis label, nudged one second past the previous bar
 * when several came from the same candle.
 */
export function sequentialTimes(times: readonly number[]): number[] {
  const out: number[] = [];
  let prev = Number.NEGATIVE_INFINITY;
  for (const t of times) {
    const next = t > prev ? t : prev + 1;
    out.push(next);
    prev = next;
  }
  return out;
}

/** One horizontal slice of a volume profile. */
export interface ProfileRow {
  low: number;
  high: number;
  /** Total volume traded inside this price band. */
  volume: number;
  /** Portion of `volume` from candles that closed at or above their open. */
  upVolume: number;
}

export interface VolumeProfile {
  rows: ProfileRow[];
  /** Index of the point of control: the row with the most volume, or -1. */
  poc: number;
}

/**
 * Volume by price over `candles`, split into `rows` equal bands.
 *
 * Each candle's volume is spread evenly over its high–low range, so a long bar
 * contributes to every band it crossed rather than only its close.
 */
export function volumeProfile(candles: readonly Candle[], rows = 24): VolumeProfile {
  if (candles.length === 0 || rows < 1) return { rows: [], poc: -1 };
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const c of candles) {
    lo = Math.min(lo, c.low);
    hi = Math.max(hi, c.high);
  }
  const count = hi > lo ? rows : 1;
  const step = hi > lo ? (hi - lo) / count : 0;
  const out: ProfileRow[] = Array.from({ length: count }, (_, i) => ({
    low: lo + i * step,
    high: i === count - 1 ? hi : lo + (i + 1) * step,
    volume: 0,
    upVolume: 0,
  }));
  const rowOf = (p: number) => (step > 0 ? Math.min(count - 1, Math.max(0, Math.floor((p - lo) / step))) : 0);

  for (const c of candles) {
    if (!(c.volume > 0)) continue;
    const isUp = c.close >= c.open;
    const span = c.high - c.low;
    const first = rowOf(c.low);
    const last = rowOf(c.high);
    for (let i = first; i <= last; i++) {
      const row = out[i]!;
      const share =
        span > 0 ? (Math.min(c.high, row.high) - Math.max(c.low, row.low)) / span : 1 / (last - first + 1);
      const v = c.volume * Math.max(0, share);
      row.volume += v;
      if (isUp) row.upVolume += v;
    }
  }

  let poc = -1;
  out.forEach((row, i) => {
    if (row.volume > 0 && (poc < 0 || row.volume > out[poc]!.volume)) poc = i;
  });
  return { rows: out, poc };
}
