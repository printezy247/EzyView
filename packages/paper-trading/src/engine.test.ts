import { beforeEach, describe, expect, it } from "vitest";
import { PaperTradingEngine, PaperTradingError } from "./engine.js";

/** Deterministic ids and clock so the assertions below are stable. */
function makeEngine(startingBalance = 100_000): PaperTradingEngine {
  let seq = 0;
  let clock = 1_700_000_000;
  return new PaperTradingEngine({
    startingBalance,
    idGenerator: () => `id-${seq++}`,
    now: () => (clock += 1),
  });
}

describe("PaperTradingEngine", () => {
  let engine: PaperTradingEngine;

  beforeEach(() => {
    engine = makeEngine();
  });

  it("starts with the advertised account and no exposure", async () => {
    await engine.connect();
    await expect(engine.getAccount()).resolves.toMatchObject({
      balance: 100_000,
      equity: 100_000,
      margin: 0,
      freeMargin: 100_000,
      tradeMode: "demo",
    });
    await expect(engine.getPositions()).resolves.toEqual([]);
  });

  it("fills a market buy at the last price and opens a long", async () => {
    engine.updateQuote("DEMO:BTCUSDT", 100);
    const order = await engine.placeOrder({ symbol: "DEMO:BTCUSDT", side: "buy", type: "market", qty: 10 });

    expect(order.status).toBe("filled");
    expect(order.avgFillPrice).toBe(100);

    const [position] = await engine.getPositions();
    expect(position).toMatchObject({ side: "long", qty: 10, entryPrice: 100 });
    // 10 × $100 notional at 100× leaves $10 aside.
    expect(position?.margin).toBeCloseTo(10);
  });

  it("returns position copies, so callers cannot mutate engine state", async () => {
    engine.updateQuote("DEMO:BTCUSDT", 100);
    await engine.placeOrder({ symbol: "DEMO:BTCUSDT", side: "buy", type: "market", qty: 10 });

    const [position] = await engine.getPositions();
    (position as { qty: number }).qty = 999;
    const [fresh] = await engine.getPositions();
    expect(fresh?.qty).toBe(10);
  });

  it("averages the entry when adding to an existing position", async () => {
    engine.updateQuote("DEMO:BTCUSDT", 100);
    await engine.placeOrder({ symbol: "DEMO:BTCUSDT", side: "buy", type: "market", qty: 10 });
    engine.updateQuote("DEMO:BTCUSDT", 110);
    await engine.placeOrder({ symbol: "DEMO:BTCUSDT", side: "buy", type: "market", qty: 10 });

    const [position] = await engine.getPositions();
    expect(position).toMatchObject({ qty: 20, entryPrice: 105 });
  });

  it("realizes P&L when reducing and closes at zero", async () => {
    engine.updateQuote("DEMO:BTCUSDT", 100);
    await engine.placeOrder({ symbol: "DEMO:BTCUSDT", side: "buy", type: "market", qty: 10 });
    engine.updateQuote("DEMO:BTCUSDT", 120);

    // Sell 10 at 120 → $200 realized.
    await engine.closePosition("DEMO:BTCUSDT", 10);
    const account = await engine.getAccount();
    expect(account.balance).toBeCloseTo(100_200);
    await expect(engine.getPositions()).resolves.toEqual([]);
    await expect(engine.getHistory()).resolves.toHaveLength(1);
  });

  it("flips a long into a short when the sell overshoots", async () => {
    engine.updateQuote("DEMO:BTCUSDT", 100);
    await engine.placeOrder({ symbol: "DEMO:BTCUSDT", side: "buy", type: "market", qty: 10 });
    engine.updateQuote("DEMO:BTCUSDT", 110);

    await engine.placeOrder({ symbol: "DEMO:BTCUSDT", side: "sell", type: "market", qty: 15 });

    const [position] = await engine.getPositions();
    expect(position).toMatchObject({ side: "short", qty: 5, entryPrice: 110 });
    // 10 closed at +10 each, 5 opened short at 110.
    expect(await engine.getHistory()).toHaveLength(1);
  });

  it("marks unrealized P&L on both sides", async () => {
    engine.updateQuote("DEMO:BTCUSDT", 100);
    await engine.placeOrder({ symbol: "DEMO:BTCUSDT", side: "buy", type: "market", qty: 2 });
    engine.updateQuote("DEMO:BTCUSDT", 125);
    expect((await engine.getAccount()).equity).toBeCloseTo(100_050);

    await engine.closePosition("DEMO:BTCUSDT");
    engine.updateQuote("DEMO:BTCUSDT", 130);
    await engine.placeOrder({ symbol: "DEMO:BTCUSDT", side: "sell", type: "market", qty: 2 });
    engine.updateQuote("DEMO:BTCUSDT", 120);
    // Short 2 from 130 down to 120 → +20.
    expect((await engine.getAccount()).equity).toBeCloseTo(100_070);
  });

  it("rejects an order that exceeds free margin", async () => {
    engine.updateQuote("DEMO:BTCUSDT", 100);
    // $100k at 100× covers $10m of notional, so $10,001 is over the line.
    await expect(
      engine.placeOrder({ symbol: "DEMO:BTCUSDT", side: "buy", type: "market", qty: 100_001 }),
    ).rejects.toThrow(PaperTradingError);
    await expect(engine.getPositions()).resolves.toEqual([]);
  });

  it("closes a position that consumes the whole account's margin", async () => {
    engine.updateQuote("DEMO:BTCUSDT", 100);
    // Exactly $10m notional at 100×: margin equals the balance, free margin 0.
    await engine.placeOrder({ symbol: "DEMO:BTCUSDT", side: "buy", type: "market", qty: 100_000 });
    expect((await engine.getAccount()).freeMargin).toBe(0);

    // Closing reduces margin, so it must not be charged for it.
    await expect(engine.closePosition("DEMO:BTCUSDT")).resolves.toMatchObject({ status: "filled" });
    await expect(engine.getPositions()).resolves.toEqual([]);
  });

  it("partially closes a fully-margined position", async () => {
    engine.updateQuote("DEMO:BTCUSDT", 100);
    await engine.placeOrder({ symbol: "DEMO:BTCUSDT", side: "buy", type: "market", qty: 100_000 });

    await expect(engine.closePosition("DEMO:BTCUSDT", 50_000)).resolves.toMatchObject({ status: "filled" });
    const [position] = await engine.getPositions();
    expect(position?.qty).toBe(50_000);
  });

  it("closeAll liquidates a fully-margined account", async () => {
    engine.updateQuote("DEMO:BTCUSDT", 100);
    await engine.placeOrder({ symbol: "DEMO:BTCUSDT", side: "buy", type: "market", qty: 100_000 });

    await expect(engine.closeAll()).resolves.toHaveLength(1);
    await expect(engine.getPositions()).resolves.toEqual([]);
  });

  it("holds a limit order until a tick crosses it", async () => {
    engine.updateQuote("DEMO:BTCUSDT", 100);
    await engine.placeOrder({ symbol: "DEMO:BTCUSDT", side: "buy", type: "limit", price: 90, qty: 1 });

    // Price has not reached the limit yet.
    await expect(engine.getPositions()).resolves.toEqual([]);
    expect(await engine.getOrders()).toHaveLength(1);

    engine.updateQuote("DEMO:BTCUSDT", 95);
    await expect(engine.getPositions()).resolves.toEqual([]);

    engine.updateQuote("DEMO:BTCUSDT", 89);
    const [position] = await engine.getPositions();
    expect(position?.entryPrice).toBe(90);
    // The resting order is gone once it has filled.
    await expect(engine.getOrders()).resolves.toEqual([]);
  });

  it("cancels a resting order so it can never fill", async () => {
    engine.updateQuote("DEMO:BTCUSDT", 100);
    const order = await engine.placeOrder({ symbol: "DEMO:BTCUSDT", side: "buy", type: "limit", price: 90, qty: 1 });
    await expect(engine.cancelOrder(order.id)).resolves.toBe(true);

    engine.updateQuote("DEMO:BTCUSDT", 80);
    await expect(engine.getPositions()).resolves.toEqual([]);
  });

  it("takes profit automatically at the trigger price", async () => {
    engine.updateQuote("DEMO:BTCUSDT", 100);
    await engine.placeOrder({
      symbol: "DEMO:BTCUSDT",
      side: "buy",
      type: "market",
      qty: 10,
      takeProfit: 120,
    });

    engine.updateQuote("DEMO:BTCUSDT", 119);
    await expect(engine.getPositions()).resolves.toHaveLength(1);

    engine.updateQuote("DEMO:BTCUSDT", 121);
    await expect(engine.getPositions()).resolves.toEqual([]);
    expect((await engine.getAccount()).balance).toBeCloseTo(100_200);
  });

  it("stops out at the stop-loss price", async () => {
    engine.updateQuote("DEMO:BTCUSDT", 100);
    await engine.placeOrder({ symbol: "DEMO:BTCUSDT", side: "buy", type: "market", qty: 10, stopLoss: 95 });

    engine.updateQuote("DEMO:BTCUSDT", 96);
    await expect(engine.getPositions()).resolves.toHaveLength(1);

    engine.updateQuote("DEMO:BTCUSDT", 94);
    await expect(engine.getPositions()).resolves.toEqual([]);
    expect((await engine.getAccount()).balance).toBeCloseTo(99_950);
  });

  it("liquidates everything when the margin level falls under the stop-out level", async () => {
    // $50k posted against $5m of notional, so a 1.6% drop takes the equity
    // below the 50% stop-out level and the venue liquidates to save the rest.
    engine.updateQuote("DEMO:BTCUSDT", 100);
    await engine.placeOrder({ symbol: "DEMO:BTCUSDT", side: "buy", type: "market", qty: 50_000 });

    engine.updateQuote("DEMO:BTCUSDT", 99);
    await expect(engine.getPositions()).resolves.toHaveLength(1);

    engine.updateQuote("DEMO:BTCUSDT", 98.4);
    await expect(engine.getPositions()).resolves.toEqual([]);
    // Equity survives the liquidation rather than going to zero.
    expect((await engine.getAccount()).equity).toBeGreaterThan(0);
  });

  it("resets the account back to its starting balance", async () => {
    engine.updateQuote("DEMO:BTCUSDT", 100);
    await engine.placeOrder({ symbol: "DEMO:BTCUSDT", side: "buy", type: "market", qty: 10 });
    engine.updateQuote("DEMO:BTCUSDT", 150);
    await engine.closePosition("DEMO:BTCUSDT");

    engine.reset();
    await expect(engine.getAccount()).resolves.toMatchObject({ balance: 100_000, margin: 0, equity: 100_000 });
    await expect(engine.getPositions()).resolves.toEqual([]);
    await expect(engine.getHistory()).resolves.toEqual([]);
  });

  it("round-trips the account through a snapshot", async () => {
    engine.updateQuote("DEMO:BTCUSDT", 100);
    await engine.placeOrder({ symbol: "DEMO:BTCUSDT", side: "buy", type: "market", qty: 10, stopLoss: 90 });
    await engine.placeOrder({ symbol: "DEMO:ETHUSDT", side: "buy", type: "limit", price: 80, qty: 5 });
    engine.updateQuote("DEMO:BTCUSDT", 110);

    const restored = PaperTradingEngine.restore(engine.snapshot());
    const account = await restored.getAccount();
    expect(account.balance).toBe(100_000);
    expect(account.equity).toBeCloseTo(100_100);

    const [position] = await restored.getPositions();
    expect(position).toMatchObject({ symbol: "DEMO:BTCUSDT", qty: 10, entryPrice: 100, stopLoss: 90 });
    await expect(restored.getOrders()).resolves.toHaveLength(1);

    // The snapshot must not alias the live engine's records.
    const snap = engine.snapshot();
    snap.balance = 1;
    expect((await engine.getAccount()).balance).toBe(100_000);
  });

  it("boots a fresh account when the snapshot comes from a future version", async () => {
    const stale = { ...engine.snapshot(), version: 999, balance: 5 };
    await expect(PaperTradingEngine.restore(stale).getAccount()).resolves.toMatchObject({ balance: 100_000 });
  });

  it("exposes the TradingAdapter surface the live brokers will share", async () => {
    await expect(engine.connect()).resolves.toMatchObject({ provider: "paper" });
    expect(engine.mode).toBe("paper");
    expect(typeof engine.closePosition).toBe("function");
    expect(typeof engine.modifyOrder).toBe("function");
    await engine.disconnect();
    expect(engine.isConnected()).toBe(false);
  });
});

