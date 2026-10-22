import { describe, expect, it } from "vitest";
import { canBreakEven, createLockout, riskQty, roundPrice } from "./tradeMath";

describe("roundPrice", () => {
  it("removes float noise at the symbol precision", () => {
    expect(roundPrice(1.1 + 0.0001 * 3, 4)).toBe(1.1003);
    expect(roundPrice(2000.123456, 2)).toBe(2000.12);
  });
});

describe("canBreakEven", () => {
  it("long: needs mark above entry and a stop below entry", () => {
    expect(canBreakEven({ side: "long", entry: 100, mark: 101 })).toBe(true);
    expect(canBreakEven({ side: "long", entry: 100, mark: 99 })).toBe(false);
    expect(canBreakEven({ side: "long", entry: 100, mark: 101, stopLoss: 99 })).toBe(true);
    expect(canBreakEven({ side: "long", entry: 100, mark: 101, stopLoss: 100 })).toBe(false);
    expect(canBreakEven({ side: "long", entry: 100, mark: 105, stopLoss: 102 })).toBe(false);
  });
  it("short: mirrored", () => {
    expect(canBreakEven({ side: "short", entry: 100, mark: 99 })).toBe(true);
    expect(canBreakEven({ side: "short", entry: 100, mark: 101 })).toBe(false);
    expect(canBreakEven({ side: "short", entry: 100, mark: 99, stopLoss: 101 })).toBe(true);
    expect(canBreakEven({ side: "short", entry: 100, mark: 95, stopLoss: 98 })).toBe(false);
  });
});

describe("riskQty", () => {
  const base = { equity: 10_000, entry: 100, riskPct: 1, side: "buy" as const, maxQty: 1_000 };
  it("sizes risk / distance", () => {
    expect(riskQty({ ...base, stop: 99 })).toBe(100);
  });
  it("rejects missing, non-finite, non-positive or wrong-side stops", () => {
    expect(riskQty({ ...base, stop: undefined })).toBeNull();
    expect(riskQty({ ...base, stop: NaN })).toBeNull();
    expect(riskQty({ ...base, stop: 0 })).toBeNull();
    expect(riskQty({ ...base, stop: 101 })).toBeNull();
    expect(riskQty({ ...base, side: "sell", stop: 99 })).toBeNull();
    expect(riskQty({ ...base, side: "sell", stop: 101 })).toBe(100);
  });
  it("caps the size", () => {
    expect(riskQty({ ...base, stop: 99.99, maxQty: 50 })).toBe(50);
  });
});

describe("createLockout", () => {
  it("blocks the same key inside the window only", () => {
    let t = 0;
    const lock = createLockout(500, () => t);
    expect(lock("a")).toBe(true);
    expect(lock("a")).toBe(false);
    expect(lock("b")).toBe(true);
    t = 501;
    expect(lock("a")).toBe(true);
  });
});
