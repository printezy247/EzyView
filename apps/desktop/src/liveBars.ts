/**
 * Fold a live price into a bar series (pure; the chart polls and calls this).
 *
 * Inside the last bar's period the last bar's close/high/low move; once the
 * quote falls in a later period a new bar opens, aligned to the series' own
 * grid (not the epoch) so weekly/monthly bars keep the adapter's alignment.
 * Anything unusable returns the very same array, so callers can skip a redraw
 * with an identity check.
 */
import type { Candle } from "@ezyview/data-adapters";

/**
 * True when a tick lands at least one whole bar after the newest bar, i.e. bars
 * were missed (a dropped socket, a sleeping laptop). The caller refetches the
 * history instead of drawing a hole.
 */
export function hasBarGap(bars: readonly Candle[], time: number, stepSeconds: number): boolean {
  const last = bars.at(-1);
  return !!last && stepSeconds > 0 && Number.isFinite(time) && time >= last.time + 2 * stepSeconds;
}

export function mergeQuote(
  bars: readonly Candle[],
  price: number,
  time: number,
  stepSeconds: number,
  tickVolume = 0,
): Candle[] {
  const last = bars.at(-1);
  if (!last || !Number.isFinite(price) || price <= 0 || !Number.isFinite(time) || stepSeconds <= 0) {
    return bars as Candle[];
  }
  if (time < last.time) return bars as Candle[];
  const vol = Number.isFinite(tickVolume) && tickVolume > 0 ? tickVolume : 0;

  if (time < last.time + stepSeconds) {
    if (vol === 0 && price === last.close && price <= last.high && price >= last.low) return bars as Candle[];
    const updated: Candle = {
      ...last,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
      close: price,
      volume: last.volume + vol,
    };
    return [...bars.slice(0, -1), updated];
  }

  const periods = Math.floor((time - last.time) / stepSeconds);
  const opened: Candle = { time: last.time + periods * stepSeconds, open: price, high: price, low: price, close: price, volume: vol };
  return [...bars, opened];
}
