import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Candle } from "@ezyview/data-adapters";
import { evaluateAlert, pushHistory } from "@ezyview/data-adapters";
import type { AlertCondition, AlertFrequency, AlertHistory, PriceAlert } from "@ezyview/data-adapters";
import { DARK_THEME, LIGHT_THEME, TOKYO_THEME } from "@ezyview/chart-engine";
import type { Drawing, DrawingToolId, MagnetMode } from "@ezyview/drawing-tools";
import { catalog, getIndicator } from "@ezyview/indicators";
import type { IndicatorDef } from "@ezyview/indicators";
import type { PinePlot, PineOrder, ScriptOptions } from "@ezyview/pine-transpiler";
import { DEFAULT_SYMBOL } from "./data";
import { activeChartOf, restoreWorkspace, setActiveChart, setGrid, updateChart } from "./layout";
import type { ActiveIndicator, ChartState, GridMode, Layout, PersistedWorkspace, ReplaySpeed } from "./layout";
import { readDetached } from "./windows";

export type { ActiveIndicator, ChartState, GridMode, Layout } from "./layout";

/** A saved Pine script plus the outcome of the most recent run. */
export interface PineScriptRecord {
  id: string;
  name: string;
  source: string;
  options: ScriptOptions | null;
  plots: PinePlot[];
  orders: PineOrder[];
  /** Transpile or runtime error message, if the last run failed. */
  error: string | null;
  /**
   * Scalar `input.*` values from the last successful run, keyed as the
   * runtime keys them (declaration order / `id` kwarg). Absent on records
   * saved before this snapshot existed, or after a failed run.
   */
  inputs?: Record<string, number | string | boolean>;
}

/** A symbol tracked in the watchlist panel. */
export interface WatchEntry {
  symbol: string;
  ticker: string;
  description: string;
  assetClass: string;
  precision: number;
  /** Last traded price, updated by the feed. */
  price: number | null;
  /** Percent change over the current session. */
  changePct: number | null;
}

const LAYOUT_COLORS = ["#2962ff", "#ff9800", "#4caf50", "#e91e63", "#00bcd4", "#9c27b0"];

export const uid = (): string => Math.random().toString(36).slice(2, 10);

export function defaultChartState(): ChartState {
  return {
    symbol: DEFAULT_SYMBOL,
    resolution: "1D",
    chartType: "candles",
    showVolume: true,
    showVolumeProfile: false,
    showGrid: true,
    theme: "dark",
    indicators: [],
    drawings: [],
  };
}

function defaultLayout(index: number): Layout {
  return {
    id: uid(),
    name: `Layout ${index + 1}`,
    color: LAYOUT_COLORS[index % LAYOUT_COLORS.length]!,
    grid: "1",
    createdAt: Date.now(),
    charts: [defaultChartState()],
    activeChart: 0,
  };
}

interface WorkspaceStore {
  layouts: Layout[];
  activeLayoutId: string;
  /** Currently armed drawing tool, or null when panning/selecting. */
  activeTool: DrawingToolId | null;
  /** Layout ids that have unsaved local edits. */
  dirty: Record<string, boolean>;
  /** All price alerts across layouts. */
  alerts: PriceAlert[];
  /** Per-alert rolling close history, newest last. */
  alertHistory: AlertHistory;
  /** Symbols tracked in the watchlist panel. */
  watchlist: WatchEntry[];
  /** Saved Pine scripts, keyed by id. */
  pineScripts: Record<string, PineScriptRecord>;
  /** Replay cursor into the loaded history, or null when off. */
  replayBar: number | null;
  /** Drawing magnet: snaps placed anchors to the nearest candle's OHLC. */
  magnet: MagnetMode;
  /** Mirror the crosshair time across every cell of the active layout. */
  crosshairSync: boolean;
  /** Earnings markers + macro event lines on the chart. */
  showEvents: boolean;
  /** Replay play speed (× 500 ms/bar). */
  replaySpeed: ReplaySpeed;

  activeLayout(): Layout;
  /** The focused chart cell of the active layout. */
  activeChart(): ChartState;
  setActiveLayout(id: string): void;
  /** Patch the focused chart cell. */
  updateActive(patch: Partial<ChartState>): void;
  setGrid(grid: GridMode): void;
  setActiveChart(index: number): void;

  addLayout(): void;
  copyLayout(id: string): void;
  deleteLayout(id: string): void;
  renameLayout(id: string, name: string): void;

