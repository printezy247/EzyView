import type { Candle } from "@ezyview/data-adapters";

export const MAX_TABLE_ROWS = 500;

export interface TableRow {
  time: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

/** `2026-10-21 12:00` in UTC (the same clock the CSV export uses). */
const stamp = (seconds: number): string => new Date(seconds * 1000).toISOString().slice(0, 16).replace("T", " ");

/** The newest `MAX_TABLE_ROWS` bars, newest first, formatted for display. */
export function tableRows(bars: readonly Candle[], precision: number): TableRow[] {
  const fixed = (n: number) => n.toFixed(precision);
  return bars
    .slice(-MAX_TABLE_ROWS)
    .reverse()
    .map((b) => ({
      time: stamp(b.time),
      open: fixed(b.open),
      high: fixed(b.high),
      low: fixed(b.low),
      close: fixed(b.close),
      volume: Math.round(b.volume).toLocaleString("en-US"),
    }));
}
