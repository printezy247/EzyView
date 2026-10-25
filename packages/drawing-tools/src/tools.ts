import type { DrawingStyle, DrawingToolId } from "./types.js";
import { TOOL_ANCHORS } from "./types.js";

/**
 * Tool metadata shared by the renderer, the left rail and the settings dialog.
 *
 * Keeping the capability flags here (instead of three parallel `switch`
 * statements) is what lets a new tool light up in the rail, render its fill and
 * show the right settings tabs without touching each of them.
 */

export type DrawingToolCategory =
  | "trend"
  | "pitchfork"
  | "fib"
  | "gann"
  | "patterns"
  | "shapes"
  | "annotation"
  | "prediction";

export interface DrawingToolSpec {
  id: DrawingToolId;
  label: string;
  category: DrawingToolCategory;
  anchors: number;
  /** Has an enclosed area that can carry a background fill. */
  fill: boolean;
  /** Carries an on-chart text annotation. */
  text: boolean;
  /** Can show the Δprice / % / bars / angle badge. */
  stats: boolean;
  /** Honors extendLeft / extendRight. */
  extend: boolean;
  /** Long/short position tool. */
  position: boolean;
  /** Fibonacci family (custom levels, reverse). */
  fib: boolean;
  /** Single-key shortcut shown in the rail flyout; absent = none. */
  shortcut?: string;
}

const spec = (
  id: DrawingToolId,
  label: string,
  category: DrawingToolCategory,
  extra: Partial<DrawingToolSpec> = {},
): DrawingToolSpec => ({
  id,
  label,
  category,
  anchors: TOOL_ANCHORS[id],
  fill: false,
  text: false,
  stats: false,
  extend: false,
  position: false,
  fib: false,
  ...extra,
});