describe("amending an open position's stop and target", () => {
  let engine: PaperTradingEngine;

  beforeEach(async () => {
    engine = makeEngine();
    await engine.connect();
    engine.updateQuote("DEMO:BTCUSDT", 100);
    await engine.placeOrder({ symbol: "DEMO:BTCUSDT", side: "buy", type: "market", qty: 10, stopLoss: 90, takeProfit: 120 });
  });

  it("moves a stop and leaves the target where it was", async () => {
    const next = await engine.setLevels("DEMO:BTCUSDT", { stopLoss: 95 });
    expect(next.stopLoss).toBe(95);
    expect(next.takeProfit).toBe(120);
  });

  it("moves a target and leaves the stop where it was", async () => {
    const next = await engine.setLevels("DEMO:BTCUSDT", { takeProfit: 130 });
    expect(next.takeProfit).toBe(130);
    expect(next.stopLoss).toBe(90);
  });

  it("clears a level when the patch passes null", async () => {
    const next = await engine.setLevels("DEMO:BTCUSDT", { stopLoss: null });
    expect(next.stopLoss).toBeUndefined();
    expect(next.takeProfit).toBe(120);
  });

  it("refuses a non-finite level instead of arming a broken stop", async () => {
    await expect(engine.setLevels("DEMO:BTCUSDT", { stopLoss: Number.NaN })).rejects.toThrow(PaperTradingError);
  });

  it("refuses to amend a symbol with no open position", async () => {
    await expect(engine.setLevels("DEMO:ETHUSDT", { stopLoss: 1 })).rejects.toThrow(PaperTradingError);
  });

  it("applies the amended stop on the next quote", async () => {
    await engine.setLevels("DEMO:BTCUSDT", { stopLoss: 98 });
    engine.updateQuote("DEMO:BTCUSDT", 97);
    await expect(engine.getPositions()).resolves.toEqual([]);
  });

  it("restores a snapshot that is missing its order and deal lists", () => {
    const partial = {
      version: 1,
      balance: 1000,
      positions: [],
      sequence: 3,
    } as unknown as Parameters<typeof PaperTradingEngine.restore>[0];
    // A truncated blob used to throw while the module was imported, which
    // took the whole app down.
    const restored = PaperTradingEngine.restore(partial);
    expect(restored).toBeInstanceOf(PaperTradingEngine);
  });
});

