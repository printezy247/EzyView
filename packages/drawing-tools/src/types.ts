import { themeColors } from "@ezyview/brand";

export type DrawingToolId =
  | "trend_line"
  | "ray"
  | "extended_line"
  | "horizontal_line"
  | "vertical_line"
  | "parallel_channel"
  | "fib_retracement"
  | "fib_extension"
  | "rectangle"
  | "ellipse"
  | "triangle"
  | "arrow"
  | "text"
  | "brush"
  | "measure"
  | "long_position"
  | "short_position";

/** P1 ships these; the rest are additive once the renderer handles them. */
export const P1_TOOLS: readonly DrawingToolId[] = [
  "trend_line",
  "horizontal_line",
  "vertical_line",
  "rectangle",
  "fib_retracement",
];

export interface Point {
  /** Epoch seconds of the anchor bar. */
  time: number;
  /** Price of the anchor. */
  price: number;
}

/** A point already projected into chart pixel space. */
export interface ScreenPoint {
  x: number;
  y: number;
}

export interface DrawingStyle {
  color: string;
  width: number;
  lineStyle: "solid" | "dashed" | "dotted";
  fill?: string;
  fontSize?: number;
  showLabels?: boolean;
}

export interface Drawing {
  id: string;
  tool: DrawingToolId;
  /** Anchors in chart (time, price) space. Count depends on the tool. */
  points: Point[];
  style: DrawingStyle;
  text?: string;
  locked?: boolean;
  hidden?: boolean;
  /** User label shown in the object tree; falls back to the tool name. */
  name?: string;
}

export const DEFAULT_DRAWING_STYLE: DrawingStyle = {
  // The brand's blue, not a leftover accent from the chart's previous life:
  // this is the colour every new drawing starts as, so it is chrome, not data.
  color: themeColors("dark").link,
  width: 1,
  lineStyle: "solid",
  showLabels: true,
};

export type MagnetMode = "off" | "weak" | "strong";

/** Anchor count each tool expects before it is considered complete. */
export const TOOL_ANCHORS: Record<DrawingToolId, number> = {
  trend_line: 2,
  ray: 2,
  extended_line: 2,
  horizontal_line: 1,
  vertical_line: 1,
  parallel_channel: 3,
  fib_retracement: 2,
  fib_extension: 3,
  rectangle: 2,
  ellipse: 2,
  triangle: 3,
  arrow: 2,
  text: 1,
  brush: 0, // variable-length, committed on pointer up
  measure: 2,
  long_position: 3,
  short_position: 3,
};

export function isComplete(tool: DrawingToolId, points: Point[]): boolean {
  return points.length >= TOOL_ANCHORS[tool];
}