export const TOOL_SPECS: Record<DrawingToolId, DrawingToolSpec> = {
  trend_line: spec("trend_line", "Trend line", "trend", {
    text: true,
    stats: true,
    extend: true,
    shortcut: "T",
  }),
  ray: spec("ray", "Ray", "trend", { extend: true }),
  info_line: spec("info_line", "Info line", "trend", { text: true, stats: true, extend: true }),
  extended_line: spec("extended_line", "Extended line", "trend", { extend: true }),
  horizontal_line: spec("horizontal_line", "Horizontal line", "trend", {
    text: true,
    stats: true,
    shortcut: "H",
  }),
  horizontal_ray: spec("horizontal_ray", "Horizontal ray", "trend", { text: true, stats: true }),
  vertical_line: spec("vertical_line", "Vertical line", "trend", { shortcut: "V" }),
  parallel_channel: spec("parallel_channel", "Parallel channel", "trend", {
    fill: true,
    text: true,
    extend: true,
    stats: true,
  }),
  fib_retracement: spec("fib_retracement", "Fib retracement", "fib", {
    fill: true,
    fib: true,
    extend: true,
    shortcut: "F",
  }),
  fib_extension: spec("fib_extension", "Fib extension", "fib", { fib: true, extend: true }),
  rectangle: spec("rectangle", "Rectangle", "shapes", {
    fill: true,
    text: true,
    stats: true,
    extend: true,
    shortcut: "R",
  }),
  ellipse: spec("ellipse", "Ellipse", "shapes", { fill: true }),
  triangle: spec("triangle", "Triangle", "shapes", { fill: true }),
  arrow: spec("arrow", "Arrow", "shapes"),
  text: spec("text", "Text", "annotation", { text: true }),
  callout: spec("callout", "Callout", "annotation", { fill: true, text: true }),
  brush: spec("brush", "Brush", "shapes", { fill: false }),
  measure: spec("measure", "Measure", "prediction", { stats: true, shortcut: "M" }),
  long_position: spec("long_position", "Long position", "prediction", {
    fill: true,
    stats: true,
    position: true,
  }),
  short_position: spec("short_position", "Short position", "prediction", {
    fill: true,
    stats: true,
    position: true,
  }),
  pitchfork_standard: spec("pitchfork_standard", "Pitchfork", "pitchfork", { extend: true, stats: true, shortcut: "P" }),
  pitchfork_schiff: spec("pitchfork_schiff", "Schiff pitchfork", "pitchfork", { extend: true }),
  pitchfork_modified_schiff: spec("pitchfork_modified_schiff", "Modified Schiff pitchfork", "pitchfork", { extend: true }),
  pitchfork_inside: spec("pitchfork_inside", "Inside pitchfork", "pitchfork", { extend: true }),
  fib_fan: spec("fib_fan", "Fib fan", "fib", { fib: true, extend: true }),
  fib_arcs: spec("fib_arcs", "Fib arcs", "fib", { fib: true }),
  fib_channel: spec("fib_channel", "Fib channel", "fib", { fib: true, fill: true, extend: true }),
  fib_timezones: spec("fib_timezones", "Fib time zones", "fib", { fib: true }),
  fib_wedge: spec("fib_wedge", "Fib wedge", "fib", { fib: true, fill: true }),
  gann_fan: spec("gann_fan", "Gann fan", "gann", { extend: true }),
  gann_box: spec("gann_box", "Gann box", "gann", { fill: true }),
  gann_square: spec("gann_square", "Gann square", "gann", { fill: true }),
  gann_square_from_two: spec("gann_square_from_two", "Square from two points", "gann", { fill: true }),
  gann_time: spec("gann_time", "Gann time by 1/2/3", "gann", {}),
  xabcd: spec("xabcd", "XABCD pattern", "patterns", { stats: true, text: true }),
  cypher: spec("cypher", "Cypher pattern", "patterns", { stats: true, text: true }),
  head_shoulders: spec("head_shoulders", "Head and shoulders", "patterns", { stats: true, text: true }),
  abcd: spec("abcd", "ABCD pattern", "patterns", { stats: true, text: true }),
  three_drives: spec("three_drives", "Three drives", "patterns", { stats: true, text: true }),
  elliott_impulse: spec("elliott_impulse", "Elliott impulse (1-5)", "patterns", { stats: true, text: true }),
  elliott_correction: spec("elliott_correction", "Elliott correction (A-C)", "patterns", { stats: true, text: true }),
  elliott_triangle: spec("elliott_triangle", "Elliott triangle", "patterns", { stats: true, text: true }),
  cup_handle: spec("cup_handle", "Cup and handle", "patterns", { stats: true, text: true }),
  image: spec("image", "Image", "annotation", { fill: true }),
  sticker: spec("sticker", "Sticker", "annotation", { text: true }),
  pin: spec("pin", "Pin", "annotation", { text: true }),
  comment: spec("comment", "Comment", "annotation", { fill: true, text: true }),
  price_note: spec("price_note", "Price note", "annotation", { text: true }),
  arrow_marker: spec("arrow_marker", "Arrow marker", "annotation", {}),
  highlighter: spec("highlighter", "Highlighter", "annotation", {}),
  date_price_range: spec("date_price_range", "Date and price range", "prediction", { fill: true, stats: true }),
  price_range: spec("price_range", "Price range", "prediction", { fill: true, stats: true }),
  projected_range: spec("projected_range", "Projected range", "prediction", { fill: true, stats: true }),
  bars_pattern: spec("bars_pattern", "Bars pattern", "prediction", { fill: true }),
  forecast: spec("forecast", "Forecast", "prediction", { fill: true, stats: true }),
  rotated_rectangle: spec("rotated_rectangle", "Rotated rectangle", "shapes", { fill: true }),
  circle: spec("circle", "Circle", "shapes", { fill: true }),
  polyline: spec("polyline", "Polyline", "shapes", {}),
  arc: spec("arc", "Arc", "shapes", {}),
  curve: spec("curve", "Curve", "shapes", {}),
  double_curve: spec("double_curve", "Double curve", "shapes", {}),
};

