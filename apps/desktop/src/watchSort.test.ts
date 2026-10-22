import { describe, expect, it } from "vitest";
import { sortWatch } from "./watchSort";

const e = (ticker: string, price: number | null, changePct: number | null = null) => ({ ticker, price, changePct });

describe("sortWatch", () => {
  const rows = [e("B", null), e("C", 2), e("A", 2), e("D", 1)];
  it("puts nulls last ascending and descending, ties by ticker", () => {
    expect(sortWatch(rows, "price", false).map((r) => r.ticker)).toEqual(["D", "A", "C", "B"]);
    expect(sortWatch(rows, "price", true).map((r) => r.ticker)).toEqual(["A", "C", "D", "B"]);
  });
  it("sorts by symbol and leaves input untouched", () => {
    expect(sortWatch(rows, "symbol", true).map((r) => r.ticker)).toEqual(["D", "C", "B", "A"]);
    expect(rows[0]?.ticker).toBe("B");
  });
  it("none keeps order", () => {
    expect(sortWatch(rows, "none", false)).toBe(rows);
  });
});
