import { describe, expect, it } from "vitest";
import { DEFAULT_DRAWING_STYLE, type Drawing, type DrawingToolId } from "./types.js";
import { advancedFigure, advancedHitTest, isAdvancedTool, isComplete, TOOL_ANCHORS } from "./index.js";

const at = (x: number, y: number) => ({ x, y });

const drawing = (tool: DrawingToolId, points: { time: number; price: number }[]): Drawing => ({
  id: tool,
  tool,
  points,
  style: { ...DEFAULT_DRAWING_STYLE },
});

const anchors = (n: number) => Array.from({ length: n }, (_, i) => ({ time: i, price: 100 + i * 10 }));
const screen = (n: number) => Array.from({ length: n }, (_, i) => at(40 + i * 50, 100 + (i % 2) * 30));

describe("advanced drawing packs", () => {
  it("recognises every new tool and keeps anchors in step with TOOL_ANCHORS", () => {
    const tools: DrawingToolId[] = [
      "pitchfork_standard",
      "fib_fan",
      "fib_arcs",
      "fib_channel",
      "fib_timezones",
      "fib_wedge",
      "gann_fan",
      "gann_box",
      "gann_square",
      "gann_square_from_two",
      "gann_time",
      "xabcd",
      "cypher",
      "head_shoulders",
      "abcd",
      "three_drives",
      "elliott_impulse",
      "elliott_correction",
      "elliott_triangle",
      "cup_handle",
      "image",
      "sticker",
      "pin",
      "comment",
      "price_note",
      "arrow_marker",
      "highlighter",
      "date_price_range",
      "price_range",
      "projected_range",
      "bars_pattern",
      "forecast",
      "rotated_rectangle",
      "circle",
      "polyline",
      "arc",
      "curve",
      "double_curve",
    ];
    for (const tool of tools) {
      expect(isAdvancedTool(tool)).toBe(true);
      expect(TOOL_ANCHORS[tool]).toBeGreaterThan(0);
      expect(isComplete(tool, anchors(TOOL_ANCHORS[tool]))).toBe(true);
    }
    expect(isAdvancedTool("trend_line")).toBe(false);
  });

  it("builds a median line plus two parallels for every pitchfork variant", () => {
    for (const tool of ["pitchfork_standard", "pitchfork_schiff", "pitchfork_modified_schiff", "pitchfork_inside"] as const) {
      const figure = advancedFigure(drawing(tool, anchors(3)), screen(3));
      expect(figure.segments).toHaveLength(3);
      expect(figure.segments[0]!.points).toHaveLength(2);
      expect(figure.segments[1]!.dashed).toBe(true);
      expect(figure.segments[2]!.dashed).toBe(true);
    }
  });

  it("draws seven fib fan rays and six non-zero arcs", () => {
    const fan = advancedFigure(drawing("fib_fan", anchors(2)), screen(2));
    expect(fan.segments).toHaveLength(7);
    const arcs = advancedFigure(drawing("fib_arcs", anchors(2)), screen(2));
    expect(arcs.arcs).toHaveLength(6);
  });

  it("draws a Gann box with both diagonals and quarter lines", () => {
    const figure = advancedFigure(drawing("gann_box", anchors(2)), screen(2));
    expect(figure.polygons).toHaveLength(1);
    expect(figure.segments.length).toBeGreaterThanOrEqual(6);
  });

  it("labels every anchor of a harmonic pattern and each leg ratio", () => {
    const figure = advancedFigure(drawing("xabcd", anchors(5)), screen(5));
    expect(figure.segments[0]!.points).toHaveLength(5);
    expect(figure.labels.filter((l) => ["X", "A", "B", "C", "D"].includes(l.text))).toHaveLength(5);
    expect(figure.labels.some((l) => /^\d\.\d{3}$/.test(l.text))).toBe(true);
  });

  it("hit-tests the body but not empty space", () => {
    const d = drawing("gann_box", anchors(2));
    const pts = [at(10, 10), at(110, 110)];
    expect(advancedHitTest(d, pts, at(60, 60))).toBe(true);
    expect(advancedHitTest(d, pts, at(300, 300))).toBe(false);
    const fork = drawing("pitchfork_standard", anchors(3));
    const forkPts = [at(10, 10), at(110, 10), at(60, 110)];
    expect(advancedHitTest(fork, forkPts, at(60, 60), 8)).toBe(false); // between the three lines
    expect(advancedHitTest(fork, forkPts, at(85, 60), 8)).toBe(true); // on the median
  });

  it("builds curves and rotated rectangles without degenerate output", () => {
    const curve = advancedFigure(drawing("curve", anchors(3)), screen(3));
    expect(curve.segments[0]!.points.length).toBeGreaterThan(3);
    const rect = advancedFigure(drawing("rotated_rectangle", anchors(2)), screen(2));
    expect(rect.polygons[0]).toHaveLength(4);
    const circle = advancedFigure(drawing("circle", anchors(2)), screen(2));
    expect(circle.arcs[0]!.radius).toBeGreaterThan(0);
  });
});
