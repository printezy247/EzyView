import type { Drawing } from "@ezyview/drawing-tools";
import type { ActiveIndicator } from "./store";

/** "trend_line" → "Trend line". */
export const toolName = (tool: string): string => {
  const words = tool.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export const drawingLabel = (d: Drawing): string => d.name ?? toolName(d.tool);
export const indicatorLabel = (i: ActiveIndicator): string => i.name ?? i.def.name;