  addIndicator(id: string): void;
  removeIndicator(uid: string): void;
  updateIndicatorParams(uid: string, params: Record<string, number | boolean | string>): void;

  /** Replace the drawings of the focused cell, or of cell `chartIndex`. */
  setDrawings(drawings: Drawing[], chartIndex?: number): void;
  /** Undo the last drawing change on the focused cell. */
  undoDrawing(): void;
  /** Redo the last undone drawing change on the focused cell. */
  redoDrawing(): void;
  /** Undo stack for the focused cell's drawings (not persisted). */
  drawingUndo: Drawing[][];
  /** Redo stack for the focused cell's drawings (not persisted). */
  drawingRedo: Drawing[][];
  /** Edit a drawing of the focused cell; pushes one undo entry. */
  updateDrawing(id: string, patch: Partial<Drawing>): void;
  /** Apply a drag-phase patch with no undo entry; `commitDrawingHistory` closes the drag. */
  previewDrawing(id: string, patch: Partial<Drawing>, chartIndex?: number): void;
  /** Push the pre-drag snapshot as one undo entry (drag end). */
  commitDrawingHistory(previous: readonly Drawing[], chartIndex?: number): void;
  /** Remove a drawing of the focused cell (or `chartIndex`), its bound alerts and the selection. */
  deleteDrawing(id: string, chartIndex?: number): void;
  /** Append imported drawings under fresh ids; one undo entry. */
  importDrawings(list: readonly Drawing[], chartIndex?: number): void;
  /** View state: drawing selected for editing (not persisted, not undo-tracked). */
  selectedDrawingId: string | null;
  selectDrawing(id: string | null): void;
  updateIndicator(uid: string, patch: Partial<Pick<ActiveIndicator, "hidden" | "name">>): void;
  setActiveTool(tool: DrawingToolId | null): void;
  setMagnet(mode: MagnetMode): void;
  setCrosshairSync(on: boolean): void;
  setShowEvents(on: boolean): void;
  setReplaySpeed(speed: ReplaySpeed): void;
  /** Reorder the layout tabs alphabetically, or oldest-first. */
  sortLayouts(by: "name" | "date"): void;

  addAlert(symbol: string, condition: AlertCondition, frequency: AlertFrequency, message: string, drawingId?: string): void;
  removeAlert(id: string): void;
  /** Fold one candle into every matching alert; returns ids that just fired. */
  applyCandle(symbol: string, candle: Candle, barClosed: boolean): string[];

  addToWatchlist(entry: WatchEntry): void;
  removeFromWatchlist(symbol: string): void;
  updateWatchPrice(symbol: string, price: number, changePct: number | null): void;

  /** Save a Pine script's source under its name. */
  savePineScript(id: string, name: string, source: string): void;
  deletePineScript(id: string): void;
  /** Result of the last script run, for the tester panel. */
  setPineResult(id: string, result: PineScriptRecord | null): void;
  /** Bar-by-bar replay cursor, or null when not replaying. */
  setReplay(barIndex: number | null): void;

  markSaved(id: string): void;
}

/** Apply `fn` to the active layout and flag it as edited. */
function editActive(s: WorkspaceStore, fn: (layout: Layout) => Layout): Partial<WorkspaceStore> {
  return {
    layouts: s.layouts.map((l) => (l.id === s.activeLayoutId ? fn(l) : l)),
    dirty: { ...s.dirty, [s.activeLayoutId]: true },
  };
}

/** Apply `fn` to the focused chart cell of the active layout. */
function editChart(s: WorkspaceStore, fn: (chart: ChartState) => ChartState): Partial<WorkspaceStore> {
  return editActive(s, (l) => updateChart(l, l.activeChart, fn));
}

/**
 * Keep price alerts bound to a horizontal line in step with the line: moving
 * the anchor re-arms the alert's level. Only price-carrying conditions can
 * follow; channel/moving conditions are left alone.
 */
function syncBoundAlert(
  s: Partial<WorkspaceStore>,
  drawingId: string,
  before: Drawing,
  patch: Partial<Drawing>,
): Partial<WorkspaceStore> {
  if (!patch.points || before.tool !== "horizontal_line" || !s.alerts) return s;
  const price = patch.points[0]?.price;
  if (price === undefined || !Number.isFinite(price)) return s;
  return {
    ...s,
    alerts: s.alerts.map((a) => {
      if (a.drawingId !== drawingId || !("value" in a.condition)) return a;
      return { ...a, condition: { ...a.condition, value: price } };
    }),
  };
}

