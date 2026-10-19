import { describe, expect, it } from "vitest";
import { DEFAULT_DRAWING_STYLE, P1_TOOLS, TOOL_ANCHORS, isComplete } from "./types.js";
import type { Drawing } from "./types.js";
import { distToSegment, insideRect } from "./geometry.js";
import { fibLevels } from "./fib.js";
import { hitTest, hitTestAll } from "./hitTest.js";

const line = (id: string, tool: Drawing["tool"], points: Drawing["points"]): Drawing => ({
  id,
  tool,
  points,
  style: DEFAULT_DRAWING_STYLE,
});

describe("geometry", () => {
  it("measures distance to a horizontal segment", () => {
    expect(distToSegment({ x: 5, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(10);
    expect(distToSegment({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5); // clamped to endpoint
  });

  it("tests rectangle containment inclusive of padding", () => {
    const a = { x: 10, y: 10 };
    const b = { x: 50, y: 50 };
    expect(insideRect({ x: 30, y: 30 }, a, b)).toBe(true);
    expect(insideRect({ x: 5, y: 30 }, a, b)).toBe(false);
    expect(insideRect({ x: 5, y: 30 }, a, b, 6)).toBe(true);
  });
});

describe("fib", () => {
  it("interpolates levels between the two anchors", () => {
    const levels = fibLevels(100, 200);
    const price = (r: number) => levels.find((l) => l.ratio === r)?.price;
    expect(price(0)).toBe(100);
    expect(price(1)).toBe(200);
    expect(price(0.618)).toBeCloseTo(161.8, 6);
    expect(price(1.618)).toBeCloseTo(261.8, 6);
  });

  it("handles a downside anchor pair", () => {
    const levels = fibLevels(200, 100);
    expect(levels.find((l) => l.ratio === 0.5)?.price).toBe(150);
  });
});

describe("hitTest", () => {
  const trend = line("t1", "trend_line", [
    { time: 0, price: 0 },
    { time: 10, price: 10 },
  ]);
  const trendScreen = [
    { x: 0, y: 100 },
    { x: 100, y: 0 },
  ];

  it("grabs an anchor before the body", () => {
    const hit = hitTest(trend, trendScreen, { x: 0, y: 100 }, 6);
    expect(hit).toEqual({ id: "t1", handle: 0 });
  });

  it("hits the body away from anchors", () => {
    const hit = hitTest(trend, trendScreen, { x: 52, y: 50 }, 6);
    expect(hit?.handle).toBe(-1);
  });

  it("misses when far from a short line", () => {
    expect(hitTest(trend, trendScreen, { x: 500, y: 500 }, 6)).toBeNull();
  });

  it("hits a horizontal line by y only", () => {
    const h = line("h1", "horizontal_line", [{ time: 0, price: 50 }]);
    expect(hitTest(h, [{ x: 999, y: 200 }], { x: 10, y: 203 }, 6)?.handle).toBe(-1);
    expect(hitTest(h, [{ x: 999, y: 200 }], { x: 10, y: 240 }, 6)).toBeNull();
  });

  it("hits a rectangle from anywhere inside", () => {
    const r = line("r1", "rectangle", [
      { time: 0, price: 100 },
      { time: 5, price: 90 },
    ]);
    const screen = [
      { x: 10, y: 10 },
      { x: 110, y: 80 },
    ];
    expect(hitTest(r, screen, { x: 60, y: 45 }, 6)?.handle).toBe(-1);
    expect(hitTest(r, screen, { x: 200, y: 45 }, 6)).toBeNull();
  });

  it("ignores hidden drawings", () => {
    const hidden = { ...trend, hidden: true };
    expect(hitTest(hidden, trendScreen, { x: 0, y: 100 }, 6)).toBeNull();
  });

  it("returns the topmost drawing from a layer stack", () => {
    const layers = [
      { drawing: line("a", "horizontal_line", [{ time: 0, price: 1 }]), screen: [{ x: 0, y: 50 }] },
      { drawing: line("b", "horizontal_line", [{ time: 0, price: 2 }]), screen: [{ x: 0, y: 50 }] },
    ];
    expect(hitTestAll(layers, { x: 100, y: 50 }, 6)?.id).toBe("b");
  });
});

describe("tool table", () => {
  it("P1 tools all declare anchor counts", () => {
    for (const tool of P1_TOOLS) {
      expect(TOOL_ANCHORS[tool]).toBeGreaterThan(0);
      expect(isComplete(tool, Array.from({ length: TOOL_ANCHORS[tool] }, (_, i) => ({ time: i, price: i })))).toBe(true);
      expect(isComplete(tool, [])).toBe(false);
    }
  });
});