describe("rejected orders", () => {
  let engine: PaperTradingEngine;

  beforeEach(async () => {
    engine = makeEngine();
    await engine.connect();
    engine.updateQuote("DEMO:BTCUSDT", 100);
  });

  it("refuses a limit order priced at zero instead of filling it at zero", async () => {
    // An empty ticket field reaches the engine as 0. It is finite, so it used
    // to pass validation and open a position at price 0.
    await expect(
      engine.placeOrder({ symbol: "DEMO:BTCUSDT", side: "sell", type: "limit", price: 0, qty: 1 }),
    ).rejects.toThrow(PaperTradingError);
    await expect(engine.getPositions()).resolves.toEqual([]);
  });

  it("refuses a stop order priced at zero", async () => {
    await expect(
      engine.placeOrder({ symbol: "DEMO:BTCUSDT", side: "buy", type: "stop", price: 0, qty: 1 }),
    ).rejects.toThrow(PaperTradingError);
  });

  it("refuses a non-numeric stop loss or take profit", async () => {
    await expect(
      engine.placeOrder({
        symbol: "DEMO:BTCUSDT",
        side: "buy",
        type: "market",
        qty: 1,
        stopLoss: Number.NaN,
      }),
    ).rejects.toThrow(PaperTradingError);
    await expect(
      engine.placeOrder({
        symbol: "DEMO:BTCUSDT",
        side: "buy",
        type: "market",
        qty: 1,
        takeProfit: Number.NaN,
      }),
    ).rejects.toThrow(PaperTradingError);
    await expect(engine.getPositions()).resolves.toEqual([]);
  });

  describe("hardening", () => {
    it("stop_limit keeps its type and stopPrice, flags triggered, then fills as a limit", async () => {
      engine.updateQuote("S", 100);
      const o = await engine.placeOrder({ symbol: "S", side: "buy", type: "stop_limit", qty: 1, price: 106, stopPrice: 105 });
      engine.updateQuote("S", 104);
      expect((await engine.getOrders())[0]).toMatchObject({ type: "stop_limit", stopPrice: 105 });
      expect((await engine.getOrders())[0]!.triggered).toBeFalsy();
      engine.updateQuote("S", 107); // stop tripped, but above the 106 limit: parked
      const parked = (await engine.getOrders()).find((x) => x.id === o.id)!;
      expect(parked).toMatchObject({ type: "stop_limit", stopPrice: 105, triggered: true, status: "pending" });
      engine.updateQuote("S", 105.5);
      expect((await engine.getPositions())[0]?.symbol).toBe("S");
    });

    it("stop_limit without stopPrice is rejected", async () => {
      engine.updateQuote("S", 100);
      await expect(engine.placeOrder({ symbol: "S", side: "buy", type: "stop_limit", qty: 1, price: 106 })).rejects.toThrow(/stop price/);
    });

    it("modifyOrder enforces the max qty", async () => {
      engine.updateQuote("S", 100);
      const o = await engine.placeOrder({ symbol: "S", side: "buy", type: "limit", qty: 1, price: 50 });
      await expect(engine.modifyOrder(o.id, { qty: 1e12 })).rejects.toThrow(/qty/);
    });

    it("placement rejects an absurd qty", async () => {
      engine.updateQuote("S", 100);
      await expect(engine.placeOrder({ symbol: "S", side: "buy", type: "limit", qty: 1e12, price: 1 })).rejects.toThrow(/qty/);
    });
  });

  describe("trailing stop", () => {
    it("seeds the stop at entry minus distance and ratchets up for a long", async () => {
      const stopOf = async (): Promise<number | undefined> => (await engine.getPositions())[0]?.stopLoss;
      engine.updateQuote("S", 100);
      await engine.placeOrder({ symbol: "S", side: "buy", type: "market", qty: 1 });
      await engine.setTrailingStop("S", 10);

      // Seed: 100 - 10 = 90.
      await expect(stopOf()).resolves.toBe(90);

      // Price rises to 120 → stop trails to 110.
      engine.updateQuote("S", 120);
      await expect(stopOf()).resolves.toBe(110);

      // Price dips to 115 (still above the trailed stop) → candidate 105 is
      // below the ratcheted 110, so the stop holds at 110 and stays open.
      engine.updateQuote("S", 115);
      await expect(stopOf()).resolves.toBe(110);
    });

    it("triggers a close when price falls back through the trailed stop", async () => {
      engine.updateQuote("S", 100);
      await engine.placeOrder({ symbol: "S", side: "buy", type: "market", qty: 1 });
      await engine.setTrailingStop("S", 10);

      engine.updateQuote("S", 130); // stop → 120
      engine.updateQuote("S", 119); // falls through 120 → stop-out
      await expect(engine.getPositions()).resolves.toEqual([]);
    });

    it("clears the trailing stop with null", async () => {
      engine.updateQuote("S", 100);
      await engine.placeOrder({ symbol: "S", side: "buy", type: "market", qty: 1 });
      await engine.setTrailingStop("S", 10);
      const cleared = await engine.setTrailingStop("S", null);
      expect(cleared.trailingDistance).toBeUndefined();
    });

    it("refuses a non-positive distance and a flat book", async () => {
      await expect(engine.setTrailingStop("S", 0)).rejects.toThrow(PaperTradingError);
      engine.updateQuote("S", 100);
      await engine.placeOrder({ symbol: "S", side: "buy", type: "market", qty: 1 });
      await expect(engine.setTrailingStop("S", -5)).rejects.toThrow(/positive/);
    });
  });

  describe("OCO orders", () => {
    it("filling one leg cancels the sibling", async () => {
      engine.updateQuote("S", 100);
      const taker = await engine.placeOrder({ symbol: "S", side: "buy", type: "market", qty: 1 });
      expect(taker.status).toBe("filled");

      const tp = await engine.placeOrder({ symbol: "S", side: "sell", type: "limit", qty: 1, price: 120 });
      const sl = await engine.placeOrder({ symbol: "S", side: "sell", type: "stop", qty: 1, stopPrice: 80 });
      const groupId = engine.linkOco(tp.id, sl.id);
      expect(groupId).toBeTruthy();

      // Price hits the take-profit limit → fills and cancels the stop.
      engine.updateQuote("S", 120);
      const orders = await engine.getOrders();
      expect(orders.filter((o) => o.status === "pending")).toEqual([]);
    });

    it("cancelling one leg cancels the sibling", async () => {
      engine.updateQuote("S", 100);
      await engine.placeOrder({ symbol: "S", side: "buy", type: "market", qty: 1 });
      const tp = await engine.placeOrder({ symbol: "S", side: "sell", type: "limit", qty: 1, price: 120 });
      const sl = await engine.placeOrder({ symbol: "S", side: "sell", type: "stop", qty: 1, stopPrice: 80 });
      engine.linkOco(tp.id, sl.id);

      await engine.cancelOrder(tp.id);
      const pending = (await engine.getOrders()).filter((o) => o.status === "pending");
      expect(pending).toEqual([]);
    });

    it("refuses to link orders on different symbols", async () => {
      engine.updateQuote("S", 100);
      engine.updateQuote("T", 100);
      const a = await engine.placeOrder({ symbol: "S", side: "buy", type: "limit", qty: 1, price: 90 });
      const b = await engine.placeOrder({ symbol: "T", side: "buy", type: "limit", qty: 1, price: 90 });
      expect(() => engine.linkOco(a.id, b.id)).toThrow(/symbol/);
    });
  });
});
