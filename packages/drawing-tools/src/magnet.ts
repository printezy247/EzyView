import type { MagnetMode, Point } from "./types.js";

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
