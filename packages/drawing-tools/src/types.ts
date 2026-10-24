import { themeColors } from "@ezyview/brand";

export type DrawingToolId =
  | "trend_line"
  | "ray"
  | "info_line"
  | "extended_line"
  | "horizontal_line"
  | "horizontal_ray"
  | "vertical_line"
  | "parallel_channel"
  | "fib_retracement"
  | "fib_extension"
  | "rectangle"
  | "ellipse"
  | "triangle"
  | "arrow"
  | "text"
  | "callout"
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

/** One customizable Fibonacci level; `enabled` false hides it. */
export interface FibLevelStyle {
  /** 0 = anchor A price, 1 = anchor B price. */
  ratio: number;
  label: string;
  enabled: boolean;
  color?: string;
}

/** Timeframe buckets a drawing can be limited to. */
export type TimeframeUnit = "seconds" | "minutes" | "hours" | "days" | "weeks" | "months";

/**
 * Which chart intervals the drawing belongs to. Absent means "every
 * interval". An explicit `false` hides the drawing on that bucket; the
 * settings dialog writes every bucket once the user edits them.
 */
export type DrawingVisibility = Partial<Record<TimeframeUnit, boolean>>;

/**
 * Everything visual about a drawing.
 *
 * Only `color`, `width` and `lineStyle` are required: layouts persisted before
 * the TradingView parity pass have exactly those three (plus fill/font/show
 * labels), so every new property is optional with the renderer supplying the
 * TradingView default.
 */
export interface DrawingStyle {
  color: string;
  width: number;
  lineStyle: "solid" | "dashed" | "dotted";
  fill?: string;
  fontSize?: number;
  showLabels?: boolean;
  /** Stroke opacity, 0–100. Default 100. */
  opacity?: number;
  /** Fill opacity, 0–100. Default 20. */
  fillOpacity?: number;
  /** Continue the line/shape past its left anchor. */
  extendLeft?: boolean;
  /** Continue the line/shape past its right anchor. */
  extendRight?: boolean;
  leftEnd?: "normal" | "arrow";
  rightEnd?: "normal" | "arrow";
  /** Dashed divider between the edges of a rectangle or channel. */
  showMiddleLine?: boolean;
  /** Price labels on the right axis edge / next to levels. */
  showPriceLabels?: boolean;
  /** Δprice / % / bars / angle badge. */
  showStats?: boolean;
  statsPosition?: "top" | "middle" | "bottom" | "right";
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textAlign?: "left" | "center" | "right";
  textVAlign?: "top" | "middle" | "bottom";
  textColor?: string;
  /** Per-level Fibonacci overrides; absent = the standard retracement set. */
  fibLevels?: FibLevelStyle[];
  /** Swap the direction Fibonacci levels are measured from. */
  reverse?: boolean;
  /** Long/short position risk model. */
  accountSize?: number;
  riskSize?: number;
  riskMode?: "percent" | "currency";
  /** Profit/stop zone colours for position tools. */
  stopColor?: string;
  targetColor?: string;
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
  /** Restrict the drawing to some chart intervals; absent = all of them. */
  visibility?: DrawingVisibility;
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
  info_line: 2,
  extended_line: 2,
  horizontal_line: 1,
  horizontal_ray: 1,
  vertical_line: 1,
  parallel_channel: 3,
  fib_retracement: 2,
  fib_extension: 3,
  rectangle: 2,
  ellipse: 2,
  triangle: 3,
  arrow: 2,
  text: 1,
  callout: 2,
  brush: 0, // variable-length, committed on pointer up
  measure: 2,
  long_position: 3,
  short_position: 3,
};

export function isComplete(tool: DrawingToolId, points: Point[]): boolean {
  return points.length >= TOOL_ANCHORS[tool];
}
