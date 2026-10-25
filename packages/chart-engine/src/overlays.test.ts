import { describe, expect, it } from "vitest";
import type { Candle } from "@ezyview/data-adapters";
import { alignCompare } from "./overlays.js";

const candle = (time: number, close: number): Candle => ({
  time,
  open: close,
  high: close,
  low: close,
  close,
  volume: 1,
});

const PRIMARY = [candle(100, 10), candle(200, 12), candle(300, 15)];
const SECONDARY = [candle(100, 20), candle(200, 30), candle(300, 45)];

describe("alignCompare", () => {
  it("normalises percent change from the first common close", () => {
    expect(alignCompare(PRIMARY, SECONDARY, "percent")).toEqual([
      { time: 100, value: 0 },
      { time: 200, value: 50 },
      { time: 300, value: 125 },
    ]);
  });

  it("divides the secondary close by the primary for ratio mode", () => {
    expect(alignCompare(PRIMARY, SECONDARY, "ratio").map((p) => p.value)).toEqual([2, 2.5, 3]);
  });

  it("subtracts the primary close for spread mode", () => {
    expect(alignCompare(PRIMARY, SECONDARY, "spread").map((p) => p.value)).toEqual([10, 18, 30]);
  });

  it("skips bars the secondary does not have instead of interpolating", () => {
    const sparse = [candle(100, 20), candle(300, 45)];
    expect(alignCompare(PRIMARY, sparse, "percent")).toEqual([
      { time: 100, value: 0 },
      { time: 300, value: 125 },
    ]);
  });

  it("returns nothing when either side is empty", () => {
    expect(alignCompare([], SECONDARY, "percent")).toEqual([]);
    expect(alignCompare(PRIMARY, [], "percent")).toEqual([]);
  });

  it("drops normalisation it cannot compute instead of dividing by zero", () => {
    // A zero secondary base makes every percent value infinite, so the series
    // contributes nothing rather than a run of Infinity.
    const zeroBase = [candle(100, 0), candle(200, 30)];
    expect(alignCompare(PRIMARY, zeroBase, "percent")).toEqual([]);
    // A zero primary close makes the ratio meaningless, so that bar is dropped.
    expect(alignCompare([candle(100, 0)], [candle(100, 5)], "ratio")).toEqual([]);
  });
});
