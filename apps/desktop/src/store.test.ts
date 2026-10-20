import { describe, expect, it } from "vitest";
import { useWorkspace } from "./store";

describe("undo/redo drawings", () => {
  it("restores drawings byte-for-byte", () => {
    const s = useWorkspace.getState();
    const d = [{ id: "d1", tool: "trend_line" as const, points: [{ time: 1, price: 2 }], style: { color: "#fff", width: 1, lineStyle: "solid" as const } }];
    s.setDrawings(d);
    const after = useWorkspace.getState().activeChart().drawings;
    expect(after).toEqual(d);
    useWorkspace.getState().undoDrawing();
    expect(useWorkspace.getState().activeChart().drawings).toEqual([]);
    useWorkspace.getState().redoDrawing();
    expect(useWorkspace.getState().activeChart().drawings).toEqual(d);
  });
});