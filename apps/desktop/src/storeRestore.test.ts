import { describe, expect, it } from "vitest";
import { restoreAlerts, restoreWatchlist, watchlistQuoteKeys } from "./store";

describe("restoreWatchlist", () => {
  const base = { symbol: "X", ticker: "X", description: "d", assetClass: "fx" };
  it("coerces junk price/changePct to null and precision to an int", () => {
    const [w] = restoreWatchlist([{ ...base, price: "12", changePct: NaN, precision: 2.7 }], []);
    expect(w).toMatchObject({ price: null, changePct: null, precision: 2 });
    const [v] = restoreWatchlist([{ ...base, price: 1.5, changePct: -2, precision: "x" }], []);
    expect(v).toMatchObject({ price: 1.5, changePct: -2, precision: 2 });
  });
  it("drops entries without symbol/ticker", () => {
    expect(restoreWatchlist([{ symbol: "A" }, null, base], [])).toHaveLength(1);
  });

  it("restores a known feed and drops auto/junk instead of pinning a venue", () => {
    const [mt5] = restoreWatchlist([{ ...base, source: "mt5" }], []);
    expect(mt5?.source).toBe("mt5");
    const [auto] = restoreWatchlist([{ ...base, source: "auto" }], []);
    expect(auto?.source).toBeUndefined();
    const [junk] = restoreWatchlist([{ ...base, source: 42 }], []);
    expect(junk?.source).toBeUndefined();
  });
});

describe("watchlistQuoteKeys", () => {
  const row = { ticker: "EURUSD", description: "", assetClass: "forex", precision: 4, price: null, changePct: null };
  it("changes when a row's feed changes, not when its price does", () => {
    const before = watchlistQuoteKeys([{ ...row, symbol: "OANDA:EURUSD" }]);
    const priced = watchlistQuoteKeys([{ ...row, symbol: "OANDA:EURUSD", price: 1.1 }]);
    expect(priced).toBe(before);
    expect(watchlistQuoteKeys([{ ...row, symbol: "OANDA:EURUSD", source: "mt5" }])).not.toBe(before);
  });
});

describe("restoreAlerts", () => {
  const good = { id: "a", symbol: "X", condition: { kind: "greater", value: 1 }, frequency: "once", state: "armed" };
  it("keeps valid and drops bad state or frequency", () => {
    const out = restoreAlerts([good, { ...good, id: "b", state: "weird" }, { ...good, id: "c", frequency: "nope" }], []);
    expect(out.map((a) => a.id)).toEqual(["a"]);
  });
});
