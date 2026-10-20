import { describe, expect, it } from "vitest";
import type { JournalEntry } from "@ezyview/journal";
import { dateKey } from "@ezyview/journal";
import { dayCounts, dayNetOn, dayNets, isDailyLossBreached, isDrawdownBreached } from "./journalUi";

/** Noon local on a fixed day avoids DST edge cases in dateKey. */
const noon = (y: number, m: number, d: number): number => Math.floor(new Date(y, m - 1, d, 12).getTime() / 1000);

const entry = (over: Partial<JournalEntry> & { entryTime: number }): JournalEntry => ({
  id: `e${over.entryTime}`,
  symbol: "EURUSD",
  side: "long",
  qty: 1,
  entryPrice: 1.1,
  ...over,
});

describe("dayNets / dayNetOn", () => {
  it("sums realized pnl per local day and skips open rows", () => {
    const a = noon(2026, 10, 20);
    const b = noon(2026, 10, 21);
    const entries = [
      entry({ entryTime: a, pnl: 10 }),
      entry({ entryTime: a + 3600, pnl: -4 }),
      entry({ entryTime: b, pnl: 2.5 }),
      entry({ entryTime: b, pnl: undefined }), // open — no pnl
    ];
    const nets = dayNets(entries);
    expect(nets.get(dateKey(a))).toBe(6);
    expect(nets.get(dateKey(b))).toBe(2.5);
    expect(dayNetOn(entries, a)).toBe(6);
    expect(dayNetOn(entries, noon(2026, 10, 22))).toBe(0);
  });

  it("counts every entry per day, including open ones", () => {
    const a = noon(2026, 10, 20);
    const counts = dayCounts([entry({ entryTime: a }), entry({ entryTime: a, pnl: undefined }), entry({ entryTime: a + 60 })]);
    expect(counts.get(dateKey(a))).toBe(3);
  });
});

describe("prop-firm breach checks", () => {
  it("breaches the daily loss only at or below −limit", () => {
    expect(isDailyLossBreached(-100, 100)).toBe(true);
    expect(isDailyLossBreached(-100.01, 100)).toBe(true);
    expect(isDailyLossBreached(-99.99, 100)).toBe(false);
    expect(isDailyLossBreached(10, 100)).toBe(false);
    expect(isDailyLossBreached(-100, undefined)).toBe(false);
    expect(isDailyLossBreached(-100, 0)).toBe(false);
  });

  it("breaches the drawdown at or over the limit", () => {
    expect(isDrawdownBreached(100, 100)).toBe(true);
    expect(isDrawdownBreached(150, 100)).toBe(true);
    expect(isDrawdownBreached(99.5, 100)).toBe(false);
    expect(isDrawdownBreached(50, undefined)).toBe(false);
    expect(isDrawdownBreached(50, 0)).toBe(false);
  });
});
