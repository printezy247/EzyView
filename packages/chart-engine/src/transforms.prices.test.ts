import { describe, expect, it } from "vitest";
import type { Candle } from "@ezyview/data-adapters";
import { heikinAshi, kagi, pointAndFigure, renko, sequentialTimes } from "./transforms.js";

const candle = (time: number, close: number, open = close - 1): Candle => ({
  time,
  open,
  high: Math.max(open, close) + 1,
  low: Math.min(open, close) - 1,
  close,
  volume: 1,
});

const closes = (...cs: number[]): Candle[] => cs.map((c, i) => candle(i + 1, c));

describe("heikinAshi", () => {
  it("smooths the first bar around the real open/close midpoint", () => {
    const out = heikinAshi([candle(1, 10, 8)]);
    expect(out).toHaveLength(1);
    expect(out[0]!.open).toBe(9); // (8 + 10) / 2
    expect(out[0]!.close).toBe((8 + 11 + 7 + 10) / 4);
  });

  it("chains the average open into the next bar", () => {
    const out = heikinAshi(closes(10, 12, 11));
    expect(out).toHaveLength(3);
    expect(out[1]!.open).toBeCloseTo((out[0]!.open + out[0]!.close) / 2);
    expect(out[2]!.open).toBeCloseTo((out[1]!.open + out[1]!.close) / 2);
  });

  it("keeps volume and time untouched", () => {
    const out = heikinAshi(closes(10, 12));
    expect(out.map((c) => c.time)).toEqual([1, 2]);
    expect(out.map((c) => c.volume)).toEqual([1, 1]);
  });
});

describe("renko", () => {
  it("prints bricks every box of travel, none on a flat market", () => {
    const bars = renko(closes(10, 11, 12, 20, 20.5), 5);
    expect(bars.length).toBeGreaterThanOrEqual(2);
    expect(bars.every((b) => Math.abs(b.close - b.open) === 5)).toBe(true);
    const quiet = renko(closes(10, 10.2, 10.4), 5);
    expect(quiet).toHaveLength(0);
  });

  it("returns empty for an empty history or an invalid box", () => {
    expect(renko([], 5)).toEqual([]);
    expect(renko(closes(1, 2, 3), 0)).toEqual([]);
    expect(renko(closes(1, 2, 3), Number.NaN)).toEqual([]);
  });

  it("walks the series forward and backward", () => {
    const bars = renko(closes(10, 20, 5), 5);
    expect(bars.some((b) => b.up)).toBe(true);
    expect(bars.some((b) => !b.up)).toBe(true);
  });
});

describe("kagi", () => {
  it("extends the line through the trend and emits the turn leg", () => {
    // Rising to 110, retracing 5 from the extreme → reversal to 105.
    const bars = kagi(closes(100, 110, 115, 110), 5);
    expect(bars.length).toBeGreaterThanOrEqual(1);
    const down = bars.at(-1)!;
    expect(down.end).toBe(110);
  });

  it("yang follows higher shoulders, yin lower waists", () => {
    const bars = kagi(closes(100, 120, 110, 130), 5);
    // The up line breaking the prior shoulder flips yang on.
    const yangs = bars.map((b) => b.yang);
    expect(yangs.some(Boolean)).toBe(true);
  });

  it("returns empty for an empty history or an invalid reversal", () => {
    expect(kagi([], 5)).toEqual([]);
    expect(kagi(closes(1, 2), 0)).toEqual([]);
  });
});

describe("pointAndFigure", () => {
  it("builds an X column on the way up and an O column on a three-box reversal", () => {
    const bars = pointAndFigure(closes(100, 103, 106, 109, 112, 109, 106, 103), 1, 3);
    const upBars = bars.filter((b) => b.up);
    const downBars = bars.filter((b) => !b.up);
    expect(upBars.length).toBeGreaterThan(0);
    expect(downBars.length).toBeGreaterThan(0);
    expect(bars.every((b) => Number.isFinite(b.time))).toBe(true);
  });

  it("returns empty for an empty history or an invalid box", () => {
    expect(pointAndFigure([], 1)).toEqual([]);
    expect(pointAndFigure(closes(1, 2), 0)).toEqual([]);
  });
});

describe("sequentialTimes", () => {
  it("keeps strictly increasing times, nudging duplicates forward", () => {
    expect(sequentialTimes([10, 10, 10, 20, 20, 30])).toEqual([10, 11, 12, 20, 21, 30]);
    expect(sequentialTimes([])).toEqual([]);
    expect(sequentialTimes([5])).toEqual([5]);
  });
});
