import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DARK_THEME, LIGHT_THEME, TOKYO_THEME } from "@ezyview/chart-engine";
import { catalog, getIndicator } from "@ezyview/indicators";
import type { IndicatorDef } from "@ezyview/indicators";
import type { Drawing } from "@ezyview/drawing-tools";
import { DEFAULT_EVENT_OPTIONS, restoreEventOptions } from "./eventOptions";
import { restoreTemplates } from "./chartTemplates";
import { pasteAt } from "./drawingClipboard";
import { activeChartOf, restoreWorkspace, setActiveChart, setGrid, updateChart } from "./layout";
import { isDensity, resolveAppTheme } from "./layout";
import type { Layout } from "./layout";
import type { CompareSymbol } from "./layout";
import {
  applyToGroup,
  COMPARE_COLORS,
  defaultChartState,
  defaultLayout,
  editActive,
  editChart,
  initial,
  LAYOUT_COLORS,
  pushChartHistory,
  pushUndo,
  restoreAppTheme,
  structuredCloneLayout,
  syncBoundAlert,
  uid,
} from "./store/helpers";
import { workspaceStorage, writeWorkspaceForTest } from "./store/persistence";
import type { PersistedState } from "./store/persistence";
import { createWatchlistSlice, watchlistQuoteKeys } from "./store/watchlist";
import { createAlertsSlice } from "./store/alerts";
import { createPineSlice, restorePineScripts } from "./store/pine";
import { createTemplatesSlice } from "./store/templates";
import {
  restoreAlertHistory,
  restoreAlerts,
  restoreFavoriteTools,
  restoreToolStyles,
  restoreWatchlist,
} from "./store/restore";
import type { WorkspaceStore } from "./store/types";

export type { ActiveIndicator, ChartState, GridMode, Layout } from "./layout";
export type { PineScriptRecord, PineScriptVersion, WatchEntry } from "./store/types";
export { DEFAULT_WATCHLIST, watchlistQuoteKeys } from "./store/watchlist";
export { restoreAlerts, restoreWatchlist } from "./store/restore";
export { uid, defaultChartState, writeWorkspaceForTest };