/** Rail order and grouping. Every tool appears exactly once. */
export const TOOL_CATEGORIES: readonly {
  id: DrawingToolCategory;
  title: string;
  tools: readonly DrawingToolId[];
}[] = [
  {
    id: "trend",
    title: "Trend line tools",
    tools: ["trend_line", "ray", "info_line", "extended_line", "horizontal_line", "horizontal_ray", "vertical_line", "parallel_channel"],
  },
  {
    id: "pitchfork",
    title: "Pitchfork tools",
    tools: ["pitchfork_standard", "pitchfork_schiff", "pitchfork_modified_schiff", "pitchfork_inside"],
  },
  {
    id: "fib",
    title: "Gann and Fibonacci",
    tools: [
      "fib_retracement",
      "fib_extension",
      "fib_fan",
      "fib_arcs",
      "fib_channel",
      "fib_timezones",
      "fib_wedge",
    ],
  },
  {
    id: "gann",
    title: "Gann tools",
    tools: ["gann_fan", "gann_box", "gann_square", "gann_square_from_two", "gann_time"],
  },
  {
    id: "patterns",
    title: "Patterns and Elliott waves",
    tools: [
      "xabcd",
      "cypher",
      "head_shoulders",
      "abcd",
      "three_drives",
      "elliott_impulse",
      "elliott_correction",
      "elliott_triangle",
      "cup_handle",
    ],
  },
  {
    id: "shapes",
    title: "Geometric shapes",
    tools: [
      "brush",
      "highlighter",
      "arrow",
      "arrow_marker",
      "rectangle",
      "rotated_rectangle",
      "ellipse",
      "circle",
      "triangle",
      "polyline",
      "arc",
      "curve",
      "double_curve",
    ],
  },
  {
    id: "annotation",
    title: "Annotation tools",
    tools: ["text", "callout", "comment", "sticker", "pin", "price_note", "image"],
  },
  {
    id: "prediction",
    title: "Prediction and measurement",
    tools: [
      "long_position",
      "short_position",
      "measure",
      "date_price_range",
      "price_range",
      "projected_range",
      "bars_pattern",
      "forecast",
    ],
  },
];

export const ALL_TOOLS: readonly DrawingToolId[] = TOOL_CATEGORIES.flatMap((c) => c.tools);

export const toolSpec = (id: DrawingToolId): DrawingToolSpec => TOOL_SPECS[id];

export const toolHasFill = (id: DrawingToolId): boolean => TOOL_SPECS[id].fill;
export const toolShowsText = (id: DrawingToolId): boolean => TOOL_SPECS[id].text;
export const toolShowsStats = (id: DrawingToolId): boolean => TOOL_SPECS[id].stats;
export const toolSupportsExtend = (id: DrawingToolId): boolean => TOOL_SPECS[id].extend;
export const isPositionTool = (id: DrawingToolId): boolean => TOOL_SPECS[id].position;
export const isFibTool = (id: DrawingToolId): boolean => TOOL_SPECS[id].fib;

/** Single-key shortcuts for arming a tool. */
export const TOOL_SHORTCUTS: Partial<Record<DrawingToolId, string>> = Object.fromEntries(
  Object.values(TOOL_SPECS)
    .filter((s) => s.shortcut !== undefined)
    .map((s) => [s.id, s.shortcut!] as const),
);

export const toolForShortcut = (key: string): DrawingToolId | null => {
  const upper = key.toUpperCase();
  const hit = Object.entries(TOOL_SHORTCUTS).find(([, k]) => k === upper);
  return hit ? (hit[0] as DrawingToolId) : null;
};

/** The tenth-of-default style a new drawing of `tool` starts with. */
export function defaultStyleForTool(tool: DrawingToolId, base: DrawingStyle): DrawingStyle {
  const style: DrawingStyle = { ...base };
  if (toolHasFill(tool)) {
    style.fill = base.fill ?? base.color;
    style.fillOpacity = base.fillOpacity ?? 15;
  }
  if (toolShowsText(tool)) style.textColor = base.textColor ?? base.color;
  if (isPositionTool(tool)) {
    style.showPriceLabels = base.showPriceLabels ?? true;
    style.targetColor = base.targetColor ?? "#26a69a";
    style.stopColor = base.stopColor ?? "#ef5350";
  }
  if (tool === "highlighter") {
    style.width = Math.max(8, base.width * 4);
    style.opacity = 40;
  }
  if (tool === "image" || tool === "comment" || tool.endsWith("_range") || tool === "gann_box" || tool === "forecast") {
    style.fill = base.fill ?? base.color;
    style.fillOpacity = base.fillOpacity ?? 12;
    style.showPriceLabels = base.showPriceLabels ?? true;
  }
  return style;
}
