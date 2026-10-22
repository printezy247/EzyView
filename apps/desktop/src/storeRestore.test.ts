import { describe, expect, it } from "vitest";
import { restoreAlerts, restoreWatchlist } from "./store";

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
});

describe("restoreAlerts", () => {
  const good = { id: "a", symbol: "X", condition: { kind: "greater", value: 1 }, frequency: "once", state: "armed" };
  it("keeps valid and drops bad state or frequency", () => {
    const out = restoreAlerts([good, { ...good, id: "b", state: "weird" }, { ...good, id: "c", frequency: "nope" }], []);
    expect(out.map((a) => a.id)).toEqual(["a"]);
  });
});
