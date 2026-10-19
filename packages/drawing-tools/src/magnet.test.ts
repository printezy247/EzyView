import { describe, expect, it } from "vitest";
import { nearestBarIndex, snapToOhlc } from "./magnet.js";
import type { MagnetBar } from "./magnet.js";

const bars: MagnetBar[] = [
  { time: 100, open: 10, high: 14, low: 9, close: 12 },
  { time: 200, open: 12, high: 20, low: 11, close: 18 },
  { time: 300, open: 18, high: 19, low: 15, close: 16 },
];

describe("nearestBarIndex", () => {
  it("finds the closest bar on either side", () => {
    expect(nearestBarIndex(bars, 100)).toBe(0);
    expect(nearestBarIndex(bars, 140)).toBe(0);
    expect(nearestBarIndex(bars, 160)).toBe(1);
    expect(nearestBarIndex(bars, 299)).toBe(2);
  });

  it("clamps outside the loaded range", () => {
    expect(nearestBarIndex(bars, -50)).toBe(0);
    expect(nearestBarIndex(bars, 9999)).toBe(2);
  });

  it("returns -1 with no bars", () => {
    expect(nearestBarIndex([], 100)).toBe(-1);
  });
});

describe("snapToOhlc", () => {
  it("leaves the point alone when the magnet is off", () => {
    const p = { time: 190, price: 19.4 };
    expect(snapToOhlc(p, bars, "off")).toBe(p);
  });

  it("strong mode snaps time to the bar and price to the nearest level", () => {
    expect(snapToOhlc({ time: 190, price: 19.4 }, bars, "strong")).toEqual({ time: 200, price: 20 });
    expect(snapToOhlc({ time: 210, price: 11.3 }, bars, "strong")).toEqual({ time: 200, price: 11 });
    expect(snapToOhlc({ time: 290, price: 16.4 }, bars, "strong")).toEqual({ time: 300, price: 16 });
  });

  it("strong mode snaps even a far-away click", () => {
    expect(snapToOhlc({ time: 100, price: 500 }, bars, "strong")).toEqual({ time: 100, price: 14 });
  });

  it("weak mode only snaps within reach of a level", () => {
    // Bar 1 range is 9, reach 3.15: 18.5 is 0.5 from the close.
    expect(snapToOhlc({ time: 200, price: 18.5 }, bars, "weak")).toEqual({ time: 200, price: 18 });
    // 40 is 20 above the high: out of reach, untouched.
    const far = { time: 200, price: 40 };
    expect(snapToOhlc(far, bars, "weak")).toBe(far);
  });

  it("returns the point unchanged with no bars", () => {
    const p = { time: 1, price: 1 };
    expect(snapToOhlc(p, [], "strong")).toBe(p);
  });
});
