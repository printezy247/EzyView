import { describe, expect, it } from "vitest";
import type { Candle } from "@ezyview/data-adapters";
import {
  autoBoxSize,
  heikinAshi,
  kagi,
  pointAndFigure,
  renko,
  sequentialTimes,
  volumeProfile,
} from "./transforms.js";

/** Candles whose open/high/low equal the close, one minute apart. */
const closes = (values: number[]): Candle[] =>
  values.map((v, i) => ({ time: 1000 + i * 60, open: v, high: v, low: v, close: v, volume: 1 }));

describe("heikinAshi", () => {
  it("averages each bar into the previous one", () => {
    const ha = heikinAshi([
      { time: 1, open: 10, high: 12, low: 9, close: 11, volume: 5 },
      { time: 2, open: 11, high: 14, low: 10, close: 13, volume: 7 },
    ]);
    expect(ha[0]).toEqual({ time: 1, open: 10.5, high: 12, low: 9, close: 10.5, volume: 5 });
    expect(ha[1]!.open).toBe(10.5);
    expect(ha[1]!.close).toBe(12);
    expect(ha[1]!.high).toBe(14);
    expect(ha[1]!.low).toBe(10);
    expect(ha[1]!.volume).toBe(7);
  });

  it("returns nothing for no candles", () => {
    expect(heikinAshi([])).toEqual([]);
  });
});

describe("autoBoxSize", () => {
  it("rounds the average true range to a readable step", () => {
    const candles = closes([100, 103, 100, 103, 100]);
    expect(autoBoxSize(candles)).toBe(2.5);
  });

  it("falls back to 1% of price for a flat series", () => {
    expect(autoBoxSize(closes([200, 200, 200]))).toBe(2);
  });

  it("is 1 with no candles", () => {
    expect(autoBoxSize([])).toBe(1);
  });
});

describe("renko", () => {
  it("prints one brick per box travelled", () => {
    const bricks = renko(closes([100, 103.5]), 1);
    expect(bricks.map((b) => [b.open, b.close])).toEqual([
      [100, 101],
      [101, 102],
      [102, 103],
    ]);
    expect(bricks.every((b) => b.up && b.time === 1060)).toBe(true);
  });

  it("needs two boxes to reverse", () => {
    const bricks = renko(closes([100, 102, 100.5, 99.9]), 1);
    // 100.5 is only 1.5 boxes off the top: no brick. 99.9 clears two.
    expect(bricks.map((b) => [b.open, b.close, b.up])).toEqual([
      [100, 101, true],
      [101, 102, true],
      [101, 100, false],
    ]);
  });

  it("ignores a non-positive box", () => {
    expect(renko(closes([1, 5]), 0)).toEqual([]);
  });
});

describe("kagi", () => {
  it("extends with the trend and turns on a full reversal", () => {
    const lines = kagi(closes([100, 102, 105, 104, 101, 103, 106]), 3);
    expect(lines.map((l) => [l.start, l.end])).toEqual([
      [100, 105],
      [105, 101],
      [101, 106],
    ]);
  });

  it("goes yin below a waist and yang above a shoulder", () => {
    const lines = kagi(closes([100, 110, 104, 108, 98, 112]), 3);
    expect(lines.map((l) => [l.end, l.yang])).toEqual([
      [110, true],
      [104, true],
      [108, true],
      [98, false], // broke the 104 waist
      [112, true], // broke the 108 shoulder
    ]);
  });

  it("is empty until price moves the reversal amount", () => {
    expect(kagi(closes([100, 101, 99]), 3)).toEqual([]);
  });
});

describe("pointAndFigure", () => {
  it("stacks X columns and turns on a three-box reversal", () => {
    const cols = pointAndFigure(closes([100, 103, 105, 103, 101.5, 104.2, 105.2]), 1);
    expect(cols.map((c) => [c.up, c.open, c.close])).toEqual([
      [true, 100, 105], // X from 100 up to 105
      [false, 104, 102], // O from 104 down to 102 (101.5 rounds up); 104.2 is short of 3 boxes
      [true, 103, 105], // 105.2 clears three boxes off 102
    ]);
  });

  it("does not reverse on a two-box pullback", () => {
    const cols = pointAndFigure(closes([100, 105, 103]), 1);
    expect(cols).toHaveLength(1);
    expect(cols[0]).toMatchObject({ up: true, open: 100, close: 105 });
  });
});

describe("sequentialTimes", () => {
  it("nudges repeats forward so times strictly increase", () => {
    expect(sequentialTimes([10, 10, 10, 20, 15])).toEqual([10, 11, 12, 20, 21]);
  });
});

describe("volumeProfile", () => {
  it("spreads each candle's volume across the bands it crossed", () => {
    const profile = volumeProfile(
      [
        { time: 1, open: 0, high: 10, low: 0, close: 10, volume: 100 },
        { time: 2, open: 6, high: 6, low: 6, close: 5, volume: 50 },
      ],
      2,
    );
    expect(profile.rows).toHaveLength(2);
    expect(profile.rows[0]).toEqual({ low: 0, high: 5, volume: 50, upVolume: 50 });
    expect(profile.rows[1]).toEqual({ low: 5, high: 10, volume: 100, upVolume: 50 });
    expect(profile.poc).toBe(1);
  });

  it("totals the input volume", () => {
    const candles: Candle[] = Array.from({ length: 30 }, (_, i) => ({
      time: i,
      open: 100 + i,
      high: 103 + i,
      low: 98 + i,
      close: 101 + i,
      volume: 10,
    }));
    const total = volumeProfile(candles, 12).rows.reduce((s, r) => s + r.volume, 0);
    expect(total).toBeCloseTo(300);
  });

  it("is empty with no candles", () => {
    expect(volumeProfile([])).toEqual({ rows: [], poc: -1 });
  });
});
