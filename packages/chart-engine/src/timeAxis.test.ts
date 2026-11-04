import { describe, expect, it } from "vitest";
import { barStep, timeToX, xToTime } from "./timeAxis.js";

// Bars at t = 1000, 1060, ... (60s apart). Bar i sits at x = 100 + 10 * i.
const times = [1000, 1060, 1120, 1180, 1240];
const l0 = 100;
const spacing = 10;

describe("barStep", () => {
  it("uses the median bar gap, ignoring weekend-style outliers", () => {
    expect(barStep([0, 60, 120, 180, 100000, 100060])).toBe(60);
  });
  it("falls back to 0 for fewer than two bars", () => {
    expect(barStep([])).toBe(0);
    expect(barStep([5])).toBe(0);
  });
});

describe("xToTime", () => {
  it("maps an exact bar position to its timestamp", () => {
    expect(xToTime(times, l0, spacing, 120)).toBe(1120);
  });
  it("interpolates between bars", () => {
    expect(xToTime(times, l0, spacing, 125)).toBe(1150);
  });
  it("extrapolates past the last bar by the bar step", () => {
    // x = 100 + 10 * 9 → index 9 → 5 bars after the last (index 4)
    expect(xToTime(times, l0, spacing, 190)).toBe(1240 + 5 * 60);
  });
  it("extrapolates before the first bar", () => {
    expect(xToTime(times, l0, spacing, 70)).toBe(1000 - 3 * 60);
  });
  it("returns null with no data or a degenerate scale", () => {
    expect(xToTime([], l0, spacing, 120)).toBeNull();
    expect(xToTime(times, l0, 0, 120)).toBeNull();
    expect(xToTime([1000], l0, spacing, 120)).toBeNull();
  });
});

describe("timeToX", () => {
  it("is the inverse of xToTime inside, before and after the data", () => {
    for (const x of [70, 100, 125, 140, 190, 400]) {
      const t = xToTime(times, l0, spacing, x)!;
      expect(timeToX(times, l0, spacing, t)).toBeCloseTo(x, 6);
    }
  });
  it("places an off-grid time between its neighbours", () => {
    expect(timeToX(times, l0, spacing, 1090)).toBe(115);
  });
  it("returns null with no usable data", () => {
    expect(timeToX([], l0, spacing, 1000)).toBeNull();
    expect(timeToX([1000], l0, spacing, 1000)).toBeNull();
  });
});
