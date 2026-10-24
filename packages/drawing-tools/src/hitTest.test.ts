import { describe, expect, it } from "vitest";
import { DEFAULT_DRAWING_STYLE, P1_TOOLS, TOOL_ANCHORS, isComplete } from "./types.js";
import type { Drawing } from "./types.js";
import { distToSegment, insideRect } from "./geometry.js";
import { fibLevels } from "./fib.js";
import { hitTest, hitTestAll } from "./hitTest.js";
import { resolvedFibLevels } from "./fib.js";
import { ALL_TOOLS, TOOL_SHORTCUTS, TOOL_SPECS, isFibTool, isPositionTool, toolForShortcut, toolHasFill, toolShowsText, toolSpec, toolSupportsExtend } from "./tools.js";
import { timeframeUnit, visibleOnResolution } from "./visibility.js";

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

  it("ray only hits forward in ray direction, not behind origin", () => {
    const ray = line("r1", "ray", [
      { time: 0, price: 100 },
      { time: 10, price: 100 },
    ]);
    const screen = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ];
    // Forward along ray
    expect(hitTest(ray, screen, { x: 300, y: 100 }, 6)?.handle).toBe(-1);
    // Behind origin anchor (x < 100)
    expect(hitTest(ray, screen, { x: 50, y: 100 }, 6)).toBeNull();
  });

  it("hits fib_extension anchor segments and levels", () => {
    const fibExt = line("fe1", "fib_extension", [
      { time: 0, price: 100 },
      { time: 5, price: 150 },
      { time: 10, price: 120 },
    ]);
    const screen = [
      { x: 0, y: 100 },
      { x: 50, y: 50 },
      { x: 100, y: 80 },
    ];
    // Hit along anchor segment 1 (a to b)
    expect(hitTest(fibExt, screen, { x: 25, y: 75 }, 6)?.handle).toBe(-1);
    // Hit along 100% extension level: y = c.y + (b.y - a.y) * 1.0 = 80 + (50 - 100) * 1 = 30
    expect(hitTest(fibExt, screen, { x: 40, y: 30 }, 6)?.handle).toBe(-1);
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

  it("hit-tests a 3-anchor tool across all three points", () => {
    // Regression: triangle/long/short previously bboxed only the first two
    // anchors, so the third corner was unreachable.
    const triangle = line("t3", "triangle", [
      { time: 0, price: 100 },
      { time: 10, price: 100 },
      { time: 5, price: 90 },
    ]);
    const screen = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 100 },
    ];
    // Body hit, away from every anchor.
    expect(hitTest(triangle, screen, { x: 50, y: 60 }, 6)?.handle).toBe(-1);
    // The third anchor is grabbable — under the old 2-point bbox this missed.
    expect(hitTest(triangle, screen, { x: 50, y: 98 }, 6)?.handle).toBe(2);
  });

  it("returns the topmost drawing from a layer stack", () => {
    const layers = [
      { drawing: line("a", "horizontal_line", [{ time: 0, price: 1 }]), screen: [{ x: 0, y: 50 }] },
      { drawing: line("b", "horizontal_line", [{ time: 0, price: 2 }]), screen: [{ x: 0, y: 50 }] },
    ];
    expect(hitTestAll(layers, { x: 100, y: 50 }, 6)?.id).toBe("b");
  });
});