const initial = [defaultLayout(0)];

/** Detached chart windows share this origin's storage but must never write the workspace. */
const memoryStorage = (): Storage => {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
};

const workspaceStorage = createJSONStorage(() =>
  typeof localStorage === "undefined" || readDetached(globalThis.location?.search ?? "") ? memoryStorage() : localStorage,
);

export const useWorkspace = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      layouts: initial,
      activeLayoutId: initial[0]!.id,
      activeTool: null,
      dirty: {},
      alerts: [],
      alertHistory: {},
      watchlist: [],
      pineScripts: {},
      replayBar: null,
      magnet: "off",
      crosshairSync: false,
      showEvents: true,
      replaySpeed: 1,
      drawingUndo: [],
      drawingRedo: [],
      selectedDrawingId: null,

      activeLayout: () => {
        const { layouts, activeLayoutId } = get();
        return layouts.find((l) => l.id === activeLayoutId) ?? layouts[0]!;
      },

      activeChart: () => activeChartOf(get().activeLayout()),

      setActiveLayout: (id) => set({ activeLayoutId: id, activeTool: null, selectedDrawingId: null }),

      updateActive: (patch) => set((s) => editChart(s, (c) => ({ ...c, ...patch }))),

      setGrid: (grid) => set((s) => editActive(s, (l) => setGrid(l, grid))),

      // Focus is view state, not an edit: it does not mark the layout dirty.
      setActiveChart: (index) =>
        set((s) => {
          const layout = get().activeLayout();
          const next = setActiveChart(layout, index);
          if (next === layout) return s;
          return { layouts: s.layouts.map((l) => (l.id === layout.id ? next : l)), replayBar: null };
        }),

      addLayout: () =>
        set((s) => {
          const layout = defaultLayout(s.layouts.length);
          return { layouts: [...s.layouts, layout], activeLayoutId: layout.id };
        }),

      copyLayout: (id) =>
        set((s) => {
          const src = s.layouts.find((l) => l.id === id);
          if (!src) return s;
          const layout: Layout = {
            ...structuredCloneLayout(src),
            id: uid(),
            name: `${src.name} copy`,
            color: LAYOUT_COLORS[s.layouts.length % LAYOUT_COLORS.length]!,
            createdAt: Date.now(),
          };
          return { layouts: [...s.layouts, layout], activeLayoutId: layout.id };
        }),

      deleteLayout: (id) =>
        set((s) => {
          if (s.layouts.length <= 1) return s;
          const layouts = s.layouts.filter((l) => l.id !== id);
          return {
            layouts,
            activeLayoutId: s.activeLayoutId === id ? layouts[0]!.id : s.activeLayoutId,
          };
        }),

      renameLayout: (id, name) =>
        set((s) => ({ layouts: s.layouts.map((l) => (l.id === id ? { ...l, name } : l)) })),

      addIndicator: (id) => {
        const def = getIndicator(id);
        if (!def) return;
        set((s) =>
          editChart(s, (c) => ({
            ...c,
            indicators: [
              ...c.indicators,
              {
                uid: uid(),
                def,
                params: Object.fromEntries(def.params.map((p) => [p.id, p.default])),
                colorIndex: c.indicators.length,
              },
            ],
          })),
        );
      },

      removeIndicator: (target) =>
        set((s) => editChart(s, (c) => ({ ...c, indicators: c.indicators.filter((i) => i.uid !== target) }))),

      updateIndicatorParams: (target, params) =>
        set((s) =>
          editChart(s, (c) => ({ ...c, indicators: c.indicators.map((i) => (i.uid === target ? { ...i, params } : i)) })),
        ),

      updateIndicator: (target, patch) =>
        set((s) =>
          editChart(s, (c) => ({ ...c, indicators: c.indicators.map((i) => (i.uid === target ? { ...i, ...patch } : i)) })),
        ),

      setDrawings: (drawings, chartIndex) =>
        set((s) => {
          const layout = s.activeLayout();
          const idx = chartIndex ?? layout.activeChart;
          const prev = layout.charts[idx]?.drawings ?? [];
          const next = editActive(s, (l) => updateChart(l, idx, (c) => ({ ...c, drawings })));
          return { ...next, drawingUndo: [...s.drawingUndo, structuredClone(prev)], drawingRedo: [] };
        }),

      undoDrawing: () =>
        set((s) => {
          if (s.drawingUndo.length === 0) return s;
          const layout = s.activeLayout();
          const idx = layout.activeChart;
          const current = layout.charts[idx]?.drawings ?? [];
          const previous = s.drawingUndo[s.drawingUndo.length - 1]!;
          const next = editActive(s, (l) => updateChart(l, idx, (c) => ({ ...c, drawings: structuredClone(previous) })));
          return { ...next, drawingUndo: s.drawingUndo.slice(0, -1), drawingRedo: [...s.drawingRedo, structuredClone(current)] };
        }),

      redoDrawing: () =>
        set((s) => {
          if (s.drawingRedo.length === 0) return s;
          const layout = s.activeLayout();
          const idx = layout.activeChart;
          const current = layout.charts[idx]?.drawings ?? [];
          const nextArr = s.drawingRedo[s.drawingRedo.length - 1]!;
          const next = editActive(s, (l) => updateChart(l, idx, (c) => ({ ...c, drawings: structuredClone(nextArr) })));
          return { ...next, drawingRedo: s.drawingRedo.slice(0, -1), drawingUndo: [...s.drawingUndo, structuredClone(current)] };
        }),

      updateDrawing: (id, patch) =>
        set((s) => {
          const layout = s.activeLayout();
          const idx = layout.activeChart;
          const prev = layout.charts[idx]?.drawings ?? [];
          const target = prev.find((d) => d.id === id);
          if (!target) return s;
          const edited = editChart(s, (c) => ({
            ...c,
            drawings: c.drawings.map((d) => (d.id === id ? { ...d, ...patch } : d)),
          }));
          return {
            ...syncBoundAlert({ ...edited, alerts: s.alerts }, id, target, patch),
            drawingUndo: [...s.drawingUndo, structuredClone(prev)],
            drawingRedo: [],
          };
        }),

      previewDrawing: (id, patch, chartIndex) =>
        set((s) => {
          const layout = s.activeLayout();
          const idx = chartIndex ?? layout.activeChart;
          const prev = layout.charts[idx]?.drawings ?? [];
          const target = prev.find((d) => d.id === id);
          if (!target) return s;
          const edited = editActive(s, (l) =>
            updateChart(l, idx, (c) => ({ ...c, drawings: c.drawings.map((d) => (d.id === id ? { ...d, ...patch } : d)) })),
          );
          return syncBoundAlert({ ...edited, alerts: s.alerts }, id, target, patch);
        }),

      commitDrawingHistory: (previous) =>
        set((s) => ({
          drawingUndo: [...s.drawingUndo, structuredClone([...previous])],
          drawingRedo: [],
        })),

      deleteDrawing: (id, chartIndex) =>
        set((s) => {
          const layout = s.activeLayout();
          const idx = chartIndex ?? layout.activeChart;
          const prev = layout.charts[idx]?.drawings ?? [];
          const drawings = prev.filter((d) => d.id !== id);
          const selection = s.selectedDrawingId === id ? null : s.selectedDrawingId;
          if (drawings.length === prev.length) {
            return selection === s.selectedDrawingId ? s : { selectedDrawingId: selection };
          }
          const next = editActive(s, (l) => updateChart(l, idx, (c) => ({ ...c, drawings })));
          const alerts = s.alerts.filter((a) => a.drawingId !== id);
          const alertHistory = Object.fromEntries(
            Object.entries(s.alertHistory).filter(([aid]) => alerts.some((a) => a.id === aid)),
          );
          return {
            ...next,
            alerts,
            alertHistory,
            selectedDrawingId: selection,
            drawingUndo: [...s.drawingUndo, structuredClone(prev)],
            drawingRedo: [],
          };
        }),

      importDrawings: (list, chartIndex) =>
        set((s) => {
          const layout = s.activeLayout();
          const idx = chartIndex ?? layout.activeChart;
          const prev = layout.charts[idx]?.drawings ?? [];
          const fresh = list.map((d) => ({ ...d, id: uid() }));
          const next = editActive(s, (l) =>
            updateChart(l, idx, (c) => ({ ...c, drawings: [...c.drawings, ...fresh] })),
          );
          return { ...next, drawingUndo: [...s.drawingUndo, structuredClone(prev)], drawingRedo: [] };
        }),

      selectDrawing: (id) => set({ selectedDrawingId: id }),

      setActiveTool: (tool) => set({ activeTool: tool }),

      setMagnet: (mode) => set({ magnet: mode }),

      addAlert: (symbol, condition, frequency, message, drawingId) =>
        set((s) => ({
          alerts: [
            ...s.alerts,
            {
              id: uid(),
              symbol,
              message,
              condition,
              frequency,
              state: "armed",
              createdAt: Date.now(),
              ...(drawingId ? { drawingId } : {}),
            },
          ],
        })),

      removeAlert: (id) =>
        set((s) => {
          const { [id]: _dropped, ...rest } = s.alertHistory;
          return { alerts: s.alerts.filter((a) => a.id !== id), alertHistory: rest };
        }),

      applyCandle: (symbol, candle, barClosed) => {
        const fired: string[] = [];
        let alerts = get().alerts;
        let history = get().alertHistory;
        alerts = alerts.map((alert) => {
          if (alert.symbol !== symbol) return alert;
          const closes = history[alert.id] ?? [];
          const next = evaluateAlert(alert, closes, candle, barClosed);
          history = pushHistory(history, alert.id, candle.close);
          if (!next) return alert;
          if (next.state === "triggered" && alert.state !== "triggered") fired.push(next.id);
          return next;
        });
        set({ alerts, alertHistory: history });
        return fired;
      },

      addToWatchlist: (entry) =>
        set((s) => (s.watchlist.some((w) => w.symbol === entry.symbol) ? s : { watchlist: [...s.watchlist, entry] })),

      removeFromWatchlist: (symbol) =>
        set((s) => ({ watchlist: s.watchlist.filter((w) => w.symbol !== symbol) })),

      updateWatchPrice: (symbol, price, changePct) =>
        set((s) => ({
          watchlist: s.watchlist.map((w) => (w.symbol === symbol ? { ...w, price, changePct } : w)),
        })),

      savePineScript: (id, name, source) =>
        set((s) => {
          const existing = s.pineScripts[id];
          return {
            pineScripts: {
              ...s.pineScripts,
              // Keep the last run's output when only the source changed.
              [id]: {
                id,
                name,
                source,
                options: existing?.options ?? null,
                plots: existing?.plots ?? [],
                orders: existing?.orders ?? [],
                error: existing?.error ?? null,
                // Spread so a record without the snapshot stays without it.
                ...(existing?.inputs !== undefined ? { inputs: existing.inputs } : {}),
              },
            },
          };
        }),

      deletePineScript: (id) =>
        set((s) => {
          const next = { ...s.pineScripts };
          delete next[id];
          return { pineScripts: next };
        }),

      setPineResult: (id, result) =>
        set((s) => {
          if (!result) return {};
          const existing = s.pineScripts[id];
          return { pineScripts: { ...s.pineScripts, [id]: { ...existing, ...result, id } } };
        }),

      setReplay: (barIndex) => set({ replayBar: barIndex }),

      setCrosshairSync: (on) => set({ crosshairSync: on }),
      setShowEvents: (on) => set({ showEvents: on }),
      setReplaySpeed: (speed) => set({ replaySpeed: speed }),

      sortLayouts: (by) =>
        set((s) => {
          const layouts = s.layouts.toSorted((a, b) =>
            by === "name"
              ? a.name.localeCompare(b.name)
              : (a.createdAt ?? 0) - (b.createdAt ?? 0),
          );
          return { layouts };
        }),

      markSaved: (id) => set((s) => ({ dirty: { ...s.dirty, [id]: false } })),
    }),
    {
      name: "ezyview.workspace",
      version: 1,
      storage: workspaceStorage,
      partialize: (s): PersistedWorkspace => ({
        layouts: s.layouts,
        activeLayoutId: s.activeLayoutId,
        magnet: s.magnet,
        crosshairSync: s.crosshairSync,
        replaySpeed: s.replaySpeed,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...restoreWorkspace(persisted, current, defaultChartState(), getIndicator),
      }),
    },
  ),
);

/** Deep copy for "Duplicate layout"; indicator defs are shared, not cloned, as they hold functions. */
function structuredCloneLayout(layout: Layout): Layout {
  return {
    ...layout,
    charts: layout.charts.map((c) => ({
      ...c,
      indicators: c.indicators.map((i) => ({ ...i, params: { ...i.params } })),
      drawings: structuredClone(c.drawings),
    })),
  };
}

/** Catalogue grouped by family, memoized at module scope for the picker. */
export const INDICATOR_FAMILIES = (() => {
  const out: Record<string, IndicatorDef[]> = {};
  for (const def of catalog()) (out[def.family] ??= []).push(def);
  return out;
})();

export const THEME_OF = { dark: DARK_THEME, light: LIGHT_THEME, tokyo: TOKYO_THEME } as const;
