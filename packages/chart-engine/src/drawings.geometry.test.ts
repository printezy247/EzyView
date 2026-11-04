import { describe, expect, it } from "vitest";
import { DEFAULT_DRAWING_STYLE, type Drawing } from "@ezyview/drawing-tools";
import {
  angleLabel,
  countBars,
  displaySegment,
  extendOf,
  extendToEdge,
  fontOf,
  formatDuration,
  hasTime,
  lineDash,
  lineToEdges,
  lowerBound,
  midpoint,
  priceToYFor,
  statsAnchor,
  statsFor,
  labelOf,
  withAlpha,
  type DrawingBar,
} from "./drawings.js";

const BAR = (time: number): DrawingBar => ({ time, open: 1, high: 2, low: 0.5, close: 1.5 });
const BARS: DrawingBar[] = [1000, 2000, 3000, 4000, 5000].map(BAR);

const pts = (...xs: number[]): { time: number; price: number }[] =>
  xs.map((price, i) => ({ time: (i + 1) * 1000, price }));

const drawing = (points: { time: number; price: number }[], style: Partial<Drawing["style"]> = {}, tool: Drawing["tool"] = "trend_line"): Drawing => ({
  id: "d1",
  tool,
  points,
  style: { ...DEFAULT_DRAWING_STYLE, ...style },
});

describe("labelOf", () => {
  it("picks precision from magnitude", () => {
    expect(labelOf(1500.1234)).toBe("1500.12");
    expect(labelOf(1.23456)).toBe("1.2346");
    expect(labelOf(0.00001234)).toBe("0.000012");
  });
});

describe("withAlpha", () => {
  it("blends 6- and 3-digit hex colours", () => {
    expect(withAlpha("#ffffff", 0.5)).toBe("rgba(255, 255, 255, 0.5)");
    expect(withAlpha("#f00", 1)).toBe("rgba(255, 0, 0, 1)");
    expect(withAlpha("#000000", 0)).toBe("rgba(0, 0, 0, 0)");
  });
  it("leaves non-hex colours alone and clamps alpha", () => {
    expect(withAlpha("red", 0.5)).toBe("red");
    expect(withAlpha("#ffffff", 2)).toBe("rgba(255, 255, 255, 1)");
    expect(withAlpha("#ffffff", -1)).toBe("rgba(255, 255, 255, 0)");
  });
});

describe("formatDuration", () => {
  it("formats seconds through days the TradingView way", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(59.6)).toBe("60s");
    expect(formatDuration(90)).toBe("1m");
    expect(formatDuration(3599)).toBe("59m");
    expect(formatDuration(3660)).toBe("1h 1m");
    expect(formatDuration(23 * 3600)).toBe("23h 0m");
    expect(formatDuration(90000)).toBe("1d 1h");
    expect(formatDuration(172800)).toBe("2d");
  });
  it("returns 0m for non-finite or non-positive spans", () => {
    expect(formatDuration(Number.NaN)).toBe("0m");
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(-5)).toBe("0m");
  });
});

describe("angleLabel", () => {
  it("reports degrees with screen y flipped", () => {
    expect(angleLabel({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe("0°");
    expect(angleLabel({ x: 0, y: 100 }, { x: 100, y: 0 })).toBe("45°");
    expect(angleLabel({ x: 100, y: 0 }, { x: 0, y: 100 })).toBe("-135°");
  });
});

describe("lowerBound / hasTime / countBars", () => {
  it("lowerBound finds the first index at or after a time", () => {
    expect(lowerBound(BARS, 0)).toBe(0);
    expect(lowerBound(BARS, 1000)).toBe(0);
    expect(lowerBound(BARS, 1001)).toBe(1);
    expect(lowerBound(BARS, 5000)).toBe(4);
    expect(lowerBound(BARS, 5001)).toBe(5);
  });
  it("hasTime only for exact matches", () => {
    expect(hasTime(BARS, 3000)).toBe(true);
    expect(hasTime(BARS, 3001)).toBe(false);
    expect(hasTime([], 1000)).toBe(false);
  });
  it("countBars counts bars inside the closed range, arms reversed if needed", () => {
    expect(countBars(BARS, 2000, 4000)).toBe(3);
    expect(countBars(BARS, 4000, 2000)).toBe(3);
    expect(countBars(BARS, 1000, 5000)).toBe(5);
    expect(countBars(BARS, 2001, 4999)).toBe(2);
    expect(countBars([], 0, 10)).toBe(0);
  });
});

describe("midpoint / priceToYFor", () => {
  it("midpoint averages both axes", () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });
  it("priceToYFor interpolates linearly along the anchor segment", () => {
    const d = drawing([{ time: 1, price: 100 }, { time: 2, price: 200 }]);
    expect(priceToYFor(d, 150, { x: 0, y: 0 }, { x: 0, y: 100 })).toBe(50);
    expect(priceToYFor(d, 100, { x: 0, y: 0 }, { x: 0, y: 100 })).toBe(0);
  });
  it("returns null on a flat anchor line or missing points", () => {
    const flat = drawing([{ time: 1, price: 100 }, { time: 2, price: 100 }]);
    expect(priceToYFor(flat, 100, { x: 0, y: 0 }, { x: 0, y: 100 })).toBeNull();
    const noPoints = drawing([]);
    expect(priceToYFor(noPoints, 100, { x: 0, y: 0 }, { x: 0, y: 100 })).toBeNull();
  });
});

describe("extendToEdge / lineToEdges", () => {
  it("a zero-length direction returns the input segment", () => {
    const a = { x: 5, y: 5 };
    const [from, to] = extendToEdge(a, a, 100, 100);
    expect(from).toBe(a);
    expect(to).toBe(a);
  });
  it("a ray reaches far past the pane in its direction", () => {
    const [, far] = extendToEdge({ x: 0, y: 0 }, { x: 10, y: 0 }, 100, 100);
    expect(far.x).toBeGreaterThan(100);
    expect(far.y).toBe(0);
  });
  it("lineToEdges extends in both directions", () => {
    const [back, far] = lineToEdges({ x: 40, y: 50 }, { x: 60, y: 50 }, 100, 100);
    expect(back.x).toBeLessThan(40);
    expect(far.x).toBeGreaterThan(60);
    expect(back.y).toBe(50);
    expect(far.y).toBe(50);
  });
});

describe("extendOf / displaySegment", () => {
  it("extendOf maps style flags to booleans", () => {
    expect(extendOf(drawing(pts(1, 2), {}))).toEqual([false, false]);
    expect(extendOf(drawing(pts(1, 2), { extendRight: true }))).toEqual([false, true]);
    expect(extendOf(drawing(pts(1, 2), { extendLeft: true, extendRight: true }))).toEqual([true, true]);
  });
  it("displaySegment returns the raw segment with no extend", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 10 };
    expect(displaySegment(drawing(pts(1, 2)), a, b, 100, 100)).toEqual([a, b]);
  });
  it("displaySegment extends only the requested ends", () => {
    const a = { x: 10, y: 50 };
    const b = { x: 20, y: 50 };
    const [s, e] = displaySegment(drawing(pts(1, 2), { extendRight: true }), a, b, 100, 100);
    expect(s).toBe(a);
    expect(e.x).toBeGreaterThan(20);
    const [s2, e2] = displaySegment(drawing(pts(1, 2), { extendLeft: true }), a, b, 100, 100);
    expect(e2).toBe(b);
    expect(s2.x).toBeLessThan(10);
  });
  it("displaySegment extends both ends when asked", () => {
    const [s, e] = displaySegment(drawing(pts(1, 2), { extendLeft: true, extendRight: true }), { x: 40, y: 50 }, { x: 60, y: 50 }, 100, 100);
    expect(s.x).toBeLessThan(40);
    expect(e.x).toBeGreaterThan(60);
  });
});

