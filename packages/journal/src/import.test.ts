import { describe, expect, it } from "vitest";
import { entriesFromDeals, existingKeys } from "./import";
import type { Deal } from "@ezyview/data-adapters";

const deal = (over: Partial<Deal> = {}): Deal => ({
  id: "1",
  symbol: "XAUUSD",
  side: "buy",
  qty: 1,
  price: 100,
  pnl: 0,
  time: 1000,
  ...over,
});

describe("entriesFromDeals", () => {
  it("groups an MT5 round trip by position id", () => {
    const entries = entriesFromDeals(
      [
        deal({ id: "10", positionId: "777", side: "buy", price: 100, pnl: 0, commission: -1, time: 1000 }),
        deal({ id: "11", positionId: "777", side: "sell", price: 120, pnl: 20, commission: -1, time: 1200 }),
      ],
      "mt5",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: "pos:777",
      symbol: "XAUUSD",
      side: "long",
      qty: 1,
      entryPrice: 100,
      exitPrice: 120,
      entryTime: 1000,
      exitTime: 1200,
      pnl: 20,
      fees: -2,
      source: "mt5",
    });
  });

  it("reads a short from a sell-then-buy pair", () => {
    const entries = entriesFromDeals([
      deal({ id: "1", positionId: "8", side: "sell", price: 200, pnl: 0, time: 1 }),
      deal({ id: "2", positionId: "8", side: "buy", price: 180, pnl: 20, time: 2 }),
    ]);
    expect(entries[0]).toMatchObject({ side: "short", entryPrice: 200, exitPrice: 180, pnl: 20 });
  });

  it("sums partial exits into one trade and closes on the last fill", () => {
    const entries = entriesFromDeals([
      deal({ id: "1", positionId: "9", side: "buy", price: 100, qty: 3, pnl: 0, time: 1 }),
      deal({ id: "2", positionId: "9", side: "sell", price: 110, qty: 1, pnl: 10, time: 2 }),
      deal({ id: "3", positionId: "9", side: "sell", price: 130, qty: 2, pnl: 60, time: 3 }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ exitPrice: 130, exitTime: 3, pnl: 70 });
  });

  it("keeps an unclosed position open", () => {
    const entries = entriesFromDeals([deal({ id: "1", positionId: "10", side: "buy", price: 100, time: 1 })]);
    expect(entries[0]).toMatchObject({ entryPrice: 100 });
    expect(entries[0]?.exitTime).toBeUndefined();
    expect(entries[0]?.pnl).toBeUndefined();
  });

  it("handles position-less deals and drops zero-value legs", () => {
    const entries = entriesFromDeals([
      deal({ id: "a", side: "buy", price: 5, pnl: 0, time: 1 }),
      deal({ id: "b", side: "sell", price: 7, pnl: 2, time: 2 }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: "deal:b", exitPrice: 7, pnl: 2 });
  });

  it("returns newest trades first", () => {
    const entries = entriesFromDeals([
      deal({ id: "1", positionId: "1", side: "buy", price: 1, pnl: 0, time: 100 }),
      deal({ id: "2", positionId: "1", side: "sell", price: 2, pnl: 1, time: 200 }),
      deal({ id: "3", positionId: "2", side: "buy", price: 1, pnl: 0, time: 50 }),
      deal({ id: "4", positionId: "2", side: "sell", price: 2, pnl: 1, time: 60 }),
    ]);
    expect(entries.map((entry) => entry.id)).toEqual(["pos:1", "pos:2"]);
    expect(entries[0]?.entryTime).toBe(100);
  });

  it("exposes keys for skipping already-imported trades", () => {
    const entries = entriesFromDeals([deal({ id: "1", positionId: "5", side: "buy", pnl: 0, time: 1 })]);
    const keys = existingKeys(entries);
    expect(keys.has("pos:5")).toBe(true);
    expect(keys.has("pos:6")).toBe(false);
  });
});

describe("entriesFromDeals bad data", () => {
  it("drops deals with non-finite qty, price, pnl or time", () => {
    const entries = entriesFromDeals([
      deal({ id: "a", qty: NaN, pnl: 5 }),
      deal({ id: "b", price: Infinity, pnl: 5 }),
      deal({ id: "c", pnl: NaN }),
      deal({ id: "d", time: NaN, pnl: 5 }),
      deal({ id: "e", pnl: 5 }),
    ]);
    expect(entries.map((e) => e.id)).toEqual(["deal:e"]);
    for (const e of entries) expect(Number.isFinite(e.pnl)).toBe(true);
  });
});
