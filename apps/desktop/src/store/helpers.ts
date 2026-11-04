import type { Drawing } from "@ezyview/drawing-tools";
import { priceAt } from "@ezyview/drawing-tools";
import { DEFAULT_SYMBOL } from "../data";
import { updateChart } from "../layout";
import type { AppTheme, ChartState, Layout } from "../layout";
import { withLinkedUpdate } from "../linkGroups";
import type { LinkPatch } from "../linkGroups";
import type { WorkspaceStore } from "./types";




/** Deep copy for "Duplicate layout"; indicator defs are shared, not cloned, as they hold functions. */
export const LAYOUT_COLORS = ["#d91400", "#0ea600", "#f2a93b", "#4a90e2", "#9c27b0", "#00bcd4"];
export const COMPARE_COLORS = ["#f2a93b", "#9c27b0", "#26a69a", "#ef5350", "#42a5f5", "#ffca28"];

/**
 * Maximum undo/redo drawing states kept in memory per layout.
 */
const MAX_DRAWING_UNDO = 30;

/**
 * Drawings are edited immutably - every change makes a new drawing object and
 * a new array - so a shallow copy is a complete snapshot. The deep clone this
 * used to make copied every drawing on every single edit and kept 30 copies
 * alive.
 */
export function pushUndo(stack: Drawing[][], item: Drawing[]): Drawing[][] {
  const next = [...stack, item.slice()];
  return next.length > MAX_DRAWING_UNDO ? next.slice(-MAX_DRAWING_UNDO) : next;
}

export function pushChartHistory(
  s: WorkspaceStore,
  layoutId: string,
  chartIndex: number,
  snapshot: readonly Drawing[],
): {
  drawingUndoStacks: Record<string, Drawing[][]>;
  drawingRedoStacks: Record<string, Drawing[][]>;
  drawingHistoryOrder: { layoutId: string; chartIndex: number }[];
  drawingUndo: Drawing[][];
  drawingRedo: Drawing[][];
} {
  const key = `${layoutId}:${chartIndex}`;
  const currentUndo = s.drawingUndoStacks[key] ?? (key === `${s.activeLayout().id}:${s.activeLayout().activeChart}` && s.drawingUndo.length > 0 ? s.drawingUndo : []);
  const nextUndo = pushUndo(currentUndo, [...snapshot]);
  const nextUndoStacks = { ...s.drawingUndoStacks, [key]: nextUndo };
  const nextRedoStacks = { ...s.drawingRedoStacks, [key]: [] };
  const nextOrder = [
    ...s.drawingHistoryOrder.filter((o) => !(o.layoutId === layoutId && o.chartIndex === chartIndex)),
    { layoutId, chartIndex },
  ];

  const layout = s.activeLayout();
  const isActive = layout.id === layoutId && layout.activeChart === chartIndex;

  return {
    drawingUndoStacks: nextUndoStacks,
    drawingRedoStacks: nextRedoStacks,
    drawingHistoryOrder: nextOrder,
    drawingUndo: isActive ? nextUndo : (nextUndoStacks[`${layout.id}:${layout.activeChart}`] ?? []),
    drawingRedo: isActive ? [] : (nextRedoStacks[`${layout.id}:${layout.activeChart}`] ?? []),
  };
}

export const uid = (): string => Math.random().toString(36).slice(2, 10);

export function defaultChartState(): ChartState {
  return {
    symbol: DEFAULT_SYMBOL,
    resolution: "1D",
    chartType: "candles",
    showVolume: true,
    showVolumeProfile: false,
    showSessionBreaks: true,
    showGrid: true,
    theme: "dark",
    indicators: [],
    drawings: [],
  };
}

export function defaultLayout(index: number): Layout {
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

/** Apply `fn` to the active layout and flag it as edited. */
export function editActive(s: WorkspaceStore, fn: (layout: Layout) => Layout): Partial<WorkspaceStore> {
  const current = s.layouts.find((l) => l.id === s.activeLayoutId);
  if (!current) return {};
  const updated = fn(current);
  if (updated === current) return {};
  return {
    layouts: s.layouts.map((l) => (l.id === s.activeLayoutId ? updated : l)),
    dirty: { ...s.dirty, [s.activeLayoutId]: true },
  };
}

/** Apply `fn` to the focused chart cell of the active layout. */
export function editChart(s: WorkspaceStore, fn: (chart: ChartState) => ChartState): Partial<WorkspaceStore> {
  return editActive(s, (l) => updateChart(l, l.activeChart, fn));
}

/**
 * Apply a linked change — symbol or interval — to the focused cell and to
 * every cell in its link group.
 *
 * Only the linked fields travel. A cell's theme, watermark or volume setting
 * stays its own, because "these two charts show the same thing" is not
 * "these two charts are configured identically".
 */
export function applyToGroup(layout: Layout, patch: LinkPatch): Layout {
  const charts = withLinkedUpdate(layout.charts, layout.activeChart, patch);
  if (charts === layout.charts) return layout;
  return { ...layout, charts };
}

/**
 * Keep price alerts bound to a drawing in step with its geometry: moving
 * the anchor or line re-arms the alert's level. Only price-carrying conditions can
 * follow; channel/moving conditions are left alone.
 */
export function syncBoundAlert(
  s: Partial<WorkspaceStore>,
  drawingId: string,
  before: Drawing,
  patch: Partial<Drawing>,
): Partial<WorkspaceStore> {
  if (!s.alerts) return s;
  const boundAlerts = s.alerts.filter((a) => a.drawingId === drawingId);
  if (boundAlerts.length === 0) return s;

  const updatedDrawing: Drawing = { ...before, ...patch };
  return {
    ...s,
    alerts: s.alerts.map((a) => {
      if (a.drawingId !== drawingId || !("value" in a.condition)) return a;
      const evalTime = a.lastBarTime ?? updatedDrawing.points[0]?.time ?? Date.now() / 1000;
      const newPrice = priceAt(updatedDrawing, evalTime, a.levelKey) ?? updatedDrawing.points[0]?.price;
      if (newPrice === undefined || !Number.isFinite(newPrice)) return a;
      return { ...a, condition: { ...a.condition, value: newPrice } };
    }),
  };
}

/** Old saves predate the app theme; anything unknown means "follow the chart". */
export function restoreAppTheme(raw: unknown): AppTheme {
  return raw === "dark" || raw === "light" || raw === "tokyo" ? raw : "auto";
}

export const initial = [defaultLayout(0)];

/** Deep copy for "Duplicate layout"; indicator defs are shared, not cloned, as they hold functions. */
export function structuredCloneLayout(layout: Layout): Layout {
  return {
    ...layout,
    charts: layout.charts.map((c) => ({
      ...c,
      indicators: c.indicators.map((i) => ({ ...i, params: { ...i.params } })),
      drawings: structuredClone(c.drawings),
    })),
  };
}
