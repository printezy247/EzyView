import type { Drawing, DrawingToolId, ScreenPoint } from "./types.js";
import { distToPolyline, distToSegment, distToInfiniteLine, insidePolygon, insideRect, near } from "./geometry.js";

/**
 * Geometry for the second generation of drawing tools: pitchforks, Fibonacci
 * fans/arcs/channels/time zones, Gann tools, harmonic and Elliott patterns,
 * annotations, projections and the curved shape family.
 *
 * Everything here is pure and screen-space: the renderer and the hit test both
 * call these functions, so a click can never land on a line the canvas did not
 * draw. Chart-space ratios are taken from `drawing.points` and converted by the
 * caller before drawing.
 */

export const PITCHFORK_TOOLS = [
  "pitchfork_standard",
  "pitchfork_schiff",
  "pitchfork_modified_schiff",
  "pitchfork_inside",
] as const;

export const FIB_PACK_TOOLS = ["fib_fan", "fib_arcs", "fib_channel", "fib_timezones", "fib_wedge"] as const;

export const GANN_PACK_TOOLS = ["gann_fan", "gann_box", "gann_square", "gann_square_from_two", "gann_time"] as const;

export const PATTERN_PACK_TOOLS = [
  "xabcd",
  "cypher",
  "head_shoulders",
  "abcd",
  "three_drives",
  "elliott_impulse",
  "elliott_correction",
  "elliott_triangle",
  "cup_handle",
] as const;

export const ANNOTATION_PACK_TOOLS = [
  "image",
  "sticker",
  "pin",
  "comment",
  "price_note",
  "arrow_marker",
  "highlighter",
] as const;

export const PROJECTION_PACK_TOOLS = [
  "date_price_range",
  "price_range",
  "projected_range",
  "bars_pattern",
  "forecast",
] as const;

export const SHAPE_PACK_TOOLS = [
  "rotated_rectangle",
  "circle",
  "polyline",
  "arc",
  "curve",
  "double_curve",
] as const;

const ADVANCED = new Set<string>([
  ...PITCHFORK_TOOLS,
  ...FIB_PACK_TOOLS,
  ...GANN_PACK_TOOLS,
  ...PATTERN_PACK_TOOLS,
  ...ANNOTATION_PACK_TOOLS,
  ...PROJECTION_PACK_TOOLS,
  ...SHAPE_PACK_TOOLS,
]);

export function isAdvancedTool(tool: DrawingToolId): boolean {
  return ADVANCED.has(tool);
}

/** One stroked piece of an advanced tool, before the canvas paints it. */
export interface AdvancedSegment {
  points: ScreenPoint[];
  dashed?: boolean;
  /** Overrides the drawing colour (used for Gann/Fib level emphasis). */
  color?: string;
  width?: number;
  /** Draw the segment as a closed polygon instead of a polyline. */
  close?: boolean;
}

/** One text badge attached to an advanced tool. */
export interface AdvancedLabel {
  at: ScreenPoint;
  text: string;
  /** `above` nudges the baseline up, so a label does not sit on its line. */
  above?: boolean;
  align?: "left" | "center" | "right";
}

export interface AdvancedFigure {
  segments: AdvancedSegment[];
  /** Filled enclosed areas, in the order the renderer should paint them. */
  polygons: ScreenPoint[][];
  labels: AdvancedLabel[];
  /** Circles/arcs as `[centre, radius, startAngle, endAngle]`. */
  arcs: { centre: ScreenPoint; radius: number; start: number; end: number }[];
}

const mid = (a: ScreenPoint, b: ScreenPoint): ScreenPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const add = (a: ScreenPoint, b: ScreenPoint): ScreenPoint => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: ScreenPoint, b: ScreenPoint): ScreenPoint => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (a: ScreenPoint, k: number): ScreenPoint => ({ x: a.x * k, y: a.y * k });
const len = (a: ScreenPoint): number => Math.hypot(a.x, a.y);

/** Point `t` of the way from A to B, optionally continued past B. */
const lerp = (a: ScreenPoint, b: ScreenPoint, t: number): ScreenPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
const GANN_ANGLES = [0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180] as const;

