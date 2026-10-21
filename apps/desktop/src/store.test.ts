import { describe, expect, it } from "vitest";
import { useWorkspace } from "./store";
import type { PineScriptRecord } from "./store";
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

/** A Pine record as `setPineResult` expects it (the post-run shape). */
const pineRecord = (over: Partial<PineScriptRecord> = {}): PineScriptRecord => ({
  id: "p1",
  name: "Script",
  source: "src",
  options: null,
  plots: [],
  orders: [],
  error: null,
  ...over,
});

describe("pine script inputs snapshot", () => {
  it("setPineResult stores the scalar inputs map and it survives a JSON round-trip", () => {
    const inputs = { len: 14, longs: true, mode: "fast" };
    useWorkspace.getState().setPineResult("p1", pineRecord({ id: "p1", inputs }));
    expect(useWorkspace.getState().pineScripts["p1"]?.inputs).toEqual(inputs);
    // Persisted blobs are JSON — the snapshot must survive encode/decode.
    const blob = JSON.parse(JSON.stringify(useWorkspace.getState().pineScripts["p1"])) as PineScriptRecord;
    expect(blob.inputs).toEqual(inputs);
  });

  it("an old blob without inputs restores with inputs undefined", () => {
    // Pre-Task-3 shape: no `inputs` key at all.
    const oldBlob = JSON.parse(
      JSON.stringify({ id: "p2", name: "Old", source: "src", options: null, plots: [], orders: [], error: null }),
    ) as PineScriptRecord;
    useWorkspace.getState().setPineResult("p2", oldBlob);
    expect(useWorkspace.getState().pineScripts["p2"]?.inputs).toBeUndefined();
  });

  it("savePineScript keeps the last run's inputs snapshot", () => {
    useWorkspace.getState().setPineResult("p3", pineRecord({ id: "p3", inputs: { len: 20 } }));
    useWorkspace.getState().savePineScript("p3", "Renamed", "new src");
    const saved = useWorkspace.getState().pineScripts["p3"];
    expect(saved?.name).toBe("Renamed");
    expect(saved?.source).toBe("new src");
    expect(saved?.inputs).toEqual({ len: 20 });
  });
});

describe("pine script versions", () => {
  it("save with the same source is a version no-op; a changed source prepends the old head", () => {
    useWorkspace.getState().savePineScript("ver1", "V", "head-a");
    expect(useWorkspace.getState().pineScripts["ver1"]?.versions ?? []).toHaveLength(0);
    // Same source again (even with a new name): nothing archived.
    useWorkspace.getState().savePineScript("ver1", "Renamed", "head-a");
    expect(useWorkspace.getState().pineScripts["ver1"]?.versions ?? []).toHaveLength(0);
    expect(useWorkspace.getState().pineScripts["ver1"]?.name).toBe("Renamed");
    // Changed source: the superseded head is archived, newest first.
    useWorkspace.getState().savePineScript("ver1", "Renamed", "head-b");
    const versions = useWorkspace.getState().pineScripts["ver1"]?.versions ?? [];
    expect(versions).toHaveLength(1);
    expect(versions[0]?.source).toBe("head-a");
    expect(versions[0]?.savedAt).toBeGreaterThan(1_600_000_000); // epoch seconds, not ms
    expect(useWorkspace.getState().pineScripts["ver1"]?.source).toBe("head-b");
  });

  it("caps the version list at 20, newest first", () => {
    useWorkspace.getState().savePineScript("ver2", "Cap", "s0");
    for (let i = 1; i <= 25; i++) useWorkspace.getState().savePineScript("ver2", "Cap", `s${i}`);
    const versions = useWorkspace.getState().pineScripts["ver2"]?.versions ?? [];
    expect(versions).toHaveLength(20);
    expect(versions[0]?.source).toBe("s24"); // most recently superseded head
    expect(versions[19]?.source).toBe("s5"); // oldest kept; s0..s4 evicted
  });

  it("restorePineScriptVersion sets source from the entry and keeps the list", () => {
    useWorkspace.getState().savePineScript("ver3", "R", "one");
    useWorkspace.getState().savePineScript("ver3", "R", "two");
    useWorkspace.getState().savePineScript("ver3", "R", "three");
    const before = useWorkspace.getState().pineScripts["ver3"]?.versions;
    expect(before?.map((v) => v.source)).toEqual(["two", "one"]);
    useWorkspace.getState().restorePineScriptVersion("ver3", 1);
    expect(useWorkspace.getState().pineScripts["ver3"]?.source).toBe("one");
    // Restoring does not delete entries — flip back is possible.
    expect(useWorkspace.getState().pineScripts["ver3"]?.versions).toEqual(before);
    useWorkspace.getState().restorePineScriptVersion("ver3", 0);
    expect(useWorkspace.getState().pineScripts["ver3"]?.source).toBe("two");
  });

  it("restore is a no-op for an unknown id, out-of-range index, or a record without versions", () => {
    useWorkspace.getState().restorePineScriptVersion("no-such-id", 0);
    expect(useWorkspace.getState().pineScripts["no-such-id"]).toBeUndefined();
    useWorkspace.getState().savePineScript("ver4", "R", "stay");
    useWorkspace.getState().restorePineScriptVersion("ver4", 5);
    expect(useWorkspace.getState().pineScripts["ver4"]?.source).toBe("stay");
    // Pre-versioning record shape: no versions key at all.
    useWorkspace.getState().setPineResult("ver5", pineRecord({ id: "ver5", source: "legacy" }));
    useWorkspace.getState().restorePineScriptVersion("ver5", 0);
    expect(useWorkspace.getState().pineScripts["ver5"]?.source).toBe("legacy");
    expect(useWorkspace.getState().pineScripts["ver5"]?.versions).toBeUndefined();
  });
});

