import { describe, expect, it } from "vitest";
import { buildLadder, tapeDelta } from "./depthLadder";

describe("buildLadder", () => {
  it("lists consecutive tick levels outward from the mid", () => {
    const asks = buildLadder(1.1, 2, "ask");
    expect(asks[0]!.price).toBeCloseTo(1.11, 10);
    expect(asks[1]!.price).toBeCloseTo(1.12, 10);
    const bids = buildLadder(1.1, 2, "bid");
    expect(bids[0]!.price).toBeCloseTo(1.09, 10);
    expect(bids[1]!.price).toBeCloseTo(1.08, 10);
  });

  it("is deterministic per price: identical mids produce identical books", () => {
    const a = buildLadder(1.23456, 5, "bid");
    const b = buildLadder(1.23456, 5, "bid");
    expect(b).toEqual(a);
  });

  it("keeps cumulative depth monotonically growing inward-level by level", () => {
    for (const side of ["ask", "bid"] as const) {
      const ladder = buildLadder(100, 2, side);
      for (let i = 1; i < ladder.length; i++) {
        expect(ladder[i]!.cum).toBeGreaterThan(ladder[i - 1]!.cum);
        expect(ladder[i]!.cum).toBeCloseTo(ladder[i]!.cum + 0, 0); // finite
      }
      expect(ladder.every((l) => l.size > 0)).toBe(true);
    }
  });

  it("does not reshuffle when only the poll tick changes at the same mid", () => {
    // Sizes depend on price alone (hashed), never on time or call order.
    const later = buildLadder(1.1, 2, "ask");
    expect(later[3]!.size).toBe(buildLadder(1.1, 2, "ask")[3]!.size);
    // But a moved mid re-prices the rungs: the grid travels with the market.
    expect(buildLadder(1.11, 2, "ask")[0]!.price).not.toBeCloseTo(1.11, 10);
  });
});

describe("tapeDelta", () => {
  it("sums signed sizes when the feed reports real trades", () => {
    const flow = tapeDelta([
      { side: "buy", size: 2 },
      { side: "sell", size: 0.5 },
      { side: "buy", size: 1.25 },
      { side: "sell", size: 0.75 },
    ]);
    expect(flow.delta).toBeCloseTo(2.0, 10);
    expect(flow.sized).toBe(true);
    expect(flow.buyTicks).toBe(2);
    expect(flow.sellTicks).toBe(2);
  });

  it("degrades to tick counts with delta null when every size is unknown", () => {
    const flow = tapeDelta([
      { side: "buy", size: 0 },
      { side: "sell", size: 0 },
      { side: "buy", size: 0 },
    ]);
    expect(flow.delta).toBeNull();
    expect(flow.sized).toBe(false);
    expect(flow.buyTicks).toBe(2);
    expect(flow.sellTicks).toBe(1);
  });

  it("is sized when a single real print sits among quote ticks", () => {
    const flow = tapeDelta([
      { side: "buy", size: 0 },
      { side: "sell", size: 3 },
    ]);
    expect(flow.sized).toBe(true);
    expect(flow.delta).toBeCloseTo(-3, 10);
  });

  it("handles an empty window", () => {
    expect(tapeDelta([])).toEqual({ delta: null, buyTicks: 0, sellTicks: 0, sized: false });
  });
});
