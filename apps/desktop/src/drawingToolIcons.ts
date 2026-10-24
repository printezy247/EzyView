import {
  ArrowUpRight,
  BarChart2,
  Brush,
  Circle,
  Frame,
  Info,
  MessageSquare,
  MoveHorizontal,
  MoveRight,
  MoveUpRight,
  MoveVertical,
  Route,
  Ruler,
  Spline,
  Square,
  TrendingDown,
  TrendingUp,
  Triangle,
  Type,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DrawingToolId } from "@ezyview/drawing-tools";

/**
 * One icon per drawing tool, shared by the left rail, the favourites pill and
 * the settings dialog so a tool looks the same everywhere it appears.
 */
export const TOOL_ICONS: Record<DrawingToolId, LucideIcon> = {
  trend_line: Spline,
  ray: MoveUpRight,
  info_line: Info,
  extended_line: Route,
  horizontal_line: MoveHorizontal,
  horizontal_ray: MoveRight,
  vertical_line: MoveVertical,
  parallel_channel: Frame,
  fib_retracement: BarChart2,
  fib_extension: TrendingUp,
  rectangle: Square,
  ellipse: Circle,
  triangle: Triangle,
  arrow: ArrowUpRight,
  text: Type,
  callout: MessageSquare,
  brush: Brush,
  measure: Ruler,
  long_position: TrendingUp,
  short_position: TrendingDown,
};
