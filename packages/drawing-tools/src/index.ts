/**
 * EzyView drawing tools.
 *
 * Geometry + data model for the chart annotation layer. Rendering glue lives in
 * the app; everything here is pure so it stays unit-testable.
 */

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

export interface Point {
  /** Epoch seconds of the anchor bar. */
  time: number;
  /** Price of the anchor. */
  price: number;
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
  /** Anchors in chart (time, price) space. Order depends on the tool. */
  points: Point[];
  style: DrawingStyle;
  text?: string;
  locked?: boolean;
  hidden?: boolean;
}

export const DEFAULT_DRAWING_STYLE: DrawingStyle = {
  color: "#2962ff",
  width: 1,
  lineStyle: "solid",
  showLabels: true,
};

/** Snap a price to the nearest OHLC value when magnet mode is armed. */
export type MagnetMode = "off" | "weak" | "strong";
