import { describe, expect, it } from "vitest";

import { groupsInUse, linkedIndices, linkGroupOf, withLinkedUpdate } from "./linkGroups";

/**
 * Chart-cell linking: cells that share a group name move together.
 *
 * The rules are pure so they can be tested without a store or a chart: a group
 * is identified by its name, a cell with no name is on its own, and a change
 * to one cell in a group is applied to every cell in it.
 */

const cell = (symbol: string, linkGroup?: string) => ({
  symbol,
  resolution: "1D" as const,
  linkGroup,
});

describe("linkGroupOf", () => {
  it("is the cell's group name, or null when it has none", () => {
    expect(linkGroupOf(cell("BTC/USD"))).toBeNull();
    expect(linkGroupOf(cell("BTC/USD", "A"))).toBe("A");
  });

  it("treats a blank name as no group", () => {
    expect(linkGroupOf(cell("BTC/USD", "  "))).toBeNull();
  });
});

describe("linkedIndices", () => {
  const charts = [cell("BTC/USD", "A"), cell("ETH/USD", "A"), cell("EUR/USD"), cell("LTC/USD", "B")];

  it("lists the cells sharing the group", () => {
    expect(linkedIndices(charts, 0)).toEqual([0, 1]);
    expect(linkedIndices(charts, 1)).toEqual([0, 1]);
  });

  it("returns only the cell itself when it is not in a group", () => {
    expect(linkedIndices(charts, 2)).toEqual([2]);
  });

  it("returns only the cell itself when its group has one member", () => {
    expect(linkedIndices(charts, 3)).toEqual([3]);
  });

  it("returns nothing for an out-of-range index", () => {
    expect(linkedIndices(charts, 9)).toEqual([]);
  });
});

describe("groupsInUse", () => {
  const charts = [cell("BTC/USD", "A"), cell("ETH/USD", "A"), cell("EUR/USD"), cell("LTC/USD", "B"), cell("XRP/USD", "  ")];

  it("lists the distinct groups, in first-appearance order", () => {
    expect(groupsInUse(charts)).toEqual(["A", "B"]);
  });

  it("ignores cells with no group and blank names", () => {
    expect(groupsInUse([cell("BTC/USD"), cell("ETH/USD", "  ")])).toEqual([]);
  });
});

describe("withLinkedUpdate", () => {
  const charts = [cell("BTC/USD", "A"), cell("ETH/USD", "A"), cell("EUR/USD")];

  it("applies the change to every cell in the group", () => {
    const next = withLinkedUpdate(charts, 0, { symbol: "SOL/USD" });
    expect(next.map((c) => c.symbol)).toEqual(["SOL/USD", "SOL/USD", "EUR/USD"]);
  });

  it("leaves cells outside the group alone", () => {
    const next = withLinkedUpdate(charts, 0, { resolution: "1h" });
    expect(next.map((c) => c.resolution)).toEqual(["1h", "1h", "1D"]);
  });

  it("changes only the cell when it is not in a group", () => {
    const next = withLinkedUpdate(charts, 2, { symbol: "GBP/USD" });
    expect(next.map((c) => c.symbol)).toEqual(["BTC/USD", "ETH/USD", "GBP/USD"]);
  });

  it("returns the same array when the index is out of range", () => {
    expect(withLinkedUpdate(charts, 9, { symbol: "X" })).toBe(charts);
  });

  it("does not mutate the input", () => {
    const input = [cell("BTC/USD", "A"), cell("ETH/USD", "A")];
    withLinkedUpdate(input, 0, { symbol: "SOL/USD" });
    expect(input[0]!.symbol).toBe("BTC/USD");
  });
});
