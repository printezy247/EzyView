import { describe, expect, it } from "vitest";
import { linregSlope, wma } from "./helpers.js";

/**
 * The incremental WMA / linreg-slope updates (Phase 5) must match the naive
 * O(n·p) reference exactly in shape and to float tolerance in value, on random
 * data — not just on the fixtures the catalog tests pin.
 */

const randomWalk = (n: number, seed = 42): number[] => {
  let x = seed;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    // Deterministic xorshift so failures are reproducible.
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    out.push(((x % 10_000) / 100) | 0);
  }
  return out;
};

const assertCloseList = (values: (number | null)[], ref: (number | null)[], digits: number) => {
  // Pairwise: null shape must match exactly; numbers within `digits` decimals.
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const r = ref[i];
    if (v === null || r === null) expect(v).toBeNull();
    else expect(v).toBeCloseTo(r as number, digits);
  }
};

const naiveWma = (values: number[], period: number): (number | null)[] => {
  const denom = (period * (period + 1)) / 2;
  return values.map((_, i) => {
    if (i < period - 1) return null;
    let sum = 0;
    for (let j = 0; j < period; j++) sum += values[i - j]! * (period - j);
    return sum / denom;
  });
};

const naiveSlope = (values: number[], period: number): (number | null)[] => {
  const sumX = (period * (period - 1)) / 2;
  const sumXX = (period * (period - 1) * (2 * period - 1)) / 6;
  const denom = period * sumXX - sumX * sumX;
  return values.map((_, i) => {
    if (i < period - 1) return null;
    let sumY = 0;
    let sumXY = 0;
    for (let j = 0; j < period; j++) {
      const y = values[i - j]!;
      sumY += y;
      sumXY += j * y;
    }
    return (period * sumXY - sumX * sumY) / denom;
  });
};

describe("incremental wma/linregSlope equivalence", () => {
  for (const period of [1, 2, 3, 14, 50, 200]) {
    it(`wma(period=${period}) matches the naive reference`, () => {
      const src = randomWalk(400, 51 + period);
      // Asserts pairwise: null shape exact, otherwise toBeCloseTo.
      assertCloseList(wma(src, period), naiveWma(src, period), 9);
    });

    it(`linregSlope(period=${period}) matches the naive reference`, () => {
      const src = randomWalk(400, 17 + period);
      assertCloseList(linregSlope(src, period), naiveSlope(src, period), 8);
    });
  }

  it("short series and period > length stay all-null", () => {
    expect(wma([1, 2, 3], 5).every((v) => v === null)).toBe(true);
    expect(linregSlope([1, 2, 3], 5).every((v) => v === null)).toBe(true);
    expect(linregSlope([1], 1).every((v) => v === null)).toBe(true);
  });
});