describe("lineDash / fontOf", () => {
  it("lineDash maps the named styles", () => {
    expect(lineDash("dashed")).toEqual([6, 4]);
    expect(lineDash("dotted")).toEqual([2, 3]);
    expect(lineDash("solid")).toEqual([]);
  });
  it("fontOf composes style, weight and size", () => {
    expect(fontOf({ ...DEFAULT_DRAWING_STYLE })).toBe("normal normal 13px Inter, system-ui, sans-serif");
    expect(fontOf({ ...DEFAULT_DRAWING_STYLE, fontSize: 20, fontWeight: "bold", fontStyle: "italic" })).toBe(
      "italic bold 20px Inter, system-ui, sans-serif",
    );
  });
});

describe("statsFor", () => {
  it("absolute mode prints one line: magnitude and percent", () => {
    const d = drawing(pts(100, 110));
    const out = statsFor(d, BARS, false);
    expect(out).toHaveLength(1);
    expect(out![0]).toBe("10.0000 (10.00%)");
  });
  it("zero base price reports 0% rather than dividing by zero", () => {
    const d = drawing(pts(0, 10));
    expect(statsFor(d, BARS, false)![0]).toBe("10.0000 (0.00%)");
  });
  it("missing anchors produce null", () => {
    expect(statsFor(drawing([]), BARS, false)).toBeNull();
    expect(statsFor(drawing([{ time: 1, price: 100 }]), BARS, true)).toBeNull();
  });
  it("line mode prints signed delta plus bars and duration", () => {
    const d = drawing([
      { time: 2000, price: 100 },
      { time: 5000, price: 110 },
    ]);
    const out = statsFor(d, BARS, true);
    expect(out).toHaveLength(2);
    expect(out![0]).toBe("+10.0000 (+10.00%)");
    expect(out![1]).toBe("4 bars · 50m");
  });
  it("negative moves keep their sign", () => {
    const d = drawing([
      { time: 2000, price: 110 },
      { time: 3000, price: 99 },
    ]);
    const out = statsFor(d, BARS, true);
    expect(out![0]).toBe("-11.0000 (-10.00%)");
  });
});

describe("statsAnchor", () => {
  const a = { x: 10, y: 90 };
  const b = { x: 90, y: 10 };
  it("top places above the higher edge, flagged above", () => {
    expect(statsAnchor(drawing(pts(1, 2), { statsPosition: "top" }), a, b, 200)).toEqual({ x: 50, y: 10, above: true });
  });
  it("bottom places below the lower edge", () => {
    expect(statsAnchor(drawing(pts(1, 2), { statsPosition: "bottom" }), a, b, 200)).toEqual({ x: 50, y: 104 });
  });
  it("middle centres on the segment", () => {
    expect(statsAnchor(drawing(pts(1, 2), { statsPosition: "middle" }), a, b, 200)).toEqual({ x: 50, y: 50 });
  });
  it("right clamps inside the pane and sits at the far edge", () => {
    expect(statsAnchor(drawing(pts(1, 2), { statsPosition: "right" }), a, b, 200)).toEqual({ x: 100, y: 50 });
    expect(statsAnchor(drawing(pts(1, 2), { statsPosition: "right" }), a, { x: 500, y: 10 }, 200)).toEqual({ x: 188, y: 50 });
  });
});