/** The persist middleware's partialize/merge hooks, under test directly. */
const persistOptions = () => useWorkspace.persist.getOptions();

describe("pine script persistence", () => {
  it("partialize keeps scripts+versions and they survive a storage round-trip", () => {
    useWorkspace.getState().savePineScript("per1", "P", "v1");
    useWorkspace.getState().savePineScript("per1", "P", "v2");
    const persisted = persistOptions().partialize!(useWorkspace.getState());
    // Storage is JSON: the persisted slice must survive encode/decode.
    const wire = JSON.parse(JSON.stringify(persisted)) as unknown;
    const merged = persistOptions().merge!(wire, useWorkspace.getState());
    expect(merged.pineScripts["per1"]?.source).toBe("v2");
    expect(merged.pineScripts["per1"]?.versions?.[0]?.source).toBe("v1");
  });

  it("an old blob without pineScripts rehydrates without throwing", () => {
    const oldBlob = {
      layouts: useWorkspace.getState().layouts,
      activeLayoutId: useWorkspace.getState().activeLayoutId,
      magnet: "off",
      // Pre-Task-5 shape: no pineScripts key at all.
    };
    const merged = persistOptions().merge!(oldBlob, useWorkspace.getState());
    expect(merged.pineScripts).toEqual({});
  });

  it("old records without versions or inputs rehydrate as valid records", () => {
    const oldBlob = {
      layouts: useWorkspace.getState().layouts,
      activeLayoutId: useWorkspace.getState().activeLayoutId,
      magnet: "off",
      pineScripts: {
        legacy: { id: "legacy", name: "Old", source: "src", options: null, plots: [], orders: [], error: null },
      },
    };
    const merged = persistOptions().merge!(oldBlob, useWorkspace.getState());
    const rec = merged.pineScripts["legacy"];
    expect(rec?.source).toBe("src");
    expect(rec?.versions).toBeUndefined(); // absent, not invented
    expect(rec?.inputs).toBeUndefined();
    // A garbage entry is dropped; the valid one survives.
    const messy = persistOptions().merge!(
      { ...oldBlob, pineScripts: { ...oldBlob.pineScripts, broken: 42, "": null } },
      useWorkspace.getState(),
    );
    expect(messy.pineScripts["legacy"]?.source).toBe("src");
    expect(Object.keys(messy.pineScripts)).toEqual(["legacy"]);
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