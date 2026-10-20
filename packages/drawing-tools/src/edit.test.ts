import { describe, expect, it } from "vitest";
import { setAnchor, translateDrawing } from "./edit.js";
import { DEFAULT_DRAWING_STYLE, type Drawing } from "./types.js";

const base: Drawing = {
  id: "d1",
  tool: "trend_line",
  points: [
    { time: 100, price: 10 },
    { time: 200, price: 20 },
  ],
  style: { ...DEFAULT_DRAWING_STYLE },
};

describe("setAnchor", () => {
  it("replaces one point and leaves the rest", () => {
    const next = setAnchor(base, 1, { time: 210, price: 25 });
    expect(next.points).toEqual([
      { time: 100, price: 10 },
      { time: 210, price: 25 },
    ]);
    expect(base.points[1]).toEqual({ time: 200, price: 20 }); // original untouched
    expect(next.id).toBe(base.id);
    expect(next.tool).toBe(base.tool);
  });

  it("returns the same drawing for an out-of-range index", () => {
    expect(setAnchor(base, 5, { time: 1, price: 1 })).toBe(base);
  });
});

describe("translateDrawing", () => {
  it("shifts every point by the deltas", () => {
    const next = translateDrawing(base, 50, -3);
    expect(next.points).toEqual([
      { time: 150, price: 7 },
      { time: 250, price: 17 },
    ]);
    expect(base.points[0]).toEqual({ time: 100, price: 10 });
  });

  it("keeps style, text, lock and name", () => {
    const named: Drawing = { ...base, name: "My line", locked: true, text: "hi" };
    const next = translateDrawing(named, 1, 1);
    expect(next.name).toBe("My line");
    expect(next.locked).toBe(true);
    expect(next.text).toBe("hi");
    expect(next.style).toEqual(base.style);
  });
});
