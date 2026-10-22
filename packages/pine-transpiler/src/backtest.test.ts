import { describe, expect, it } from "vitest";
import { backtest } from "./backtest.js";
import type { PineOrder } from "./runtime.js";

const order = (partial: Partial<PineOrder> & Pick<PineOrder, "action" | "barIndex">): PineOrder => ({
  side: "long",
  price: Number.NaN,
  qty: 1,
  ...partial,
});

/** A straight-line up then down, so a round trip has a knowable outcome. */
const CLOSE = [100, 101, 102, 103, 104, 103, 102, 101, 100];

describe("backtest", () => {
  it("fills a long entry and its close at the bar close", () => {
    const orders = [
      order({ action: "entry", barIndex: 1, side: "long", id: "L" }),
      order({ action: "close", barIndex: 4, id: "L" }),
    ];
    const result = backtest(orders, { close: CLOSE });

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({
      side: "long",
      entryPrice: 101,
      exitPrice: 104,
      entryBar: 1,
      exitBar: 4,
    });
    expect(result.trades[0]?.pnl).toBeCloseTo(3, 6);
  });

  it("computes PnL with the sign the side implies", () => {
    // Long from the peak, closed in the trough → a loss.
    const orders = [
      order({ action: "entry", barIndex: 4, side: "long", id: "L" }),
      order({ action: "close", barIndex: 8, id: "L" }),
    ];
    const result = backtest(orders, { close: CLOSE });
    expect(result.trades[0]?.pnl).toBeCloseTo(-4, 6);
  });

  it("flips a position when an entry repeats the same id", () => {
    const orders = [
      order({ action: "entry", barIndex: 1, side: "long", id: "L" }),
      order({ action: "entry", barIndex: 5, side: "short", id: "L" }),
      order({ action: "close", barIndex: 8, id: "L" }),
    ];
    const result = backtest(orders, { close: CLOSE });

    expect(result.trades).toHaveLength(2);
    expect(result.trades[0]).toMatchObject({ side: "long", exitBar: 5 });
    expect(result.trades[1]).toMatchObject({ side: "short", entryBar: 5, exitBar: 8 });
    // Short from 103 down to 100 is a gain.
    expect(result.trades[1]?.pnl).toBeCloseTo(3, 6);
  });

  it("marks still-open positions to the final close", () => {
    const orders = [order({ action: "entry", barIndex: 0, side: "long", id: "L" })];
    const result = backtest(orders, { close: CLOSE });

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]?.exitBar).toBe(CLOSE.length - 1);
    expect(result.trades[0]?.pnl).toBeCloseTo(0, 6);
  });

  it("honours an explicit quantity", () => {
    const orders = [
      order({ action: "entry", barIndex: 1, side: "long", qty: 10, id: "L" }),
      order({ action: "close", barIndex: 4, id: "L" }),
    ];
    const result = backtest(orders, { close: CLOSE });
    expect(result.trades[0]?.pnl).toBeCloseTo(30, 6);
  });

  it("close_all flattens every open position", () => {
    const orders = [
      order({ action: "entry", barIndex: 0, side: "long", id: "A" }),
      order({ action: "entry", barIndex: 0, side: "long", id: "B" }),
      order({ action: "close", barIndex: 3, id: "*" }),
    ];
    const result = backtest(orders, { close: CLOSE });

    expect(result.trades).toHaveLength(2);
    expect(result.trades.every((t) => t.exitBar === 3)).toBe(true);
  });

  it("skips orders on bars with no price", () => {
    const sparse = [100, Number.NaN, 102];
    const orders = [
      order({ action: "entry", barIndex: 1, side: "long", id: "L" }),
      order({ action: "close", barIndex: 2, id: "L" }),
    ];
    const result = backtest(orders, { close: sparse });
    // The entry had no price to fill at, so nothing opened and nothing closed.
    expect(result.trades).toHaveLength(0);
  });

  it("starts from the given cash and ends at initial plus PnL", () => {
    const orders = [
      order({ action: "entry", barIndex: 1, side: "long", id: "L" }),
      order({ action: "close", barIndex: 4, id: "L" }),
    ];
    const result = backtest(orders, { close: CLOSE, initialCash: 1_000 });

    expect(result.equity[0]).toBe(1_000);
    expect(result.finalEquity).toBeCloseTo(1_003, 6);
    expect(result.totalPnl).toBeCloseTo(3, 6);
  });

  it("reports win rate over closed trades", () => {
    const orders = [
      order({ action: "entry", barIndex: 0, side: "long", id: "W" }),
      order({ action: "close", barIndex: 4, id: "W" }), // +4
      order({ action: "entry", barIndex: 4, side: "long", id: "L" }),
      order({ action: "close", barIndex: 8, id: "L" }), // -4
    ];
    const result = backtest(orders, { close: CLOSE });

    expect(result.trades).toHaveLength(2);
    expect(result.winRate).toBeCloseTo(0.5, 6);
    expect(result.totalPnl).toBeCloseTo(0, 6);
  });

  it("reports a symmetric profit factor as 1", () => {
    const orders = [
      order({ action: "entry", barIndex: 0, side: "long", id: "W" }),
      order({ action: "close", barIndex: 4, id: "W" }),
      order({ action: "entry", barIndex: 4, side: "long", id: "L" }),
      order({ action: "close", barIndex: 8, id: "L" }),
    ];
    expect(backtest(orders, { close: CLOSE }).profitFactor).toBeCloseTo(1, 6);
  });

  it("uses a null profit factor when there are no losses", () => {
    const orders = [
      order({ action: "entry", barIndex: 0, side: "long", id: "W" }),
      order({ action: "close", barIndex: 4, id: "W" }),
    ];
    expect(backtest(orders, { close: CLOSE }).profitFactor).toBeNull();
  });

  it("measures drawdown from the equity peak", () => {
    const orders = [
      order({ action: "entry", barIndex: 0, side: "long", id: "W" }),
      order({ action: "close", barIndex: 4, id: "W" }),
      order({ action: "entry", barIndex: 4, side: "long", id: "L" }),
      order({ action: "close", barIndex: 8, id: "L" }),
    ];
    const result = backtest(orders, { close: CLOSE, initialCash: 1_000 });

    // Peaks at 1004, troughs back at 1000 → a 4/1004 drop.
    expect(result.maxDrawdown).toBeCloseTo(4 / 1004, 6);
  });

  it("returns an empty result for no orders", () => {
    const result = backtest([], { close: CLOSE, initialCash: 500 });

    expect(result.trades).toHaveLength(0);
    expect(result.finalEquity).toBe(500);
    expect(result.totalPnl).toBe(0);
    expect(result.winRate).toBe(0);
    expect(result.maxDrawdown).toBe(0);
    expect(result.equity).toHaveLength(CLOSE.length);
  });

  it("fills on next bar open when open is provided to prevent look-ahead bias", () => {
    const OPEN = [99, 100.5, 101.5, 102.5, 103.5, 102.5, 101.5, 100.5, 99.5];
    const orders = [
      order({ action: "entry", barIndex: 1, side: "long", id: "L" }),
      order({ action: "close", barIndex: 4, id: "L" }),
    ];
    // Entry generated on bar 1 fills at bar 2 open (101.5)
    // Close generated on bar 4 fills at bar 5 open (102.5)
    const result = backtest(orders, { close: CLOSE, open: OPEN });

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({
      side: "long",
      entryBar: 2,
      entryPrice: 101.5,
      exitBar: 5,
      exitPrice: 102.5,
    });
    expect(result.trades[0]?.pnl).toBeCloseTo(1.0, 6);
  });

  it("applies slippage and commission accurately", () => {
    const orders = [
      order({ action: "entry", barIndex: 1, side: "long", id: "L" }),
      order({ action: "close", barIndex: 4, id: "L" }),
    ];
    // Entry price = 101 + 0.1 slippage = 101.1
    // Exit price = 104 - 0.1 slippage = 103.9
    // Gross PnL = 103.9 - 101.1 = 2.8
    // Commission = $1 entry + $1 exit ($2 round trip) -> Net PnL = 0.8
    const result = backtest(orders, {
      close: CLOSE,
      slippage: 0.1,
      commission: 1,
    });

    expect(result.trades[0]?.entryPrice).toBeCloseTo(101.1, 4);
    expect(result.trades[0]?.exitPrice).toBeCloseTo(103.9, 4);
    expect(result.trades[0]?.pnl).toBeCloseTo(0.8, 4);
  });

  it("multiplies PnL by contractMultiplier for metals/forex", () => {
    const orders = [
      order({ action: "entry", barIndex: 1, side: "long", id: "Gold", qty: 2 }),
      order({ action: "close", barIndex: 4, id: "Gold" }),
    ];
    // Entry 101, Exit 104 -> Price move = $3.
    // Qty = 2, Multiplier = 100 (Gold oz) -> Gross PnL = 3 * 2 * 100 = $600.
    const result = backtest(orders, {
      close: CLOSE,
      contractMultiplier: 100,
    });

    expect(result.trades[0]?.pnl).toBeCloseTo(600, 4);
  });

  it("calculates Sharpe, Sortino, SQN, and consecutive losses", () => {
    // 3 trades: win (+3), loss (-1), loss (-2)
    const orders = [
      order({ action: "entry", barIndex: 0, side: "long", id: "T1" }),
      order({ action: "close", barIndex: 3, id: "T1" }), // pnl: 103 - 100 = +3
      order({ action: "entry", barIndex: 4, side: "long", id: "T2" }),
      order({ action: "close", barIndex: 5, id: "T2" }), // pnl: 103 - 104 = -1
      order({ action: "entry", barIndex: 6, side: "long", id: "T3" }),
      order({ action: "close", barIndex: 8, id: "T3" }), // pnl: 100 - 102 = -2
    ];
    const result = backtest(orders, { close: CLOSE });

    expect(result.trades).toHaveLength(3);
    expect(result.maxConsecutiveLosses).toBe(2);
    expect(result.sharpeRatio).toBeDefined();
    expect(result.sortinoRatio).toBeDefined();
    expect(result.sqn).toBeDefined();
    expect(result.avgWinLossRatio).toBeCloseTo(3 / 1.5, 2); // 3 win vs avg 1.5 loss = 2.0
  });
});
