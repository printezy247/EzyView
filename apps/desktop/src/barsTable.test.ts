import { describe, expect, it } from "vitest";
import type { Candle } from "@ezyview/data-adapters";
import { MAX_TABLE_ROWS, tableRows } from "./barsTable";

const bar = (time: number, c: number): Candle => ({ time, open: c - 1, high: c + 1, low: c - 2, close: c, volume: 1234.5 });

describe("tableRows", () => {
  it("lists newest first with fixed decimals and a UTC timestamp", () => {
    const rows = tableRows([bar(Date.UTC(2026, 9, 20, 12) / 1000, 10), bar(Date.UTC(2026, 9, 21, 12) / 1000, 20)], 2);
    expect(rows[0]).toEqual({ time: "2026-10-21 12:00", open: "19.00", high: "21.00", low: "18.00", close: "20.00", volume: "1,235" });
    expect(rows[1]!.time).toBe("2026-10-20 12:00");
  });

  it("caps the rows, keeping the newest", () => {
    const bars = Array.from({ length: MAX_TABLE_ROWS + 50 }, (_, i) => bar(1_700_000_000 + i * 60, i + 10));
    const rows = tableRows(bars, 2);
    expect(rows).toHaveLength(MAX_TABLE_ROWS);
    expect(rows[0]!.close).toBe((MAX_TABLE_ROWS + 49 + 10).toFixed(2));
  });

  it("returns nothing for no bars", () => {
    expect(tableRows([], 2)).toEqual([]);
  });
});
