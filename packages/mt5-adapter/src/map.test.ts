import { describe, expect, it } from "vitest";
import {
  closePositionArgs,
  isPending,
  marketOrderArgs,
  pendingOrderArgs,
  toAccount,
  toCandles,
  toDeals,
  toOrders,
  toPositions,
  toQuote,
  toSymbols,
  toTimeframe,
} from "./map";

/** One well-formed MT5 rate, for series tests. */
const rate = (time: number) => ({ time, open: 1, high: 2, low: 0.5, close: 1.5, tick_volume: 42 });

/** Order status reported for a given MT5 state code. */
const statusOfState = (value: number): string | undefined =>
  toOrders([{ ticket: 9, symbol: "EURUSD", type: 0, volume_initial: 1, price_open: 1, state: value, time_setup: 1 }])[0]
    ?.status;

describe("toTimeframe", () => {
  it("maps every chart resolution to an MT5 timeframe", () => {
    expect(toTimeframe("1m")).toBe("M1");
    expect(toTimeframe("5m")).toBe("M5");
    expect(toTimeframe("1h")).toBe("H1");
    expect(toTimeframe("4h")).toBe("H4");
    expect(toTimeframe("1D")).toBe("D1");
    expect(toTimeframe("1W")).toBe("W1");
    expect(toTimeframe("1M")).toBe("MN1");
  });

  it("falls back rather than failing on second-based intervals", () => {
    expect(toTimeframe("1s")).toBe("M1");
    expect(toTimeframe("1t")).toBe("M1");
  });
});

describe("toCandles", () => {
  it("accepts a bare array and reads tick_volume", () => {
    const candles = toCandles([rate(100), rate(200)]);
    expect(candles).toEqual([
      { time: 100, open: 1, high: 2, low: 0.5, close: 1.5, volume: 42 },
      { time: 200, open: 1, high: 2, low: 0.5, close: 1.5, volume: 42 },
    ]);
  });

  it("unwraps the bridge envelope and sorts ascending", () => {
    const candles = toCandles({ rates: [rate(300), rate(100), rate(200)] });
    expect(candles.map((c) => c.time)).toEqual([100, 200, 300]);
  });

  it("trims to the newest `limit` bars", () => {
    const candles = toCandles({ rates: [rate(1), rate(2), rate(3), rate(4)] }, 2);
    expect(candles.map((c) => c.time)).toEqual([3, 4]);
  });

  it("drops malformed rows instead of failing the whole series", () => {
    const candles = toCandles([{ time: 5, open: null }, null, rate(10)]);
    expect(candles).toHaveLength(1);
    expect(candles[0]?.time).toBe(10);
  });
});
describe("toAccount", () => {
  it("maps the MT5 account tuple", () => {
    const account = toAccount({
      login: 230066111,
      trade_mode: 0,
      leverage: 1000,
      currency: "USD",
      balance: 3300.83,
      equity: 3300.83,
      margin: 0,
      margin_free: 3300.83,
      name: "Jack",
    });
    expect(account).toMatchObject({
      id: "230066111",
      provider: "mt5",
      currency: "USD",
      balance: 3300.83,
      equity: 3300.83,
      freeMargin: 3300.83,
      tradeMode: "demo",
      name: "Jack",
    });
    // Leverage arrives as 1:1000 and is kept as a multiplier.
    expect(account?.leverage).toBeCloseTo(1000, 6);
  });

  it("treats a live account as real money", () => {
    expect(toAccount({ trade_mode: 1, balance: 10 })?.tradeMode).toBe("real");
  });

  it("returns null when there is no account", () => {
    expect(toAccount(null)).toBeNull();
    expect(toAccount("nope")).toBeNull();
  });
});

describe("toPositions", () => {
  it("maps type, exits and profit", () => {
    const [position] = toPositions({
      positions: [
        { ticket: 1, symbol: "XAUUSD", type: 0, volume: 0.1, price_open: 4000, price_current: 4100, sl: 3900, tp: 4200, profit: 100, time: 1792400000 },
        { ticket: 2, symbol: "XAUUSD", type: 1, volume: 0.2, price_open: 4000, price_current: 3900, sl: 0, tp: 0, profit: 20, time: 1792400100 },
      ],
    });
    expect(position).toMatchObject({ side: "long", qty: 0.1, entryPrice: 4000, markPrice: 4100, unrealizedPnl: 100, stopLoss: 3900, takeProfit: 4200 });
  });

  it("treats sl/tp of 0 as unset", () => {
    const [position] = toPositions([{ symbol: "EURUSD", type: 1, volume: 1, price_open: 1, price_current: 1, sl: 0, tp: 0, time: 5 }]);
    expect(position?.side).toBe("short");
    expect(position?.stopLoss).toBeUndefined();
    expect(position?.takeProfit).toBeUndefined();
  });
});