export const useWorkspace = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      ...createWatchlistSlice(set, get),
      ...createAlertsSlice(set, get),
      ...createPineSlice(set, get),
      ...createTemplatesSlice(set, get),
      layouts: initial,
      appTheme: "auto",
      setAppTheme: (theme) => set({ appTheme: theme }),
      density: "compact",
      setDensity: (density) => set({ density }),
      shellTheme: () => resolveAppTheme(get().appTheme, activeChartOf(get().activeLayout()).theme),
      activeLayoutId: initial[0]!.id,
      activeTool: null,
      stayInDrawingMode: false,
      lockAllDrawings: false,
      hideAllDrawings: false,
      eraserMode: false,
      favoriteTools: [],
      drawingToolStyles: {},
      dirty: {},
      replayBar: null,
      replaySymbol: null,
      magnet: "off",
      crosshairSync: false,
      eventOptions: DEFAULT_EVENT_OPTIONS,
      drawingClipboard: null,
      replaySpeed: 1,
      drawingUndoStacks: {},
      drawingRedoStacks: {},
      drawingHistoryOrder: [],
      drawingUndo: [],
      drawingRedo: [],
      selectedDrawingId: null,
      selectedDrawingIds: [],

      activeLayout: () => {
        const { layouts, activeLayoutId } = get();
        return layouts.find((l) => l.id === activeLayoutId) ?? layouts[0]!;
      },

      activeChart: () => activeChartOf(get().activeLayout()),

      setActiveLayout: (id) =>
        set((s) => {
          const targetLayout = s.layouts.find((l) => l.id === id) ?? s.layouts[0];
          const activeIdx = targetLayout?.activeChart ?? 0;
          const key = `${id}:${activeIdx}`;
          return {
            activeLayoutId: id,
            activeTool: null,
            eraserMode: false,
            selectedDrawingId: null,
            selectedDrawingIds: [],
            drawingUndo: s.drawingUndoStacks[key] ?? [],
            drawingRedo: s.drawingRedoStacks[key] ?? [],
          };
        }),

      // Per-cell settings. The linked fields (symbol, interval) have their own
      // actions below, because they propagate to the cell's link group.
      updateActive: (patch) =>
        set((s) => {
          const layout = s.layouts.find((l) => l.id === s.activeLayoutId) ?? s.layouts[0];
          if (!layout) return s;
          const current = layout.charts[layout.activeChart];
          if (!current) return s;
          const hasChange = Object.entries(patch).some(
            ([k, v]) => (current as unknown as Record<string, unknown>)[k] !== v,
          );
          if (!hasChange) return s;
          return editChart(s, (c) => ({ ...c, ...patch }));
        }),

      addCompare: (symbol, mode = "percent") =>
        set((s) => {
          const chart = s.activeChart();
          const existing = chart.compare ?? [];
          if (existing.some((c) => c.symbol === symbol)) return s;
          const next: CompareSymbol = {
            id: uid(),
            symbol,
            color: COMPARE_COLORS[existing.length % COMPARE_COLORS.length]!,
            mode,
            visible: true,
          };
          return editActive(s, (l) =>
            updateChart(l, l.activeChart, (c) => ({ ...c, compare: [...(c.compare ?? []), next] })),
          );
        }),

      removeCompare: (id) =>
        set((s) =>
          editActive(s, (l) =>
            updateChart(l, l.activeChart, (c) => ({ ...c, compare: (c.compare ?? []).filter((x) => x.id !== id) })),
          ),
        ),

      updateCompare: (id, patch) =>
        set((s) =>
          editActive(s, (l) =>
            updateChart(l, l.activeChart, (c) => ({
              ...c,
              compare: (c.compare ?? []).map((x) => (x.id === id ? Object.assign({}, x, patch) : x)),
            })),
          ),
        ),

      updateChart: (index, patch) =>
        set((s) => {
          const layout = s.layouts.find((l) => l.id === s.activeLayoutId) ?? s.layouts[0];
          if (!layout) return s;
          const current = layout.charts[index];
          if (!current) return s;
          const hasChange = Object.entries(patch).some(
            ([k, v]) => (current as unknown as Record<string, unknown>)[k] !== v,
          );
          if (!hasChange) return s;
          return editActive(s, (l) => updateChart(l, index, (c) => ({ ...c, ...patch })));
        }),

      // The focused cell's symbol, and every cell in its link group. A feed
      // travels with the symbol when the caller knows it (watchlist rows do).
      setSymbol: (symbol, source) =>
        set((s) => editActive(s, (l) => applyToGroup(l, source ? { symbol, dataSource: source } : { symbol }))),

      // The focused cell's interval, and every cell in its link group.
      setResolution: (resolution) => set((s) => editActive(s, (l) => applyToGroup(l, { resolution }))),

      // Putting a cell into a group, or taking it out.
      setLinkGroup: (group) =>
        set((s) => {
          const layout = get().activeLayout();
          const index = layout.activeChart;
          const name = group?.trim() ? group.trim() : undefined;
          const charts = layout.charts.map((c, i) => (i === index ? { ...c, linkGroup: name } : c));
          const next = { ...layout, charts };
          return { layouts: s.layouts.map((l) => (l.id === layout.id ? next : l)), dirty: { ...s.dirty, [layout.id]: true } };
        }),

      setGrid: (grid) => set((s) => editActive(s, (l) => setGrid(l, grid))),

      // Focus is view state, not an edit: it does not mark the layout dirty.
      setActiveChart: (index) =>
        set((s) => {
          const layout = get().activeLayout();
          const next = setActiveChart(layout, index);
          if (next === layout) return s;
          const key = `${layout.id}:${index}`;
          return {
            layouts: s.layouts.map((l) => (l.id === layout.id ? next : l)),
            replayBar: null,
            replaySymbol: null,
            drawingUndo: s.drawingUndoStacks[key] ?? [],
            drawingRedo: s.drawingRedoStacks[key] ?? [],
          };
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

      importLayout: (imported) =>
        set((s) => {
          const layout: Layout = {
            ...imported,
            id: uid(),
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
          editChart(s, (c) => ({
            ...c,
            indicators: c.indicators.map((i) => (i.uid === target ? { ...i, params: { ...i.params, ...params } } : i)),
          })),
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
          const history = pushChartHistory(s, layout.id, idx, prev);
          return { ...next, ...history };
        }),

      undoDrawing: (chartIndex) =>
        set((s) => {
          const layout = s.activeLayout();
          let targetIdx: number | undefined = chartIndex;
          let targetLayoutId = layout.id;

          if (targetIdx === undefined) {
            const activeKey = `${layout.id}:${layout.activeChart}`;
            const activeStack = s.drawingUndoStacks[activeKey] ?? s.drawingUndo;
            if (activeStack.length > 0) {
              targetIdx = layout.activeChart;
            } else {
              for (let i = s.drawingHistoryOrder.length - 1; i >= 0; i--) {
                const entry = s.drawingHistoryOrder[i]!;
                const key = `${entry.layoutId}:${entry.chartIndex}`;
                if ((s.drawingUndoStacks[key]?.length ?? 0) > 0) {
                  targetLayoutId = entry.layoutId;
                  targetIdx = entry.chartIndex;
                  break;
                }
              }
            }
          }

          if (targetIdx === undefined) {
            if (s.drawingUndo.length > 0) {
              targetIdx = layout.activeChart;
            } else {
              return s;
            }
          }

          const key = `${targetLayoutId}:${targetIdx}`;
          const undoStack = s.drawingUndoStacks[key] ?? (targetLayoutId === layout.id && targetIdx === layout.activeChart ? s.drawingUndo : []);
          if (undoStack.length === 0) return s;

          const previous = undoStack[undoStack.length - 1]!;
          const nextUndo = undoStack.slice(0, -1);

          const targetLayout = s.layouts.find((l) => l.id === targetLayoutId) ?? layout;
          const currentDrawings = targetLayout.charts[targetIdx]?.drawings ?? [];
          const currentRedo = s.drawingRedoStacks[key] ?? (targetLayoutId === layout.id && targetIdx === layout.activeChart ? s.drawingRedo : []);
          const nextRedo = pushUndo(currentRedo, currentDrawings);

          const nextLayouts = s.layouts.map((l) =>
            l.id === targetLayoutId
              ? updateChart(l, targetIdx!, (c) => ({ ...c, drawings: previous.slice() }))
              : l,
          );

          const nextUndoStacks = { ...s.drawingUndoStacks, [key]: nextUndo };
          const nextRedoStacks = { ...s.drawingRedoStacks, [key]: nextRedo };

          const activeKey = `${layout.id}:${layout.activeChart}`;
          return {
            layouts: nextLayouts,
            dirty: { ...s.dirty, [targetLayoutId]: true },
            drawingUndoStacks: nextUndoStacks,
            drawingRedoStacks: nextRedoStacks,
            drawingUndo: nextUndoStacks[activeKey] ?? [],
            drawingRedo: nextRedoStacks[activeKey] ?? [],
          };
        }),

      redoDrawing: (chartIndex) =>
        set((s) => {
          const layout = s.activeLayout();
          let targetIdx: number | undefined = chartIndex;
          let targetLayoutId = layout.id;

          if (targetIdx === undefined) {
            const activeKey = `${layout.id}:${layout.activeChart}`;
            const activeStack = s.drawingRedoStacks[activeKey] ?? s.drawingRedo;
            if (activeStack.length > 0) {
              targetIdx = layout.activeChart;
            } else {
              for (let i = s.drawingHistoryOrder.length - 1; i >= 0; i--) {
                const entry = s.drawingHistoryOrder[i]!;
                const key = `${entry.layoutId}:${entry.chartIndex}`;
                if ((s.drawingRedoStacks[key]?.length ?? 0) > 0) {
                  targetLayoutId = entry.layoutId;
                  targetIdx = entry.chartIndex;
                  break;
                }
              }
            }
          }

          if (targetIdx === undefined) {
            if (s.drawingRedo.length > 0) {
              targetIdx = layout.activeChart;
            } else {
              return s;
            }
          }

          const key = `${targetLayoutId}:${targetIdx}`;
          const redoStack = s.drawingRedoStacks[key] ?? (targetLayoutId === layout.id && targetIdx === layout.activeChart ? s.drawingRedo : []);
          if (redoStack.length === 0) return s;

          const nextArr = redoStack[redoStack.length - 1]!;
          const nextRedo = redoStack.slice(0, -1);

          const targetLayout = s.layouts.find((l) => l.id === targetLayoutId) ?? layout;
          const currentDrawings = targetLayout.charts[targetIdx]?.drawings ?? [];
          const currentUndo = s.drawingUndoStacks[key] ?? (targetLayoutId === layout.id && targetIdx === layout.activeChart ? s.drawingUndo : []);
          const nextUndo = pushUndo(currentUndo, currentDrawings);

          const nextLayouts = s.layouts.map((l) =>
            l.id === targetLayoutId
              ? updateChart(l, targetIdx!, (c) => ({ ...c, drawings: nextArr.slice() }))
              : l,
          );

          const nextUndoStacks = { ...s.drawingUndoStacks, [key]: nextUndo };
          const nextRedoStacks = { ...s.drawingRedoStacks, [key]: nextRedo };

          const activeKey = `${layout.id}:${layout.activeChart}`;
          return {
            layouts: nextLayouts,
            dirty: { ...s.dirty, [targetLayoutId]: true },
            drawingUndoStacks: nextUndoStacks,
            drawingRedoStacks: nextRedoStacks,
            drawingUndo: nextUndoStacks[activeKey] ?? [],
            drawingRedo: nextRedoStacks[activeKey] ?? [],
          };
        }),

      updateDrawing: (id, patch, chartIndex) =>
        set((s) => {
          const layout = s.activeLayout();
          const idx = chartIndex ?? layout.activeChart;
          const prev = layout.charts[idx]?.drawings ?? [];
          const target = prev.find((d) => d.id === id);
          if (!target) return s;
          const edited = editActive(s, (l) =>
            updateChart(l, idx, (c) => ({
              ...c,
              drawings: c.drawings.map((d) => (d.id === id ? { ...d, ...patch } : d)),
            })),
          );
          const history = pushChartHistory(s, layout.id, idx, prev);
          return {
            ...syncBoundAlert({ ...edited, alerts: s.alerts }, id, target, patch),
            // Editing a drawing's look teaches the tool: the next drawing of
            // this type starts with the style the user just chose.
            ...(patch.style
              ? { drawingToolStyles: { ...s.drawingToolStyles, [target.tool]: { ...patch.style } } }
              : {}),
            ...history,
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

      commitDrawingHistory: (previous, chartIndex) =>
        set((s) => {
          const layout = s.activeLayout();
          const idx = chartIndex ?? layout.activeChart;
          return pushChartHistory(s, layout.id, idx, previous);
        }),

      deleteDrawing: (id, chartIndex) =>
        set((s) => {
          const layout = s.activeLayout();
          const idx = chartIndex ?? layout.activeChart;
          const prev = layout.charts[idx]?.drawings ?? [];
          const drawings = prev.filter((d) => d.id !== id);
          const remaining = s.selectedDrawingIds.filter((x) => x !== id);
          const selection = remaining.at(-1) ?? null;
          if (drawings.length === prev.length) {
            return selection === s.selectedDrawingId ? s : { selectedDrawingId: selection, selectedDrawingIds: remaining };
          }
          const next = editActive(s, (l) => updateChart(l, idx, (c) => ({ ...c, drawings })));
          const alerts = s.alerts.filter((a) => a.drawingId !== id);
          const alertHistory = Object.fromEntries(
            Object.entries(s.alertHistory).filter(([aid]) => alerts.some((a) => a.id === aid)),
          );
          const history = pushChartHistory(s, layout.id, idx, prev);
          return {
            ...next,
            alerts,
            alertHistory,
            selectedDrawingId: selection,
            selectedDrawingIds: remaining,
            ...history,
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
          const history = pushChartHistory(s, layout.id, idx, prev);
          return { ...next, ...history };
        }),

      selectDrawing: (id) => set({ selectedDrawingId: id, selectedDrawingIds: id ? [id] : [] }),

      setDrawingSelection: (ids) =>
        set(() => {
          const unique = [...new Set(ids)];
          return { selectedDrawingIds: unique, selectedDrawingId: unique.at(-1) ?? null };
        }),

      toggleDrawingSelection: (id) =>
        set((s) => {
          const has = s.selectedDrawingIds.includes(id);
          const next = has ? s.selectedDrawingIds.filter((x) => x !== id) : [...s.selectedDrawingIds, id];
          return { selectedDrawingIds: next, selectedDrawingId: next.at(-1) ?? null };
        }),

      selectAllDrawings: () =>
        set((s) => {
          const drawings = activeChartOf(s.activeLayout()).drawings;
          const ids = drawings.filter((d) => !d.hidden && !d.locked).map((d) => d.id);
          return { selectedDrawingIds: ids, selectedDrawingId: ids.at(-1) ?? null };
        }),

      groupSelectedDrawings: () =>
        set((s) => {
          const selected = new Set(s.selectedDrawingIds);
          if (selected.size < 2) return s;
          const layout = s.activeLayout();
          const idx = layout.activeChart;
          const prev = layout.charts[idx]?.drawings ?? [];
          if (!prev.some((d) => selected.has(d.id))) return s;
          const groupId = uid();
          const drawings = prev.map((d) => (selected.has(d.id) ? { ...d, groupId } : d));
          const next = editActive(s, (l) => updateChart(l, idx, (c) => ({ ...c, drawings })));
          const history = pushChartHistory(s, layout.id, idx, prev);
          return { ...next, ...history };
        }),

      ungroupSelectedDrawings: () =>
        set((s) => {
          const selected = new Set(s.selectedDrawingIds);
          if (selected.size === 0) return s;
          const layout = s.activeLayout();
          const idx = layout.activeChart;
          const prev = layout.charts[idx]?.drawings ?? [];
          if (!prev.some((d) => selected.has(d.id) && d.groupId !== undefined)) return s;
          const drawings = prev.map((d) => {
            if (!selected.has(d.id) || d.groupId === undefined) return d;
            const { groupId: _groupId, ...rest } = d;
            return rest;
          });
          const next = editActive(s, (l) => updateChart(l, idx, (c) => ({ ...c, drawings })));
          const history = pushChartHistory(s, layout.id, idx, prev);
          return { ...next, ...history };
        }),

      updateSelectedDrawings: (patch) =>
        get().updateDrawings(get().selectedDrawingIds, patch),

      updateDrawings: (ids, patch, chartIndex) =>
        set((s) => {
          const target = new Set(ids);
          if (target.size === 0) return s;
          const layout = s.activeLayout();
          const idx = chartIndex ?? layout.activeChart;
          const prev = layout.charts[idx]?.drawings ?? [];
          if (!prev.some((d) => target.has(d.id))) return s;
          const drawings = prev.map((d) => (target.has(d.id) ? { ...d, ...patch } : d));
          const next = editActive(s, (l) => updateChart(l, idx, (c) => ({ ...c, drawings })));
          const history = pushChartHistory(s, layout.id, idx, prev);
          return { ...next, ...history };
        }),

      nudgeSelectedDrawings: (dTime, dPrice) =>
        set((s) => {
          const selected = new Set(s.selectedDrawingIds);
          if (selected.size === 0 || (dTime === 0 && dPrice === 0)) return s;
          const layout = s.activeLayout();
          const idx = layout.activeChart;
          const prev = layout.charts[idx]?.drawings ?? [];
          if (!prev.some((d) => selected.has(d.id) && !d.locked)) return s;
          const drawings = prev.map((d) =>
            selected.has(d.id) && !d.locked
              ? { ...d, points: d.points.map((p) => ({ time: p.time + dTime, price: p.price + dPrice })) }
              : d,
          );
          const next = editActive(s, (l) => updateChart(l, idx, (c) => ({ ...c, drawings })));
          const history = pushChartHistory(s, layout.id, idx, prev);
          return { ...next, ...history };
        }),

      deleteDrawings: (ids) =>
        set((s) => {
          const target = new Set(ids);
          if (target.size === 0) return s;
          const layout = s.activeLayout();
          const idx = layout.activeChart;
          const prev = layout.charts[idx]?.drawings ?? [];
          const drawings = prev.filter((d) => !target.has(d.id));
          if (drawings.length === prev.length) return s;
          const next = editActive(s, (l) => updateChart(l, idx, (c) => ({ ...c, drawings })));
          const alerts = s.alerts.filter((a) => !a.drawingId || !target.has(a.drawingId));
          const alertHistory = Object.fromEntries(
            Object.entries(s.alertHistory).filter(([aid]) => alerts.some((a) => a.id === aid)),
          );
          const history = pushChartHistory(s, layout.id, idx, prev);
          const selectedDrawingIds = s.selectedDrawingIds.filter((id) => !target.has(id));
          return {
            ...next,
            alerts,
            alertHistory,
            selectedDrawingIds,
            selectedDrawingId: selectedDrawingIds.at(-1) ?? null,
            ...history,
          };
        }),

      deleteSelectedDrawings: () =>
        set((s) => {
          const selected = new Set(s.selectedDrawingIds);
          if (selected.size === 0) return s;
          const layout = s.activeLayout();
          const idx = layout.activeChart;
          const prev = layout.charts[idx]?.drawings ?? [];
          const drawings = prev.filter((d) => !selected.has(d.id));
          if (drawings.length === prev.length) return s;
          const next = editActive(s, (l) => updateChart(l, idx, (c) => ({ ...c, drawings })));
          const alerts = s.alerts.filter((a) => !a.drawingId || !selected.has(a.drawingId));
          const alertHistory = Object.fromEntries(
            Object.entries(s.alertHistory).filter(([aid]) => alerts.some((a) => a.id === aid)),
          );
          const history = pushChartHistory(s, layout.id, idx, prev);
          return {
            ...next,
            alerts,
            alertHistory,
            selectedDrawingIds: [],
            selectedDrawingId: null,
            ...history,
          };
        }),

      duplicateSelectedDrawings: () =>
        set((s) => {
          const selected = new Set(s.selectedDrawingIds);
          if (selected.size === 0) return s;
          const layout = s.activeLayout();
          const idx = layout.activeChart;
          const prev = layout.charts[idx]?.drawings ?? [];
          const source = prev.filter((d) => selected.has(d.id));
          if (source.length === 0) return s;
          const offset = Math.max(Math.abs(source[0]!.points[0]?.price ?? 1) * 0.002, 0.0001);
          const clones = source.map((d) => {
            const clone = structuredClone(d);
            clone.id = uid();
            clone.locked = false;
            clone.points = d.points.map((p) => ({ time: p.time, price: p.price + offset }));
            return clone;
          });
          const drawings = [...prev, ...clones];
          const next = editActive(s, (l) => updateChart(l, idx, (c) => ({ ...c, drawings })));
          const history = pushChartHistory(s, layout.id, idx, prev);
          const ids = clones.map((d) => d.id);
          return { ...next, selectedDrawingIds: ids, selectedDrawingId: ids.at(-1) ?? null, ...history };
        }),

      setActiveTool: (tool) => set({ activeTool: tool, ...(tool ? { eraserMode: false } : {}) }),
      setStayInDrawingMode: (on) => set({ stayInDrawingMode: on }),
      setLockAllDrawings: (on) => set({ lockAllDrawings: on }),
      setHideAllDrawings: (on) => set({ hideAllDrawings: on }),
      setEraserMode: (on) => set({ eraserMode: on, ...(on ? { activeTool: null, selectedDrawingId: null } : {}) }),
      toggleFavoriteTool: (tool) =>
        set((s) => ({
          favoriteTools: s.favoriteTools.includes(tool)
            ? s.favoriteTools.filter((t) => t !== tool)
            : [...s.favoriteTools, tool],
        })),
      rememberDrawingStyle: (tool, style) =>
        set((s) => ({ drawingToolStyles: { ...s.drawingToolStyles, [tool]: { ...style } } })),

      setMagnet: (mode) => set({ magnet: mode }),

      setReplay: (barIndex) => {
        if (barIndex === null) {
          set({ replayBar: null, replaySymbol: null });
          return;
        }
        // The cursor belongs to the focused chart: only its symbol pauses live
        // ticks while every other panel keeps streaming.
        const symbol = activeChartOf(get().activeLayout()).symbol;
        set({ replayBar: barIndex, replaySymbol: symbol });
      },

      setCrosshairSync: (on) => set({ crosshairSync: on }),
      copyDrawing: (id) => {
        const s = get();
        const drawings = activeChartOf(s.activeLayout()).drawings;
        // Copying one id still copies the whole selection when that id is part
        // of it; Ctrl+C on a multi-selection must not silently shrink to one.
        const ids = id
          ? s.selectedDrawingIds.includes(id)
            ? s.selectedDrawingIds
            : [id]
          : s.selectedDrawingIds;
        const copied = drawings.filter((d) => ids.includes(d.id)).map((d) => structuredClone(d));
        if (copied.length > 0) set({ drawingClipboard: copied });
      },

      pasteDrawing: (at) => {
        const s = get();
        const clipboard = s.drawingClipboard;
        if (!clipboard || clipboard.length === 0) return;
        const anchor = clipboard[0]!.points[0];
        const pasted = clipboard.map((drawing) => {
          const first = drawing.points[0];
          const point = first && anchor
            ? { time: at.time + (first.time - anchor.time), price: at.price + (first.price - anchor.price) }
            : at;
          return pasteAt(drawing, point, uid());
        });
        s.setDrawings([...activeChartOf(s.activeLayout()).drawings, ...pasted]);
        const ids = pasted.map((d) => d.id);
        set({ selectedDrawingIds: ids, selectedDrawingId: ids.at(-1) ?? null });
      },

      duplicateDrawing: (id) =>
        set((s) => {
          const layout = s.activeLayout();
          const idx = layout.activeChart;
          const drawings = layout.charts[idx]?.drawings ?? [];
          const target = drawings.find((d) => d.id === (id ?? s.selectedDrawingId));
          if (!target) return s;
          // Offset by a fraction of the anchor price so the clone is visibly
          // distinct but stays in the same part of the chart.
          const offset = Math.max(Math.abs(target.points[0]?.price ?? 1) * 0.002, 0.0001);
          const clone: Drawing = {
            ...structuredClone(target),
            id: uid(),
            locked: false,
            points: target.points.map((p) => ({ time: p.time, price: p.price + offset })),
          };
          const next = editActive(s, (l) =>
            updateChart(l, idx, (c) => ({ ...c, drawings: [...c.drawings, clone] })),
          );
          const history = pushChartHistory(s, layout.id, idx, drawings);
          return {
            ...next,
            selectedDrawingId: clone.id,
            selectedDrawingIds: [clone.id],
            ...history,
          };
        }),

      moveDrawing: (id, to, chartIndex) =>
        set((s) => {
          const layout = s.activeLayout();
          const idx = chartIndex ?? layout.activeChart;
          const drawings = layout.charts[idx]?.drawings ?? [];
          const from = drawings.findIndex((d) => d.id === id);
          if (from === -1) return s;
          const rest = drawings.filter((d) => d.id !== id);
          const at =
            to === "front"
              ? rest.length
              : to === "back"
                ? 0
                : to === "forward"
                  ? Math.min(rest.length, from + 1)
                  : Math.max(0, from - 1);
          const ordered = [...rest.slice(0, at), drawings[from]!, ...rest.slice(at)];
          const next = editActive(s, (l) => updateChart(l, idx, (c) => ({ ...c, drawings: ordered })));
          const history = pushChartHistory(s, layout.id, idx, drawings);
          return { ...next, ...history };
        }),

      clearIndicators: (chartIndex) =>
        set((s) => {
          const idx = chartIndex ?? s.activeLayout().activeChart;
          return editActive(s, (l) => updateChart(l, idx, (c) => ({ ...c, indicators: [] })));
        }),

      setEventOptions: (patch) =>
        set((s) => ({
          eventOptions: {
            ...s.eventOptions,
            ...patch,
            impacts: { ...s.eventOptions.impacts, ...patch.impacts },
          },
        })),
      setReplaySpeed: (speed) => set({ replaySpeed: speed }),

      sortLayouts: (by) =>
        set((s) => {
          const layouts = [...s.layouts].sort((a, b) =>
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
      // No shape change yet; the hook exists so a future bump has somewhere to land.
      migrate: (state) => state as PersistedState,
      storage: workspaceStorage,
      partialize: (s): PersistedState => ({
        layouts: s.layouts,
        appTheme: s.appTheme,
        density: s.density,
        activeLayoutId: s.activeLayoutId,
        magnet: s.magnet,
        crosshairSync: s.crosshairSync,
        replaySpeed: s.replaySpeed,
        favoriteTools: s.favoriteTools,
        drawingToolStyles: s.drawingToolStyles,
        stayInDrawingMode: s.stayInDrawingMode,
        lockAllDrawings: s.lockAllDrawings,
        pineScripts: s.pineScripts,
        eventOptions: s.eventOptions,
        chartTemplates: s.chartTemplates,
        alerts: s.alerts,
        // Live quotes go stale the moment they are saved, and the rolling
        // close history is rebuilt from the feed - neither is persisted.
        watchlist: s.watchlist.map((w) => ({ ...w, price: null, changePct: null })),
      }),
      merge: (persisted, current) => {
        const raw = (persisted ?? {}) as Record<string, unknown>;
        return {
          ...current,
          ...restoreWorkspace(persisted, current, defaultChartState(), getIndicator),
          appTheme: restoreAppTheme(raw.appTheme),
          density: isDensity(raw.density) ? raw.density : "compact",
          // Old blobs predate the key entirely; restorePineScripts turns that
          // (and any malformed entry) into a valid, possibly empty map.
          pineScripts: restorePineScripts(raw.pineScripts),
          eventOptions: restoreEventOptions(raw.eventOptions),
          chartTemplates: restoreTemplates(raw.chartTemplates),
          // Restore alerts, alertHistory, watchlist — they may be absent in
          // blobs written before this change; fall back to current state defaults.
          alerts: "alerts" in raw ? restoreAlerts(raw.alerts, current.alerts) : current.alerts,
          alertHistory:
            "alertHistory" in raw ? restoreAlertHistory(raw.alertHistory) : current.alertHistory,
          watchlist: "watchlist" in raw ? restoreWatchlist(raw.watchlist, current.watchlist) : current.watchlist,
          watchlistSymbolKey:
            "watchlist" in raw
              ? restoreWatchlist(raw.watchlist, current.watchlist).map((w) => w.symbol).join(",")
              : current.watchlist.map((w) => w.symbol).join(","),
          watchlistQuoteKey: watchlistQuoteKeys(
            "watchlist" in raw ? restoreWatchlist(raw.watchlist, current.watchlist) : current.watchlist,
          ),
          favoriteTools: restoreFavoriteTools(raw.favoriteTools, current.favoriteTools),
          drawingToolStyles: restoreToolStyles(raw.drawingToolStyles, current.drawingToolStyles),
          stayInDrawingMode:
            typeof raw.stayInDrawingMode === "boolean" ? raw.stayInDrawingMode : current.stayInDrawingMode,
          lockAllDrawings:
            typeof raw.lockAllDrawings === "boolean" ? raw.lockAllDrawings : current.lockAllDrawings,
        };
      },
    },
  ),
);

/** Catalogue grouped by family, memoized at module scope for the picker. */
export const INDICATOR_FAMILIES = (() => {
  const out: Record<string, IndicatorDef[]> = {};
  for (const def of catalog()) (out[def.family] ??= []).push(def);
  return out;
})();

export const THEME_OF = { dark: DARK_THEME, light: LIGHT_THEME, tokyo: TOKYO_THEME } as const;