/** The pivot each pitchfork variant uses, plus its two parallel handles. */
export function pitchforkGeometry(
  tool: (typeof PITCHFORK_TOOLS)[number],
  a: ScreenPoint,
  b: ScreenPoint,
  c: ScreenPoint,
): { origin: ScreenPoint; medianEnd: ScreenPoint; upper: [ScreenPoint, ScreenPoint]; lower: [ScreenPoint, ScreenPoint] } {
  const pivot =
    tool === "pitchfork_schiff"
      ? mid(a, b)
      : tool === "pitchfork_modified_schiff"
        ? mid(mid(a, b), a)
        : tool === "pitchfork_inside"
          ? mid(a, mid(b, c))
          : a;
  const end = mid(b, c);
  const d = sub(end, pivot);
  return {
    origin: pivot,
    medianEnd: end,
    upper: [b, add(b, d)],
    lower: [c, add(c, d)],
  };
}

/** Parallel offsets for a fib channel: the base AB and the line through C. */
export function fibChannelGeometry(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint): {
  base: [ScreenPoint, ScreenPoint];
  offset: ScreenPoint;
} {
  const ab = sub(b, a);
  const length = Math.max(len(ab), 1e-6);
  const t = ((c.x - a.x) * ab.x + (c.y - a.y) * ab.y) / (length * length);
  const projection = add(a, scale(ab, t));
  return { base: [a, b], offset: sub(c, projection) };
}

/** Box corners for a rotated rectangle: AB is one edge, the width is |AB|/2. */
export function rotatedRectangleCorners(a: ScreenPoint, b: ScreenPoint): ScreenPoint[] {
  const edge = sub(b, a);
  const normal = { x: -edge.y, y: edge.x };
  const depth = 0.5;
  return [a, b, add(b, scale(normal, depth)), add(a, scale(normal, depth))];
}

/** Corner points of a square whose diagonal is AB. */
export function squareFromTwo(a: ScreenPoint, b: ScreenPoint): ScreenPoint[] {
  const centre = mid(a, b);
  const dx = (b.x - a.x) / 2;
  const dy = (b.y - a.y) / 2;
  return [
    { x: centre.x - dy, y: centre.y + dx },
    { x: centre.x + dy, y: centre.y - dx },
    { x: centre.x + dx, y: centre.y + dy },
    { x: centre.x - dx, y: centre.y - dy },
  ];
}

