import type { Drawing, MagnetMode, Point } from "./types.js";
import { resolvedFibLevels } from "./fib.js";

/** The slice of a candle the magnet needs. */
export interface MagnetBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Weak magnet only grabs a click this close to a level, as a fraction of the
 * bar's high–low range. Strong magnet always snaps.
 */
export const WEAK_MAGNET_REACH = 0.35;

/** Index of the bar whose time is closest to `time`. Bars must be sorted by time. */
export function nearestBarIndex(bars: readonly MagnetBar[], time: number): number {
  if (bars.length === 0) return -1;
  let lo = 0;
  let hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid]!.time < time) lo = mid + 1;
    else hi = mid;
  }
  // `lo` is the first bar at or after `time`; the one before may be closer.
  if (lo > 0 && Math.abs(bars[lo - 1]!.time - time) <= Math.abs(bars[lo]!.time - time)) return lo - 1;
  return lo;
}

/**
 * Snap a clicked chart point to the nearest candle's open, high, low or close.
 *
 * The time always moves onto the nearest bar; the price moves onto the closest
 * OHLC level. In "weak" mode the point is left alone unless the click is within
 * {@link WEAK_MAGNET_REACH} of that level. "off" returns the point unchanged.
 */
export function snapToOhlc(point: Point, bars: readonly MagnetBar[], mode: MagnetMode): Point {
  if (mode === "off") return point;
  const index = nearestBarIndex(bars, point.time);
  if (index < 0) return point;
  const bar = bars[index]!;

  let best = bar.open;
  for (const level of [bar.high, bar.low, bar.close]) {
    if (Math.abs(level - point.price) < Math.abs(best - point.price)) best = level;
  }

  if (mode === "weak") {
    const range = bar.high - bar.low;
    if (Math.abs(best - point.price) > range * WEAK_MAGNET_REACH) return point;
  }
  return { time: bar.time, price: best };
}

/** A point on another drawing the magnet may grab. */
export interface ObjectSnap {
  time: number;
  price: number;
  /** Lower sorts first: anchor, edge/midpoint, fib, then free space. */
  priority: number;
}

/**
 * Candidates contributed by visible, unlocked drawings on the same chart: an
 * anchor outranks an edge or midpoint, which outranks a Fibonacci level. The
 * renderer draws these objects, so the magnet must not invent geometry the
 * user cannot see.
 */
export function objectSnapCandidates(drawings: readonly Drawing[]): ObjectSnap[] {
  const out: ObjectSnap[] = [];
  for (const drawing of drawings) {
    if (drawing.hidden || drawing.locked) continue;
    for (const point of drawing.points) out.push({ ...point, priority: 0 });
    for (let i = 1; i < drawing.points.length; i++) {
      const a = drawing.points[i - 1]!;
      const b = drawing.points[i]!;
      out.push({ time: (a.time + b.time) / 2, price: (a.price + b.price) / 2, priority: 1 });
    }
    if (drawing.tool === "fib_retracement" || drawing.tool === "fib_extension") {
      for (const level of resolvedFibLevels(drawing.points, drawing.style)) {
        out.push({ time: drawing.points[1]?.time ?? drawing.points[0]!.time, price: level.price, priority: 2 });
      }
    }
  }
  return out;
}

/**
 * Snap to another drawing when the pointer is close in price space, otherwise
 * leave the point for the candle magnet. `strong` always takes the nearest
 * candidate; `weak` only takes one inside a small fraction of the local price.
 */
export function snapToObjects(
  point: Point,
  drawings: readonly Drawing[],
  mode: MagnetMode,
): Point {
  if (mode === "off" || drawings.length === 0) return point;
  const candidates = objectSnapCandidates(drawings);
  if (candidates.length === 0) return point;
  let best: ObjectSnap | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate.price - point.price);
    if (
      distance < bestDistance ||
      (distance === bestDistance && best !== null && candidate.priority < best.priority)
    ) {
      best = candidate;
      bestDistance = distance;
    }
  }
  if (!best) return point;
  const reach = Math.max(Math.abs(point.price) * 0.0025, 1e-8);
  if (mode === "weak" && bestDistance > reach) return point;
  return { time: best.time, price: best.price };
}

/** Full magnet: object anchors/edges/fibs first, then the nearest candle OHLC. */
export function snapPoint(
  point: Point,
  bars: readonly MagnetBar[],
  drawings: readonly Drawing[],
  mode: MagnetMode,
): Point {
  if (mode === "off") return point;
  const onObject = snapToObjects(point, drawings, mode);
  if (onObject !== point) return onObject;
  return snapToOhlc(point, bars, mode);
}
