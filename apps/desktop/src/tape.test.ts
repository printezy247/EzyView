import { describe, expect, it } from "vitest";

import { TapeBuffer, tapeEntry, type TapeEntry } from "./tape";

/**
 * The tape is a bounded, append-only log of prints. These tests pin the parts
 * that make it usable as a UI feed: newest first, bounded memory, a monotonic
 * sequence, and a side derived from the previous print.
 */

const print = (price: number, ts: number, size = 1): Omit<TapeEntry, "id" | "side"> => ({ symbol: "BTC/USD", price, size, ts });

describe("tapeEntry", () => {
  it("marks an uptick as a buy and a downtick as a sell", () => {
    expect(tapeEntry(print(101, 1), 100, "buy").side).toBe("buy");
    expect(tapeEntry(print(99, 1), 100, "buy").side).toBe("sell");
  });

  it("carries the previous side through an unchanged print", () => {
    // A flat print is not a trade direction, so the last real one stands.
    expect(tapeEntry(print(100, 1), 100, "buy").side).toBe("buy");
    expect(tapeEntry(print(100, 1), 100, "sell").side).toBe("sell");
  });

  it("defaults to buy when there is no previous print", () => {
    expect(tapeEntry(print(100, 1), null, "buy").side).toBe("buy");
  });

  it("stamps a monotonic id so React keys never collide", () => {
    const a = tapeEntry(print(1, 1), null, "buy", 1);
    const b = tapeEntry(print(2, 2), 1, "buy", 2);
    expect(b.id).toBeGreaterThan(a.id);
  });
});

describe("TapeBuffer", () => {
  it("returns newest first", () => {
    const tape = new TapeBuffer(10);
    tape.push(print(1, 1));
    tape.push(print(2, 2));
    expect(tape.recent().map((e) => e.price)).toEqual([2, 1]);
  });

  it("stays bounded, dropping the oldest print", () => {
    const tape = new TapeBuffer(3);
    for (let i = 1; i <= 5; i++) tape.push(print(i, i));
    const recent = tape.recent();
    expect(recent).toHaveLength(3);
    expect(recent.map((e) => e.price)).toEqual([5, 4, 3]);
  });

  it("reports its size and can be emptied", () => {
    const tape = new TapeBuffer(5);
    tape.push(print(1, 1));
    expect(tape.size).toBe(1);
    tape.clear();
    expect(tape.size).toBe(0);
    expect(tape.recent()).toEqual([]);
  });

  it("remembers the last side across a push", () => {
    const tape = new TapeBuffer(5);
    tape.push(print(100, 1));
    tape.push(print(101, 2)); // up -> buy
    tape.push(print(101, 3)); // flat -> stays buy
    expect(tape.recent()[0]!.side).toBe("buy");
  });

  it("does not expose the internal array to mutation", () => {
    const tape = new TapeBuffer(5);
    tape.push(print(1, 1));
    const out = tape.recent();
    out.push(tapeEntry(print(2, 2), 1, "buy"));
    expect(tape.size).toBe(1);
  });

  it("keeps per-symbol tapes independent when a map owns them", () => {
    const tapes = new Map<string, TapeBuffer>();
    const forSymbol = (s: string) => {
      const existing = tapes.get(s) ?? new TapeBuffer(5);
      tapes.set(s, existing);
      return existing;
    };
    forSymbol("A").push({ symbol: "A", price: 1, size: 1, ts: 1 });
    forSymbol("B").push({ symbol: "B", price: 2, size: 1, ts: 2 });
    expect(forSymbol("A").recent()[0]!.price).toBe(1);
    expect(forSymbol("B").recent()[0]!.price).toBe(2);
  });
});