describe("hitTest with off-view anchors", () => {
  const trend = line("t9", "trend_line", [
    { time: 0, price: 0 },
    { time: 10, price: 10 },
  ]);

  it("keeps grabbing a visible anchor when the other point is off-view", () => {
    const screen = [{ x: 50, y: 50 }, null];
    expect(hitTest(trend, screen, { x: 50, y: 50 }, 6)).toEqual({ id: "t9", handle: 0 });
  });

  it("skips the body when any anchor is off-view", () => {
    // Without the guard this click sits inside the degenerate bounds and would
    // count as a body hit.
    const screen = [{ x: 50, y: 50 }, null];
    expect(hitTest(trend, screen, { x: 55, y: 55 }, 6)).toBeNull();
  });

  it("misses entirely when every anchor is off-view", () => {
    expect(hitTest(trend, [null, null], { x: 50, y: 50 }, 6)).toBeNull();
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

const styled = (id: string, tool: Drawing["tool"], points: Drawing["points"], style: Partial<Drawing["style"]> = {}): Drawing => ({
  ...line(id, tool, points),
  style: { ...DEFAULT_DRAWING_STYLE, ...style },
});

describe("TradingView parity tools", () => {
  it("horizontal_ray hits forward of its anchor only", () => {
    const ray = styled("hr", "horizontal_ray", [{ time: 0, price: 100 }]);
    const screen = [{ x: 120, y: 200 }];
    expect(hitTest(ray, screen, { x: 300, y: 203 }, 6)?.handle).toBe(-1);
    expect(hitTest(ray, screen, { x: 60, y: 200 }, 6)).toBeNull();
    expect(hitTest(ray, screen, { x: 300, y: 230 }, 6)).toBeNull();
  });

  it("info_line hits its body and still grabs anchors", () => {
    const info = styled("il", "info_line", [
      { time: 0, price: 100 },
      { time: 10, price: 110 },
    ]);
    const screen = [
      { x: 0, y: 100 },
      { x: 100, y: 0 },
    ];
    expect(hitTest(info, screen, { x: 50, y: 50 }, 6)?.handle).toBe(-1);
    expect(hitTest(info, screen, { x: 2, y: 99 }, 6)?.handle).toBe(0);
  });

  it("callout hits its leader and its text box", () => {
    const callout = styled("co", "callout", [
      { time: 0, price: 100 },
      { time: 10, price: 110 },
    ]);
    const screen = [
      { x: 100, y: 100 },
      { x: 160, y: 40 },
    ];
    // On the leader segment.
    expect(hitTest(callout, screen, { x: 130, y: 70 }, 6)?.handle).toBe(-1);
    // Inside the box rendered at the second anchor.
    expect(hitTest(callout, screen, { x: 200, y: 50 }, 6)?.handle).toBe(-1);
  });

  it("brush hits any of its strokes, not a coarse bounding box", () => {
    const brush = styled("br", "brush", [
      { time: 0, price: 100 },
      { time: 1, price: 100 },
      { time: 2, price: 100 },
    ]);
    const screen = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 200, y: 0 },
    ];
    expect(hitTest(brush, screen, { x: 50, y: 50 }, 6)?.handle).toBe(-1);
    // The bbox contains this point, but neither stroke passes near it.
    expect(hitTest(brush, screen, { x: 50, y: 90 }, 6)).toBeNull();
  });

  it("parallel_channel hits base, parallel, middle line and fill", () => {
    const channel = styled(
      "pc",
      "parallel_channel",
      [
        { time: 0, price: 100 },
        { time: 10, price: 100 },
        { time: 0, price: 120 },
      ],
      { fill: "#2962ff" },
    );
    const screen = [
      { x: 0, y: 100 },
      { x: 100, y: 100 },
      { x: 0, y: 0 },
    ];
    expect(hitTest(channel, screen, { x: 50, y: 100 }, 6)?.handle).toBe(-1); // base
    expect(hitTest(channel, screen, { x: 50, y: 0 }, 6)?.handle).toBe(-1); // parallel
    expect(hitTest(channel, screen, { x: 50, y: 50 }, 6)?.handle).toBe(-1); // interior/middle
    expect(hitTest(channel, screen, { x: 50, y: 130 }, 6)).toBeNull();
  });

  it("honours extendLeft/extendRight on straight tools", () => {
    const points: Drawing["points"] = [
      { time: 0, price: 0 },
      { time: 10, price: 10 },
    ];
    const screen = [
      { x: 0, y: 100 },
      { x: 100, y: 0 },
    ];
    const plain = styled("e1", "trend_line", points);
    const extended = styled("e2", "trend_line", points, { extendRight: true });
    // Past the b end of the segment.
    expect(hitTest(plain, screen, { x: 130, y: -30 }, 6)).toBeNull();
    expect(hitTest(extended, screen, { x: 130, y: -30 }, 6)?.handle).toBe(-1);
  });

  it("fib retracement uses the drawing's custom enabled levels", () => {
    const base: Drawing["points"] = [
      { time: 0, price: 100 },
      { time: 10, price: 200 },
    ];
    const screen = [
      { x: 0, y: 200 },
      { x: 100, y: 0 },
    ];
    // Only the 50% level is enabled: its y is halfway (100).
    const custom = styled("f1", "fib_retracement", base, {
      fibLevels: [{ ratio: 0.5, label: "50.0%", enabled: true }],
      showLabels: false,
    });
    expect(hitTest(custom, screen, { x: 50, y: 100 }, 6)?.handle).toBe(-1);
    // Default levels include 61.8% (y = 200 - 61.8) — far from the custom 50%.
    const plain = styled("f2", "fib_retracement", base);
    expect(hitTest(plain, screen, { x: 50, y: 176.4 }, 6)?.handle).toBe(-1);
    expect(hitTest(custom, screen, { x: 50, y: 176.4 }, 6)).toBeNull();
  });

  it("reverse measures fib levels from the second anchor", () => {
    const levels = resolvedFibLevels(
      [
        { time: 0, price: 100 },
        { time: 1, price: 200 },
      ],
      { reverse: true },
    );
    expect(levels.find((l) => l.ratio === 0)?.price).toBe(200);
    expect(levels.find((l) => l.ratio === 1)?.price).toBe(100);
  });

  it("long position exposes the width handle and entry/stop/target anatomy", () => {
    const position = styled("lp", "long_position", [
      { time: 0, price: 100 },
      { time: 10, price: 90 },
      { time: 10, price: 120 },
      { time: 20, price: 100 },
    ]);
    const screen = [
      { x: 0, y: 100 },
      { x: 100, y: 150 },
      { x: 100, y: 0 },
      { x: 200, y: 75 },
    ];
    expect(hitTest(position, screen, { x: 2, y: 101 }, 6)?.handle).toBe(0);
    expect(hitTest(position, screen, { x: 100, y: 148 }, 6)?.handle).toBe(1);
    expect(hitTest(position, screen, { x: 100, y: 2 }, 6)?.handle).toBe(2);
    expect(hitTest(position, screen, { x: 200, y: 75 }, 6)?.handle).toBe(3);
    // Entry line, away from every handle.
    expect(hitTest(position, screen, { x: 50, y: 100 }, 6)?.handle).toBe(-1);
  });
});

describe("visibility and tool metadata", () => {
  it("maps resolutions to timeframe buckets", () => {
    expect(timeframeUnit("15m")).toBe("minutes");
    expect(timeframeUnit("4h")).toBe("hours");
    expect(timeframeUnit("1D")).toBe("days");
    expect(timeframeUnit("1W")).toBe("weeks");
    expect(timeframeUnit("1M")).toBe("months");
    expect(timeframeUnit("15s")).toBe("seconds");
  });

  it("hides a drawing only on buckets it explicitly excludes", () => {
    const d = line("v1", "trend_line", [
      { time: 0, price: 0 },
      { time: 1, price: 1 },
    ]);
    expect(visibleOnResolution(d, "1h")).toBe(true);
    expect(visibleOnResolution({ ...d, visibility: { minutes: false } }, "15m")).toBe(false);
    expect(visibleOnResolution({ ...d, visibility: { minutes: false } }, "1h")).toBe(true);
  });

  it("lists every tool exactly once and maps unique shortcuts", () => {
    expect([...ALL_TOOLS].sort()).toEqual(Object.keys(TOOL_SPECS).sort());
    const shortcuts = Object.values(TOOL_SHORTCUTS);
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
    expect(toolForShortcut("t")).toBe("trend_line");
    expect(toolForShortcut("H")).toBe("horizontal_line");
    expect(toolForShortcut("Z")).toBeNull();
  });

  it("declares capabilities the rail and settings share", () => {
    expect(toolShowsText("callout")).toBe(true);
    expect(toolHasFill("rectangle")).toBe(true);
    expect(toolHasFill("trend_line")).toBe(false);
    expect(isPositionTool("short_position")).toBe(true);
    expect(isFibTool("fib_extension")).toBe(true);
    expect(toolSupportsExtend("rectangle")).toBe(true);
    expect(toolSpec("info_line").anchors).toBe(2);
  });
});