describe("toOrders", () => {
  it("maps MT5 pending order types to venue types", () => {
    const rows = [
      { ticket: 1, symbol: "EURUSD", type: 0, volume_initial: 1, price_open: 1.1, state: 1, time_setup: 10 },
      { ticket: 2, symbol: "EURUSD", type: 1, volume_initial: 1, price_open: 1.2, state: 1, time_setup: 11 },
      { ticket: 3, symbol: "EURUSD", type: 2, volume_initial: 1, price_open: 1.3, state: 1, time_setup: 12 },
      { ticket: 4, symbol: "EURUSD", type: 5, volume_initial: 1, price_open: 1.4, state: 1, time_setup: 13 },
    ];
    const orders = toOrders({ orders: rows });
    expect(orders.map((o) => [o.side, o.type])).toEqual([
      ["buy", "limit"],
      ["sell", "limit"],
      ["buy", "stop"],
      ["sell", "stop_limit"],
    ]);
    expect(orders.map((o) => o.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("maps MT5 states to venue statuses", () => {
    expect(statusOfState(1)).toBe("pending");
    expect(statusOfState(3)).toBe("filled");
    expect(statusOfState(2)).toBe("canceled");
    expect(statusOfState(6)).toBe("expired");
  });
});

describe("toDeals", () => {
  it("keeps trades and drops balance entries", () => {
    const deals = toDeals({
      deals: [
        { ticket: 1, symbol: "XAUUSD", type: 0, volume: 0.1, price: 4000, profit: 10, commission: -1, swap: -0.2, time: 100, position_id: 7, order: 3 },
        { ticket: 2, symbol: "", type: 2, volume: 0, price: 0, profit: 3300, time: 101 },
      ],
    });
    expect(deals).toHaveLength(1);
    expect(deals[0]).toMatchObject({ side: "buy", pnl: 10, commission: -1, swap: -0.2, positionId: "7", orderId: "3" });
  });
});

describe("toQuote", () => {
  it("derives last from bid/ask and change from previous close", () => {
    const quote = toQuote({ bid: 4148.56, ask: 4148.86, prev_close: 4100, time: 1792430308 }, "XAUUSD");
    expect(quote?.last).toBeCloseTo(4148.71, 6);
    expect(quote?.bid).toBe(4148.56);
    expect(quote?.changePercent).toBeCloseTo(1.188, 3);
  });

  it("converts millisecond timestamps to seconds", () => {
    const quote = toQuote({ bid: 1, ask: 1, time: 1792430308000 }, "EURUSD");
    expect(quote?.time).toBe(1792430308);
  });

  it("returns null without a price", () => {
    expect(toQuote({ time: 5 }, "XAUUSD")).toBeNull();
  });
});

describe("toSymbols", () => {
  it("derives precision from digits and tick size from point", () => {
    const [symbol] = toSymbols({
      symbols: [{ symbol: "EURUSD", description: "Euro vs US Dollar", digits: 5, point: 0.00001, trade_mode: 4, currency_base: "EUR" }],
    });
    expect(symbol).toMatchObject({ precision: 5, tickSize: 0.00001, assetClass: "forex", currency: "EUR" });
  });

  it("marks a symbol untradable only when the broker freezes it", () => {
    const [tradable] = toSymbols([{ symbol: "EURUSD", digits: 5, trade_mode: 4 }]);
    const [frozen] = toSymbols([{ symbol: "EURUSD", digits: 5, trade_mode: 0 }]);
    expect(tradable?.tradable).toBe(true);
    expect(frozen?.tradable).toBe(false);
  });
});

describe("outgoing order arguments", () => {
  const market = { symbol: "XAUUSD", side: "buy" as const, type: "market" as const, qty: 0.1, stopLoss: 3900, takeProfit: 4200 };

  it("routes market versus pending", () => {
    expect(isPending(market)).toBe(false);
    expect(isPending({ ...market, type: "limit", price: 4000 })).toBe(true);
  });

  it("carries stops and targets on both shapes", () => {
    expect(marketOrderArgs(market)).toMatchObject({ symbol: "XAUUSD", side: "buy", volume: 0.1, sl: 3900, tp: 4200 });
    expect(pendingOrderArgs({ ...market, type: "limit", price: 4000 })).toMatchObject({ type: "limit", price: 4000, sl: 3900, tp: 4200 });
    expect(pendingOrderArgs({ ...market, type: "stop", price: 4050 })).toMatchObject({ type: "stop", price: 4050 });
  });

  it("closes by symbol, optionally in part", () => {
    expect(closePositionArgs("XAUUSD")).toEqual({ symbol: "XAUUSD" });
    expect(closePositionArgs("XAUUSD", 0.05)).toEqual({ symbol: "XAUUSD", volume: 0.05 });
  });
});
