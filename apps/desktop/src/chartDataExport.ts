/**
 * Chart bars → CSV / JSON for the Export menu.
 *
 * Pure: no store, no clock, no DOM. `Candle.time` is epoch seconds
 * (data-adapters `EpochSeconds`), so ISO 8601 UTC is `time * 1000`.
 */
import type { Candle } from "@ezyview/data-adapters";

const HEADER = "time,open,high,low,close,volume";

/** RFC 4180 with CRLF row endings; numbers are never quoted. */
export function candlesToCsv(bars: readonly Candle[]): string {
  const rows = [HEADER];
  for (const bar of bars) {
    rows.push(
      [new Date(bar.time * 1000).toISOString(), bar.open, bar.high, bar.low, bar.close, bar.volume].join(","),
    );
  }
  return rows.join("\r\n");
}

/** Pretty JSON envelope; `bars` keeps epoch-second times so it round-trips losslessly. */
export function candlesToJson(bars: readonly Candle[], meta: { symbol: string; resolution: string }): string {
  return JSON.stringify(
    { format: "ezyview-chart", version: 1, symbol: meta.symbol, resolution: meta.resolution, bars },
    null,
    2,
  );
}
