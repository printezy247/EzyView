import type { Candle } from "@ezyview/data-adapters";
import { volumeProfile } from "@ezyview/chart-engine";

const fmt = (v: number): string => v.toLocaleString(undefined, { maximumFractionDigits: Math.abs(v) < 10 ? 4 : 2 });

/**
 * Text alternative for the chart canvas: what a sighted user reads at a glance
 * (symbol, last price, change and range), plus the volume profile's point of
 * control when that overlay is on.
 */
export function summarizeChart(
  symbol: string,
  resolution: string,
  candles: readonly Candle[],
  withProfile = false,
): string {
  const head = `${symbol} ${resolution} chart`;
  const last = candles.at(-1);
  const first = candles[0];
  if (!last || !first) return `${head}, no data loaded.`;
  let high = Number.NEGATIVE_INFINITY;
  let low = Number.POSITIVE_INFINITY;
  for (const c of candles) {
    high = Math.max(high, c.high);
    low = Math.min(low, c.low);
  }
  const change = first.open !== 0 ? ((last.close - first.open) / first.open) * 100 : 0;
  const parts = [
    `${head}, ${candles.length} bars`,
    `last ${fmt(last.close)}`,
    `${change >= 0 ? "up" : "down"} ${Math.abs(change).toFixed(2)}% over the range`,
    `range ${fmt(low)} to ${fmt(high)}`,
  ];
  if (withProfile) {
    const profile = volumeProfile(candles);
    const poc = profile.rows[profile.poc];
    if (poc) parts.push(`volume point of control ${fmt((poc.low + poc.high) / 2)}`);
  }
  return `${parts.join(", ")}.`;
}
