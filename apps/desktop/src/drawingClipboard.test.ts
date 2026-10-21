import { describe, expect, it } from "vitest";
import type { Drawing } from "@ezyview/drawing-tools";
import { pasteAt } from "./drawingClipboard";

const line = {
  id: "a",
  tool: "trend_line",
  points: [
    { time: 100, price: 10 },
    { time: 160, price: 14 },
  ],
  style: { color: "#fff", width: 1 },
  name: "Mine",
  locked: true,
} as unknown as Drawing;

describe("pasteAt", () => {
  it("moves the first anchor to the target and keeps the shape", () => {
    const out = pasteAt(line, { time: 1000, price: 50 }, "b");
    expect(out.points).toEqual([
      { time: 1000, price: 50 },
      { time: 1060, price: 54 },
    ]);
  });

  it("gets a new id, stays editable, and leaves the source untouched", () => {
    const out = pasteAt(line, { time: 1000, price: 50 }, "b");
    expect(out.id).toBe("b");
    expect(out.locked).toBe(false);
    expect(out.name).toBe("Mine");
    expect(line.points[0]).toEqual({ time: 100, price: 10 });
    expect(line.id).toBe("a");
  });

  it("returns the drawing unchanged (new id) when it has no anchors", () => {
    const empty = { ...line, points: [] } as Drawing;
    expect(pasteAt(empty, { time: 1, price: 1 }, "c").points).toEqual([]);
  });
});
