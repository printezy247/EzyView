import type { DrawingStyle, DrawingToolId } from "./types.js";
import { TOOL_ANCHORS } from "./types.js";

/**
 * Tool metadata shared by the renderer, the left rail and the settings dialog.
 *
 * Keeping the capability flags here (instead of three parallel `switch`
 * statements) is what lets a new tool light up in the rail, render its fill and
 * show the right settings tabs without touching each of them.
 */

export type DrawingToolCategory = "trend" | "fib" | "shapes" | "annotation" | "prediction";

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
  { id: "fib", title: "Gann and Fibonacci", tools: ["fib_retracement", "fib_extension"] },
  { id: "shapes", title: "Geometric shapes", tools: ["brush", "arrow", "rectangle", "ellipse", "triangle"] },
  { id: "annotation", title: "Annotation tools", tools: ["text", "callout"] },
  { id: "prediction", title: "Prediction and measurement", tools: ["long_position", "short_position", "measure"] },
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
  return style;
}
