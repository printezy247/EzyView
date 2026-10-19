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
});
