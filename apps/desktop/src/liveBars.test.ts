import { describe, expect, it } from "vitest";
import type { Candle } from "@ezyview/data-adapters";
import { mergeQuote } from "./liveBars";

const STEP = 60;
const bar = (time: number, o: number, h: number, l: number, c: number, v = 10): Candle => ({ time, open: o, high: h, low: l, close: c, volume: v });
const BARS = [bar(0, 1, 2, 0.5, 1.5), bar(60, 1.5, 3, 1, 2)];

describe("mergeQuote", () => {
  it("updates the last bar inside its period, widening high/low", () => {
    const out = mergeQuote(BARS, 3.5, 90, STEP);
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual(bar(60, 1.5, 3.5, 1, 3.5));
    expect(out[0]).toBe(BARS[0]);
  });

  it("widens low and keeps high when price falls", () => {
    expect(mergeQuote(BARS, 0.7, 100, STEP)[1]).toEqual(bar(60, 1.5, 3, 0.7, 0.7));
  });

  it("opens a new bar on the next period, aligned to the existing grid", () => {
    const out = mergeQuote(BARS, 2.5, 125, STEP);
    expect(out).toHaveLength(3);
    expect(out[2]).toEqual(bar(120, 2.5, 2.5, 2.5, 2.5, 0));
  });

  it("skips gaps by aligning to the period that contains the quote", () => {
    expect(mergeQuote(BARS, 2.5, 400, STEP)[2]!.time).toBe(360);
  });

  it("returns the same array when nothing changed", () => {
    expect(mergeQuote(BARS, 2, 90, STEP)).toBe(BARS);
  });

  it("ignores stale, non-finite, non-positive quotes and empty history", () => {
    expect(mergeQuote(BARS, 5, 10, STEP)).toBe(BARS); // before the last bar
    expect(mergeQuote(BARS, Number.NaN, 90, STEP)).toBe(BARS);
    expect(mergeQuote(BARS, 0, 90, STEP)).toBe(BARS);
    expect(mergeQuote([], 1, 90, STEP)).toEqual([]);
  });

  it("does not mutate its input", () => {
    const copy = JSON.parse(JSON.stringify(BARS)) as Candle[];
    mergeQuote(BARS, 9, 90, STEP);
    expect(BARS).toEqual(copy);
  });
});
