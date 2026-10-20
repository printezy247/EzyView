import { describe, expect, it } from "vitest";
import { useWorkspace } from "./store";
import type { Drawing } from "@ezyview/drawing-tools";

const line = (id: string): Drawing => ({
  id,
  tool: "horizontal_line",
  points: [{ time: 100, price: 50 }],
  style: { color: "#fff", width: 1, lineStyle: "solid" },
});

/** Known baseline: focused cell holds exactly `drawings`, selection cleared. */
const seed = (...drawings: Drawing[]) => {
  useWorkspace.getState().setDrawings(drawings);
  useWorkspace.getState().selectDrawing(null);
};

describe("drawing selection and editing", () => {
  it("selectDrawing sets and clears selection", () => {
    seed(line("s1"));
    useWorkspace.getState().selectDrawing("s1");
    expect(useWorkspace.getState().selectedDrawingId).toBe("s1");
    useWorkspace.getState().selectDrawing(null);
    expect(useWorkspace.getState().selectedDrawingId).toBeNull();
  });

  it("deleteDrawing removes it, pushes one undo entry, clears selection", () => {
    seed(line("d1"), line("d2"));
    useWorkspace.getState().selectDrawing("d1");
    useWorkspace.getState().deleteDrawing("d1");
    const s = useWorkspace.getState();
    expect(s.activeChart().drawings.map((d) => d.id)).toEqual(["d2"]);
    expect(s.selectedDrawingId).toBeNull();
    s.undoDrawing();
    expect(useWorkspace.getState().activeChart().drawings.map((d) => d.id)).toEqual(["d1", "d2"]);
  });

  it("updateDrawing pushes one undo entry", () => {
    seed(line("u1"));
    useWorkspace.getState().updateDrawing("u1", { name: "renamed" });
    expect(useWorkspace.getState().activeChart().drawings[0]?.name).toBe("renamed");
    useWorkspace.getState().undoDrawing();
    expect(useWorkspace.getState().activeChart().drawings[0]?.name).toBeUndefined();
  });

  it("previewDrawing applies without undo; commitDrawingHistory closes the drag", () => {
    seed(line("p1"));
    const before = useWorkspace.getState().activeChart().drawings;
    const undoDepth = useWorkspace.getState().drawingUndo.length;
    useWorkspace.getState().previewDrawing("p1", { points: [{ time: 2, price: 2 }] });
    expect(useWorkspace.getState().activeChart().drawings[0]?.points[0]).toEqual({ time: 2, price: 2 });
    expect(useWorkspace.getState().drawingUndo.length).toBe(undoDepth); // preview pushes nothing
    useWorkspace.getState().commitDrawingHistory(before);
    expect(useWorkspace.getState().drawingUndo.length).toBe(undoDepth + 1); // exactly one entry
    useWorkspace.getState().undoDrawing();
    expect(useWorkspace.getState().activeChart().drawings[0]?.points[0]).toEqual({ time: 100, price: 50 });
  });

  it("moving a horizontal line updates the price of its bound alert", () => {
    seed(line("m1"));
    useWorkspace.getState().addAlert("TEST", { kind: "crossing", value: 50 }, "once_per_bar_close", "bound", "m1");
    useWorkspace.getState().updateDrawing("m1", { points: [{ time: 100, price: 61 }] });
    const alert = useWorkspace.getState().alerts.find((x) => x.drawingId === "m1");
    expect(alert?.condition).toEqual({ kind: "crossing", value: 61 });
  });

  it("deleteDrawing removes alerts bound to the drawing", () => {
    seed(line("x1"));
    useWorkspace.getState().addAlert("TEST", { kind: "crossing", value: 1 }, "once", "bound", "x1");
    useWorkspace.getState().deleteDrawing("x1");
    expect(useWorkspace.getState().alerts.some((x) => x.drawingId === "x1")).toBe(false);
  });

  it("importDrawings appends with fresh ids and one undo entry", () => {
    seed(line("i1"));
    useWorkspace.getState().importDrawings([line("i1")]);
    const s = useWorkspace.getState();
    expect(s.activeChart().drawings.length).toBe(2);
    expect(s.activeChart().drawings[1]?.id).not.toBe("i1"); // remapped
    s.undoDrawing();
    expect(useWorkspace.getState().activeChart().drawings.length).toBe(1);
  });
});

describe("undo/redo drawings", () => {
  it("restores drawings byte-for-byte", () => {
    const s = useWorkspace.getState();
    s.setDrawings([]); // reset: this file's tests share one store
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