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

  it("restorePineScriptVersion archives the current head, then sets source from the entry", () => {
    useWorkspace.getState().savePineScript("ver3", "R", "one");
    useWorkspace.getState().savePineScript("ver3", "R", "two");
    useWorkspace.getState().savePineScript("ver3", "R", "three");
    expect(useWorkspace.getState().pineScripts["ver3"]?.versions?.map((v) => v.source)).toEqual(["two", "one"]);
    // Restore "one": head "three" is archived (it existed nowhere else), and
    // the old entries stay so flip-back is possible.
    useWorkspace.getState().restorePineScriptVersion("ver3", 1);
    const after = useWorkspace.getState().pineScripts["ver3"];
    expect(after?.source).toBe("one");
    expect(after?.versions?.map((v) => v.source)).toEqual(["three", "two", "one"]);
    // Flip back to "three": head "one" is archived the same way. The list
    // keeps every prior entry (restore never deletes), so "one" appears twice.
    useWorkspace.getState().restorePineScriptVersion("ver3", 0);
    const back = useWorkspace.getState().pineScripts["ver3"];
    expect(back?.source).toBe("three");
    expect(back?.versions?.map((v) => v.source)).toEqual(["one", "three", "two", "one"]);
  });

  it("a run-result that supersedes the head archives it; a later same-source save is a no-op", () => {
    // Edit → "Add to chart" (run) → Save must not lose the pre-edit head:
    // the run writes the live buffer into the record via setPineResult.
    useWorkspace.getState().savePineScript("run1", "R", "head-a");
    useWorkspace.getState().setPineResult("run1", pineRecord({ id: "run1", source: "head-b" }));
    const runVersions = useWorkspace.getState().pineScripts["run1"]?.versions ?? [];
    expect(runVersions).toHaveLength(1);
    expect(runVersions[0]?.source).toBe("head-a");
    // Saving the same source afterwards archives nothing more (no double entry).
    useWorkspace.getState().savePineScript("run1", "R", "head-b");
    const savedVersions = useWorkspace.getState().pineScripts["run1"]?.versions ?? [];
    expect(savedVersions).toHaveLength(1);
    expect(savedVersions[0]?.source).toBe("head-a");
  });

  it("no-op restore paths do not notify subscribers", () => {
    useWorkspace.getState().savePineScript("notify1", "N", "src");
    useWorkspace.getState().setPineResult("notify2", pineRecord({ id: "notify2", source: "legacy" }));
    let notified = 0;
    const unsub = useWorkspace.subscribe(() => {
      notified++;
    });
    useWorkspace.getState().restorePineScriptVersion("no-such-id", 0);
    useWorkspace.getState().restorePineScriptVersion("notify1", 9);
    useWorkspace.getState().restorePineScriptVersion("notify2", 0); // pre-versioning record
    unsub();
    expect(notified).toBe(0);
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

  it("malformed options/plots/orders rehydrate to null / empty arrays", () => {
    const blob = {
      layouts: useWorkspace.getState().layouts,
      activeLayoutId: useWorkspace.getState().activeLayoutId,
      magnet: "off",
      pineScripts: {
        bad: {
          id: "bad",
          name: "N",
          source: "src",
          options: 42,
          plots: "x",
          orders: {},
          error: null,
        },
      },
    };
    const merged = persistOptions().merge!(blob, useWorkspace.getState());
    const rec = merged.pineScripts["bad"];
    expect(rec?.options).toBeNull();
    expect(rec?.plots).toEqual([]);
    expect(rec?.orders).toEqual([]);
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

  it("a __proto__ key is dropped without retargeting the map prototype", () => {
    const blob = {
      layouts: useWorkspace.getState().layouts,
      activeLayoutId: useWorkspace.getState().activeLayoutId,
      magnet: "off",
      // JSON.parse defines an own "__proto__" data key (the setter never
      // fires during parse) — exactly what a hand-edited blob looks like
      // after a storage round-trip.
      pineScripts: JSON.parse(
        '{"ok":{"id":"ok","name":"N","source":"src","options":null,"plots":[],"orders":[],"error":null},' +
          '"__proto__":{"id":"__proto__","name":"Evil","source":"evil","options":null,"plots":[],"orders":[],"error":null}}',
      ) as Record<string, unknown>,
    };
    const merged = persistOptions().merge!(blob, useWorkspace.getState());
    // The assignment must not have invoked Object.prototype.__proto__.
    expect(Object.getPrototypeOf(merged.pineScripts)).toBe(Object.prototype);
    expect(Object.keys(merged.pineScripts)).toEqual(["ok"]);
    expect(merged.pineScripts["ok"]?.source).toBe("src");
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
describe("drawing clipboard", () => {
  it("copies the selected drawing and pastes it at a point, selected and undoable", () => {
    seed(line("c1"));
    useWorkspace.getState().selectDrawing("c1");
    useWorkspace.getState().copyDrawing();
    useWorkspace.getState().pasteDrawing({ time: 900, price: 70 });
    const s = useWorkspace.getState();
    const drawings = s.activeChart().drawings;
    expect(drawings).toHaveLength(2);
    const pasted = drawings[1]!;
    expect(pasted.id).not.toBe("c1");
    expect(pasted.points[0]).toEqual({ time: 900, price: 70 });
    expect(s.selectedDrawingId).toBe(pasted.id);
    s.undoDrawing();
    expect(useWorkspace.getState().activeChart().drawings).toHaveLength(1);
  });

  it("paste does nothing with an empty clipboard", () => {
    seed(line("c2"));
    useWorkspace.setState({ drawingClipboard: null });
    useWorkspace.getState().pasteDrawing({ time: 1, price: 1 });
    expect(useWorkspace.getState().activeChart().drawings).toHaveLength(1);
  });
});

describe("chart templates", () => {
  it("saves the focused chart's look and applies it to another look, keeping symbol and drawings", () => {
    seed(line("t1"));
    useWorkspace.getState().updateActive({ chartType: "heikin", showGrid: false });
    useWorkspace.getState().saveChartTemplate("Heikin clean");
    const saved = useWorkspace.getState().chartTemplates.at(-1)!;
    expect(saved.name).toBe("Heikin clean");

    useWorkspace.getState().updateActive({ chartType: "candles", showGrid: true });
    useWorkspace.getState().applyChartTemplate(saved.id);
    const chart = useWorkspace.getState().activeChart();
    expect(chart.chartType).toBe("heikin");
    expect(chart.showGrid).toBe(false);
    expect(chart.drawings.map((d) => d.id)).toEqual(["t1"]);

    useWorkspace.getState().deleteChartTemplate(saved.id);
    expect(useWorkspace.getState().chartTemplates.some((t) => t.id === saved.id)).toBe(false);
  });
});

describe("performance optimizations", () => {
  it("maintains memoized watchlistSymbolKey on add/remove and not on price updates", () => {
    useWorkspace.setState({ watchlist: [], watchlistSymbolKey: "" });
    const entry1 = { symbol: "BINANCE:BTCUSDT", ticker: "BTCUSDT", description: "Bitcoin", assetClass: "crypto", precision: 2, price: null, changePct: null };
    const entry2 = { symbol: "OANDA:XAUUSD", ticker: "XAUUSD", description: "Gold", assetClass: "commodity", precision: 2, price: null, changePct: null };

    useWorkspace.getState().addToWatchlist(entry1);
    expect(useWorkspace.getState().watchlistSymbolKey).toBe("BINANCE:BTCUSDT");

    useWorkspace.getState().addToWatchlist(entry2);
    expect(useWorkspace.getState().watchlistSymbolKey).toBe("BINANCE:BTCUSDT,OANDA:XAUUSD");

    // Price update keeps the same symbol key
    useWorkspace.getState().updateWatchPrice("BINANCE:BTCUSDT", 65000, 2.5);
    expect(useWorkspace.getState().watchlistSymbolKey).toBe("BINANCE:BTCUSDT,OANDA:XAUUSD");
    expect(useWorkspace.getState().watchlist[0]?.price).toBe(65000);

    useWorkspace.getState().removeFromWatchlist("BINANCE:BTCUSDT");
    expect(useWorkspace.getState().watchlistSymbolKey).toBe("OANDA:XAUUSD");
  });

  it("avoids state reallocations in updateActive when values have not changed", () => {
    const chart = useWorkspace.getState().activeChart();
    const prevLayouts = useWorkspace.getState().layouts;
    useWorkspace.getState().updateActive({ chartType: chart.chartType });
    expect(useWorkspace.getState().layouts).toBe(prevLayouts);
  });

  it("avoids state reallocations in updateWatchPrice when price and changePct are unchanged", () => {
    useWorkspace.setState({
      watchlist: [{ symbol: "BINANCE:BTCUSDT", ticker: "BTCUSDT", description: "Bitcoin", assetClass: "crypto", precision: 2, price: 65000, changePct: 2.5 }],
      watchlistSymbolKey: "BINANCE:BTCUSDT",
    });
    const prevWatchlist = useWorkspace.getState().watchlist;
    useWorkspace.getState().updateWatchPrice("BINANCE:BTCUSDT", 65000, 2.5);
    expect(useWorkspace.getState().watchlist).toBe(prevWatchlist);
  });

  it("caps drawingUndo stack at 30 entries", () => {
    useWorkspace.setState({ drawingUndo: [] });
    for (let i = 0; i < 40; i++) {
      useWorkspace.getState().setDrawings([line(`line-${i}`)]);
    }
    expect(useWorkspace.getState().drawingUndo.length).toBe(30);
  });
});
