import { describe, expect, it } from "vitest";
import { computeMaeMfe, computeStats } from "./stats";
import type { JournalEntry } from "./model";

const trade = (over: Partial<JournalEntry> = {}): JournalEntry => ({
  id: Math.random().toString(36).slice(2),
  symbol: "XAUUSD",
  side: "long",
  qty: 1,
  entryPrice: 100,
  entryTime: 1000,
  exitPrice: 110,
  exitTime: 1110,
  pnl: 10,
  ...over,
});

/** Epoch seconds for a given UTC hour on a fixed day (session bucketing). */
const atHour = (hour: number) => Date.UTC(2026, 0, 15, hour) / 1000;

describe("computeStats", () => {
  it("returns zeros for an empty journal", () => {
    const stats = computeStats([]);
    expect(stats).toMatchObject({
      trades: 0,
      winRate: 0,
      netPnl: 0,
      bySymbol: [],
      equitySeries: [],
      rMultiples: [],
      rDistribution: [],
      bySetup: [],
      byTag: [],
      byTimeOfDay: [],
    });
  });

  it("leaves every new aggregator empty when nothing is closed", () => {
    const stats = computeStats([
      trade({ pnl: undefined, exitTime: undefined, exitPrice: undefined, plannedRisk: 25, setup: "breakout", tags: ["trend"] }),
    ]);
    expect(stats).toMatchObject({
      trades: 0,
      equitySeries: [],
      rMultiples: [],
      rDistribution: [],
      bySetup: [],
      byTag: [],
      byTimeOfDay: [],
    });
  });

  it("ignores open trades when counting", () => {
    const stats = computeStats([trade({ pnl: undefined, exitTime: undefined, exitPrice: undefined })]);
    expect(stats.trades).toBe(0);
    expect(stats.netPnl).toBe(0);
  });

  it("splits wins, losses and break-even", () => {
    const stats = computeStats([trade({ pnl: 20 }), trade({ pnl: -5 }), trade({ pnl: 0 })]);
    expect(stats).toMatchObject({ trades: 3, wins: 1, losses: 1, breakeven: 1 });
    expect(stats.winRate).toBeCloseTo(1 / 3, 6);
    expect(stats.netPnl).toBe(15);
    expect(stats.grossProfit).toBe(20);
    expect(stats.grossLoss).toBe(-5);
    expect(stats.avgWin).toBe(20);
    expect(stats.avgLoss).toBe(-5);
    expect(stats.bestTrade).toBe(20);
    expect(stats.worstTrade).toBe(-5);
    expect(stats.profitFactor).toBeCloseTo(4, 6);
    expect(stats.expectancy).toBeCloseTo((1 / 3) * 20 - (2 / 3) * 5, 6);
  });

  it("never divides by zero on an all-winner streak", () => {
    const stats = computeStats([trade({ pnl: 5 }), trade({ pnl: 15 })]);
    expect(stats.profitFactor).toBe(Number.POSITIVE_INFINITY);
    expect(stats.avgLoss).toBe(0);
    expect(stats.expectancy).toBe(10);
  });

  it("measures the deepest peak-to-trough fall, not the worst trade", () => {
    const stats = computeStats([
      trade({ pnl: 100, entryTime: 1, exitTime: 2 }),
      trade({ pnl: -60, entryTime: 3, exitTime: 4 }),
      trade({ pnl: -60, entryTime: 5, exitTime: 6 }),
      trade({ pnl: 40, entryTime: 7, exitTime: 8 }),
    ]);
    // Peak 100 → trough −20 gives a 120 drawdown.
    expect(stats.maxDrawdown).toBe(120);
    expect(stats.netPnl).toBe(20);
  });

  it("orders the symbol breakdown by net P&L", () => {
    const stats = computeStats([
      trade({ symbol: "XAUUSD", pnl: 30 }),
      trade({ symbol: "XAUUSD", pnl: -10 }),
      trade({ symbol: "EURUSD", pnl: -50 }),
    ]);
    expect(stats.bySymbol.map((row) => row.symbol)).toEqual(["XAUUSD", "EURUSD"]);
    expect(stats.bySymbol[0]).toMatchObject({ trades: 2, netPnl: 20, winRate: 0.5 });
    expect(stats.bySymbol[1]).toMatchObject({ trades: 1, netPnl: -50, winRate: 0 });
  });

  it("computes R-multiples chronologically, skipping trades without positive risk", () => {
    const stats = computeStats([
      trade({ pnl: 30, plannedRisk: 10, entryTime: 5, exitTime: 6 }),
      trade({ pnl: -5, plannedRisk: 10, entryTime: 1, exitTime: 2 }),
      trade({ pnl: 15, plannedRisk: 0, entryTime: 3, exitTime: 4 }),
      trade({ pnl: 15, entryTime: 7, exitTime: 8 }),
    ]);
    expect(stats.rMultiples).toEqual([-0.5, 3]);
  });

  it("buckets R-multiples into the six fixed buckets, boundaries included", () => {
    const stats = computeStats([
      trade({ pnl: -30, plannedRisk: 10 }),
      trade({ pnl: -20, plannedRisk: 10 }),
      trade({ pnl: -15, plannedRisk: 10 }),
      trade({ pnl: -10, plannedRisk: 10 }),
      trade({ pnl: -5, plannedRisk: 10 }),
      trade({ pnl: 0, plannedRisk: 10 }),
      trade({ pnl: 5, plannedRisk: 10 }),
      trade({ pnl: 10, plannedRisk: 10 }),
      trade({ pnl: 15, plannedRisk: 10 }),
      trade({ pnl: 20, plannedRisk: 10 }),
      trade({ pnl: 30, plannedRisk: 10 }),
    ]);
    expect(stats.rDistribution.map((bucket) => bucket.label)).toEqual(["≤-2", "-2..-1", "-1..0", "0..1", "1..2", "≥2"]);
    expect(stats.rDistribution.map((bucket) => bucket.count)).toEqual([1, 2, 2, 2, 2, 2]);
  });

  it("keeps all six R buckets when closed trades carry no planned risk", () => {
    const stats = computeStats([trade({ pnl: 10 })]);
    expect(stats.rMultiples).toEqual([]);
    expect(stats.rDistribution.map((bucket) => bucket.count)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("builds the equity curve chronologically from every closed trade", () => {
    const stats = computeStats([
      trade({ pnl: 40, entryTime: 5, exitTime: 6 }),
      trade({ pnl: 100, entryTime: 1, exitTime: 2 }),
      trade({ pnl: -60, entryTime: 3, exitTime: 4 }),
    ]);
    expect(stats.equitySeries).toEqual([
      { time: 2, equity: 100 },
      { time: 4, equity: 40 },
      { time: 6, equity: 80 },
    ]);
  });

  it("groups by setup with the untagged fallback, ordered by net P&L", () => {
    const stats = computeStats([
      trade({ setup: "breakout", pnl: 40 }),
      trade({ setup: "breakout", pnl: -10 }),
      trade({ setup: "range", pnl: -5 }),
      trade({ pnl: 5 }),
    ]);
    expect(stats.bySetup.map((row) => row.setup)).toEqual(["breakout", "untagged", "range"]);
    expect(stats.bySetup[0]).toMatchObject({ trades: 2, netPnl: 30, winRate: 0.5 });
    expect(stats.bySetup[1]).toMatchObject({ trades: 1, netPnl: 5, winRate: 1 });
    expect(stats.bySetup[2]).toMatchObject({ trades: 1, netPnl: -5, winRate: 0 });
  });

  it("counts one row per tag and skips entries with no tags", () => {
    const stats = computeStats([
      trade({ tags: ["trend", "london"], pnl: 30 }),
      trade({ tags: ["trend"], pnl: -10 }),
      trade({ tags: ["news"], pnl: -20 }),
      trade({ pnl: 5 }),
    ]);
    expect(stats.byTag.map((row) => row.tag)).toEqual(["london", "trend", "news"]);
    expect(stats.byTag[0]).toMatchObject({ trades: 1, netPnl: 30, winRate: 1 });
    expect(stats.byTag[1]).toMatchObject({ trades: 2, netPnl: 20, winRate: 0.5 });
    expect(stats.byTag[2]).toMatchObject({ trades: 1, netPnl: -20, winRate: 0 });
  });

  it("buckets entries by the UTC session of entryTime", () => {
    const stats = computeStats([
      trade({ entryTime: atHour(0), pnl: 5 }),
      trade({ entryTime: atHour(6), pnl: 5 }),
      trade({ entryTime: atHour(7), pnl: -10 }),
      trade({ entryTime: atHour(11), pnl: 0 }),
      trade({ entryTime: atHour(12), pnl: 20 }),
      trade({ entryTime: atHour(16), pnl: 0 }),
      trade({ entryTime: atHour(17), pnl: -30 }),
      trade({ entryTime: atHour(23), pnl: 0 }),
    ]);
    expect(stats.byTimeOfDay.map((row) => row.period)).toEqual(["Overlap", "Asia", "London", "US"]);
    expect(stats.byTimeOfDay[0]).toMatchObject({ trades: 2, netPnl: 20, winRate: 0.5 });
    expect(stats.byTimeOfDay[1]).toMatchObject({ trades: 2, netPnl: 10, winRate: 1 });
    expect(stats.byTimeOfDay[2]).toMatchObject({ trades: 2, netPnl: -10, winRate: 0 });
    expect(stats.byTimeOfDay[3]).toMatchObject({ trades: 2, netPnl: -30, winRate: 0 });
  });

  it("omits sessions that had no trades", () => {
    const stats = computeStats([trade({ entryTime: atHour(3), pnl: 10 })]);
    expect(stats.byTimeOfDay).toEqual([{ period: "Asia", trades: 1, netPnl: 10, winRate: 1 }]);
  });

  it("computes MAE and MFE for long and short trades", () => {
    const longExcursion = computeMaeMfe({
      side: "long",
      entryPrice: 100,
      lowestPrice: 96,
      highestPrice: 110,
    });
    expect(longExcursion.mae).toBe(4);
    expect(longExcursion.mfe).toBe(10);

    const shortExcursion = computeMaeMfe({
      side: "short",
      entryPrice: 100,
      lowestPrice: 90,
      highestPrice: 103,
    });
    expect(shortExcursion.mae).toBe(3);
    expect(shortExcursion.mfe).toBe(10);
  });

  it("calculates average MAE and MFE in journal stats", () => {
    const stats = computeStats([
      trade({ pnl: 10, mae: 2, mfe: 12 }),
      trade({ pnl: -5, mae: 6, mfe: 2 }),
    ]);
    expect(stats.avgMae).toBe(4);
    expect(stats.avgMfe).toBe(7);
  });
});
