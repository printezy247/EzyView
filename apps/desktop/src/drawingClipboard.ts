import { translateDrawing } from "@ezyview/drawing-tools";
import type { Drawing } from "@ezyview/drawing-tools";

/**
 * A copy of `source` with its first anchor on `at`. The copy gets a fresh id
 * and is never locked (pasting a locked drawing should leave you something
 * you can move). The source is not touched.
 */
export function pasteAt(source: Drawing, at: { time: number; price: number }, id: string): Drawing {
  const first = source.points[0];
  const moved = first ? translateDrawing(source, at.time - first.time, at.price - first.price) : source;
  return { ...structuredClone(moved), id, locked: false };
}
