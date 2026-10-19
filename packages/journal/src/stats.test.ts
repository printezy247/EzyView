import { describe, expect, it } from "vitest";
import { computeStats } from "./stats";
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

describe("computeStats", () => {
  it("returns zeros for an empty journal", () => {
    const stats = computeStats([]);
    expect(stats).toMatchObject({ trades: 0, winRate: 0, netPnl: 0, bySymbol: [] });
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
});