/** A smooth Catmull-Rom curve sampled into a polyline. */
export function smoothCurve(points: readonly ScreenPoint[], samples = 18): ScreenPoint[] {
  if (points.length < 3) return [...points];
  const out: ScreenPoint[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    for (let s = 0; s < samples; s++) {
      const t = s / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}

/** Harmonic/Elliott ratio between two legs, as the label shown on the chart. */
export function legRatio(from: ScreenPoint, to: ScreenPoint, reference: ScreenPoint[]): number | null {
  const referenceLength = reference.length >= 2 ? Math.abs(reference[1]!.y - reference[0]!.y) : 0;
  if (referenceLength === 0) return null;
  return Math.abs(to.y - from.y) / referenceLength;
}

const patternLabels = (tool: string, count: number): string[] => {
  if (tool === "xabcd" || tool === "cypher") return ["X", "A", "B", "C", "D"].slice(0, count);
  if (tool === "elliott_impulse") return ["0", "1", "2", "3", "4", "5"].slice(0, count);
  if (tool === "elliott_correction") return ["0", "A", "B", "C"].slice(0, count);
  if (tool === "elliott_triangle") return ["A", "B", "C", "D", "E", "F"].slice(0, count);
  if (tool === "head_shoulders") return ["L", "S", "H", "S", "L"].slice(0, count);
  if (tool === "three_drives") return ["0", "1", "2", "3", "4", "5"].slice(0, count);
  if (tool === "cup_handle") return ["L", "B", "R", "H", "E"].slice(0, count);
  return ["A", "B", "C", "D", "E", "F"].slice(0, count);
};

/**
 * Everything needed to paint (and hit-test) one advanced drawing. The caller
 * supplies already-projected anchors; null anchors mean the figure is
 * off-screen, so the figure is empty rather than partially wrong.
 */
export function advancedFigure(drawing: Drawing, pts: readonly (ScreenPoint | null)[]): AdvancedFigure {
  const figure: AdvancedFigure = { segments: [], polygons: [], labels: [], arcs: [] };
  const p = pts.filter((x): x is ScreenPoint => x !== null);
  if (p.length === 0) return figure;
  const [a, b, c, d, e, f] = p;

  const label = (at: ScreenPoint, text: string, above = true) =>
    figure.labels.push({ at, text, above, align: "center" });

  switch (drawing.tool) {
    case "pitchfork_standard":
    case "pitchfork_schiff":
    case "pitchfork_modified_schiff":
    case "pitchfork_inside": {
      if (!a || !b || !c) break;
      const fork = pitchforkGeometry(drawing.tool, a, b, c);
      figure.segments.push({ points: [fork.origin, fork.medianEnd] });
      figure.segments.push({ points: fork.upper, dashed: true });
      figure.segments.push({ points: fork.lower, dashed: true });
      break;
    }
    case "fib_fan": {
      if (!a || !b) break;
      for (const ratio of FIB_RATIOS) {
        const end = lerp(a, b, ratio);
        figure.segments.push({ points: [a, lerp(a, end, 2.4)] });
        label(end, `${(ratio * 100).toFixed(1)}%`);
      }
      break;
    }
    case "fib_arcs": {
      if (!a || !b) break;
      const radius = len(sub(b, a));
      for (const ratio of FIB_RATIOS) {
        if (ratio === 0) continue;
        figure.arcs.push({ centre: a, radius: radius * ratio, start: 0, end: Math.PI * 2 });
      }
      break;
    }
    case "fib_channel": {
      if (!a || !b || !c) break;
      const channel = fibChannelGeometry(a, b, c);
      figure.segments.push({ points: channel.base });
      figure.polygons.push([a, b, add(b, channel.offset), add(a, channel.offset)]);
      figure.segments.push({ points: [add(a, channel.offset), add(b, channel.offset)] });
      for (const ratio of [0.382, 0.5, 0.618]) {
        figure.segments.push({
          points: [add(a, scale(channel.offset, ratio)), add(b, scale(channel.offset, ratio))],
          dashed: true,
        });
      }
      break;
    }
    case "fib_timezones": {
      if (!a || !b) break;
      for (const ratio of FIB_RATIOS) {
        const x = lerp(a, b, ratio).x;
        figure.segments.push({ points: [{ x, y: a.y - 40 }, { x, y: a.y + 40 }], dashed: ratio !== 0 });
        label({ x, y: a.y - 46 }, `${(ratio * 100).toFixed(0)}%`);
      }
      break;
    }
    case "fib_wedge": {
      if (!a || !b || !c) break;
      figure.polygons.push([a, b, c]);
      for (const ratio of [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]) {
        figure.segments.push({ points: [a, lerp(b, c, ratio)] });
      }
      break;
    }
    case "gann_fan": {
      if (!a || !b) break;
      const radius = Math.max(len(sub(b, a)), 12);
      for (const angle of GANN_ANGLES) {
        const theta = (angle * Math.PI) / 180;
        figure.segments.push({ points: [a, { x: a.x + Math.cos(theta) * radius * 2.2, y: a.y + Math.sin(theta) * radius * 2.2 }] });
      }
      break;
    }
    case "gann_box": {
      if (!a || !b) break;
      figure.polygons.push([a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }]);
      for (const ratio of [0.25, 0.5, 0.75]) {
        figure.segments.push({ points: [lerp(a, { x: a.x, y: b.y }, ratio), lerp({ x: b.x, y: a.y }, b, ratio)], dashed: true });
        figure.segments.push({ points: [lerp(a, { x: b.x, y: a.y }, ratio), lerp({ x: a.x, y: b.y }, b, ratio)], dashed: true });
      }
      figure.segments.push({ points: [a, b], dashed: false });
      figure.segments.push({ points: [{ x: a.x, y: b.y }, { x: b.x, y: a.y }], dashed: false });
      break;
    }
    case "gann_square":
    case "gann_square_from_two": {
      if (!a || !b) break;
      if (drawing.tool === "gann_square_from_two") {
        const corners = squareFromTwo(a, b);
        figure.polygons.push(corners);
        for (const point of corners) figure.segments.push({ points: [mid(a, b), point], dashed: true });
        break;
      }
      const side = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      const x1 = a.x + Math.sign(b.x - a.x || 1) * side;
      const y1 = a.y + Math.sign(b.y - a.y || 1) * side;
      const corners = [a, { x: x1, y: a.y }, { x: x1, y: y1 }, { x: a.x, y: y1 }];
      figure.polygons.push(corners);
      figure.segments.push({ points: [a, { x: x1, y: y1 }], dashed: true });
      figure.segments.push({ points: [{ x: a.x, y: y1 }, { x: x1, y: a.y }], dashed: true });
      break;
    }
    case "gann_time": {
      if (!a || !b) break;
      for (const ratio of [1 / 3, 2 / 3, 1]) {
        const x = lerp(a, b, ratio).x;
        figure.segments.push({ points: [{ x, y: a.y }, { x, y: b.y }], dashed: ratio !== 1 });
        label({ x, y: b.y }, `${Math.round(ratio * 3)}`);
      }
      for (const ratio of [1 / 3, 2 / 3, 1]) {
        const y = lerp(a, b, ratio).y;
        figure.segments.push({ points: [{ x: a.x, y }, { x: b.x, y }], dashed: true });
      }
      break;
    }
    case "xabcd":
    case "cypher":
    case "head_shoulders":
    case "abcd":
    case "three_drives":
    case "elliott_impulse":
    case "elliott_correction":
    case "elliott_triangle":
    case "cup_handle": {
      const labels = patternLabels(drawing.tool, p.length);
      figure.segments.push({ points: p, close: false });
      p.forEach((point, i) => label({ x: point.x, y: point.y - 12 }, labels[i] ?? String(i + 1)));
      for (let i = 1; i < p.length; i++) {
        const from = p[i - 1]!;
        const to = p[i]!;
        const ratio = legRatio(from, to, p.slice(0, 2));
        if (ratio !== null) label(mid(from, to), `${ratio.toFixed(3)}`, false);
      }
      if (drawing.tool === "cup_handle" && p.length >= 4) {
        const bowl = smoothCurve([a!, mid(a!, b!), b!, mid(b!, c!), c!], 12);
        figure.segments.push({ points: bowl, dashed: true });
        figure.segments.push({ points: [c!, d!] });
      }
      break;
    }
    case "image": {
      if (!a || !b) break;
      figure.polygons.push([a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }]);
      label(mid(a, b), drawing.image?.assetId ? "Image" : "Image (unset)");
      break;
    }
    case "sticker":
    case "pin": {
      if (!a) break;
      figure.arcs.push({ centre: a, radius: 14, start: 0, end: Math.PI * 2 });
      label({ x: a.x, y: a.y + 4 }, drawing.text || (drawing.tool === "pin" ? "📌" : "🙂"), false);
      break;
    }
    case "comment": {
      if (!a || !b) break;
      figure.polygons.push([b, { x: b.x + 150, y: b.y }, { x: b.x + 150, y: b.y + 52 }, { x: b.x, y: b.y + 52 }]);
      figure.segments.push({ points: [a, b], dashed: true });
      label({ x: b.x + 8, y: b.y + 8 }, drawing.text || "Comment", false);
      break;
    }
    case "price_note": {
      if (!a) break;
      figure.segments.push({ points: [{ x: 0, y: a.y }, { x: a.x, y: a.y }], dashed: true });
      label({ x: a.x, y: a.y - 10 }, drawing.text || "Note");
      break;
    }
    case "arrow_marker": {
      if (!a || !b) break;
      figure.segments.push({ points: [a, b] });
      break;
    }
    case "highlighter": {
      figure.segments.push({ points: p, width: Math.max(10, drawing.style.width * 8) });
      break;
    }
    case "date_price_range":
    case "price_range":
    case "projected_range": {
      if (!a || !b) break;
      const box = drawing.tool === "price_range" ? [a, { x: p[p.length - 1]!.x, y: b.y }, b, { x: a.x, y: b.y }] : [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
      figure.polygons.push(box);
      label(mid(a, b), `${drawing.tool.replace(/_/g, " ")}`, false);
      break;
    }
    case "bars_pattern": {
      if (!a || !b) break;
      const bars = 8;
      const step = (b.x - a.x) / bars;
      const height = Math.abs(b.y - a.y);
      for (let i = 0; i < bars; i++) {
        const x = a.x + step * i;
        const wave = 0.25 + Math.abs(Math.sin(i * 1.7)) * 0.75;
        const y = b.y + (height * wave) / 2;
        figure.segments.push({ points: [{ x, y: b.y - (height * wave) / 2 }, { x, y }], width: Math.max(1, Math.abs(step) * 0.55) });
      }
      label({ x: mid(a, b).x, y: Math.min(a.y, b.y) - 8 }, "Bars pattern");
      break;
    }
    case "forecast": {
      if (!a || !b || !c) break;
      figure.polygons.push([a, b, c]);
      figure.segments.push({ points: [a, b] });
      figure.segments.push({ points: [b, c], dashed: true });
      for (const ratio of [0.382, 0.618, 1]) {
        figure.segments.push({ points: [lerp(a, b, 1), lerp(b, c, ratio)], dashed: true });
      }
      label(mid(b, c), "Forecast");
      break;
    }
    case "rotated_rectangle": {
      if (!a || !b) break;
      const corners = rotatedRectangleCorners(a, b);
      figure.polygons.push(corners);
      break;
    }
    case "circle": {
      if (!a || !b) break;
      figure.arcs.push({ centre: a, radius: len(sub(b, a)), start: 0, end: Math.PI * 2 });
      break;
    }
    case "polyline": {
      figure.segments.push({ points: p });
      break;
    }
    case "arc": {
      if (!a || !b || !c) break;
      figure.arcs.push({ centre: a, radius: len(sub(b, a)), start: Math.atan2(b.y - a.y, b.x - a.x), end: Math.atan2(c.y - a.y, c.x - a.x) });
      break;
    }
    case "curve": {
      if (p.length < 2) break;
      figure.segments.push({ points: smoothCurve(p) });
      break;
    }
    case "double_curve": {
      if (!a || !b || !c) break;
      figure.segments.push({ points: smoothCurve([a, b, c]) });
      if (d) figure.segments.push({ points: smoothCurve([c, d, a]) });
      break;
    }
    default:
      break;
  }
  // `e`/`f` are destructured only so future pattern variants can use them
  // without re-plumbing the switch; silence the unused-variable lint.
  void e;
  void f;
  return figure;
}

/** Does a click land on the body of an advanced drawing? */
export function advancedHitTest(
  drawing: Drawing,
  screen: readonly (ScreenPoint | null)[],
  click: ScreenPoint,
  tol = 6,
): boolean {
  if (!isAdvancedTool(drawing.tool)) return false;
  const figure = advancedFigure(drawing, screen);
  for (const polygon of figure.polygons) {
    if (insidePolygon(click, polygon)) return true;
  }
  for (const segment of figure.segments) {
    if (distToPolyline(click, segment.points) <= tol + (segment.width ?? 0) / 2) return true;
  }
  for (const arc of figure.arcs) {
    const radius = len(sub(click, arc.centre));
    if (Math.abs(radius - arc.radius) <= tol) return true;
  }
  // Sparse annotations (a pin, a single sticker) still need a target.
  if (screen.length === 1) {
    const only = screen[0];
    if (only && near(click, only, Math.max(tol, 14))) return true;
  }
  if (drawing.tool === "image" || drawing.tool === "comment") {
    const [a, b] = screen;
    if (a && b && insideRect(click, a, b, tol)) return true;
  }
  if (drawing.tool === "date_price_range" || drawing.tool === "price_range" || drawing.tool === "projected_range") {
    const [a, b] = screen;
    if (a && b && insideRect(click, a, b, tol)) return true;
  }
  if (drawing.tool === "gann_box" || drawing.tool === "gann_square" || drawing.tool === "gann_square_from_two") {
    const [a, b] = screen;
    if (a && b && insideRect(click, a, b, tol)) return true;
  }
  // A curve/arc's dominant chord is also clickable when the sampled path is
  // very shallow on screen.
  if (drawing.tool === "curve" || drawing.tool === "double_curve" || drawing.tool === "arc") {
    const [a, b] = screen;
    if (a && b && distToSegment(click, a, b) <= tol) return true;
    if (a && b && distToInfiniteLine(click, a, b) <= tol) return true;
  }
  return false;
}
