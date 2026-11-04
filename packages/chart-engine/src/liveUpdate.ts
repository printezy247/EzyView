import type { Candle } from "@ezyview/data-adapters";

/**
 * A live tick replaces the forming bar when its time did not change. A tick
 * whose time moved on opens a new bar, which the chart cannot express as a
 * single-series `update` without dropping the previous one.
 */
export function isFormingBarTick(previous: readonly Candle[], next: Candle): boolean {
  const last = previous.at(-1);
  return last !== undefined && last.time === next.time;
}

/**
 * Identity of the closed part of a series.
 *
 * Indicator values depend on every closed bar, not on the forming one. Keying
 * the cache on this identity keeps a tick that only moves the last bar from
 * recomputing the whole history: only a new bar (or an edit to a closed bar)
 * changes the key.
 */
export function closedBarKey(candles: readonly Candle[]): string {
  if (candles.length === 0) return "0|empty";
  const closed = candles.length - 1;
  if (closed === 0) return `0|open|${candles[0]!.time}`;
  const lastClosed = candles[closed - 1]!;
  return `${closed}|${lastClosed.time}|${lastClosed.open}|${lastClosed.high}|${lastClosed.low}|${lastClosed.close}|${lastClosed.volume}`;
}

/**
 * Cheap guard for the chart host: the series may take an in-place update only
 * when the bar already exists and its type is built one-candle-to-one-point.
 */
export function canUpdateFormingBar(
  previous: readonly Candle[],
  next: Candle,
  supported: boolean,
): boolean {
  return supported && isFormingBarTick(previous, next);
}
