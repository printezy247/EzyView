import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PersistStorage, StorageValue } from "zustand/middleware";
import type { Candle } from "@ezyview/data-adapters";
import { evaluateAlert, pushHistory } from "@ezyview/data-adapters";
import type { AlertCondition, AlertFrequency, AlertHistory, PriceAlert } from "@ezyview/data-adapters";
import { DARK_THEME, LIGHT_THEME, TOKYO_THEME } from "@ezyview/chart-engine";
import { TOOL_ANCHORS, priceAt } from "@ezyview/drawing-tools";
import type { Drawing, DrawingStyle, DrawingToolId, MagnetMode } from "@ezyview/drawing-tools";
import { catalog, getIndicator } from "@ezyview/indicators";
import type { IndicatorDef } from "@ezyview/indicators";
import type { PinePlot, PineOrder, ScriptOptions } from "@ezyview/pine-transpiler";
import { DEFAULT_SYMBOL, stopTicking } from "./data";
import { DEFAULT_EVENT_OPTIONS, restoreEventOptions } from "./eventOptions";
import type { EventOptions } from "./eventOptions";
import { applyTemplate, restoreTemplates, templateFromChart } from "./chartTemplates";
import type { ChartTemplate } from "./chartTemplates";
import { pasteAt } from "./drawingClipboard";
import { activeChartOf, restoreWorkspace, setActiveChart, setGrid, updateChart } from "./layout";
import { withLinkedUpdate } from "./linkGroups";
import type { LinkPatch } from "./linkGroups";
import { isDensity, resolveAppTheme } from "./layout";
import type {
  ActiveIndicator,
  AppTheme,
  ChartState,
  ChartThemeName,
  Density,
  GridMode,
  Layout,
  PersistedWorkspace,
  ReplaySpeed,
} from "./layout";
import { readDetached } from "./windows";
import { isDataSourceChoice } from "./chartSource";
import type { EffectiveSource } from "./chartSource";

export type { ActiveIndicator, ChartState, GridMode, Layout } from "./layout";

/** One archived head of a Pine script; `savedAt` is epoch seconds. */
export interface PineScriptVersion {
  source: string;
  savedAt: number;
}

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
   * Archived previous sources, newest first, capped at 20. Absent on records
   * saved before versioning existed; restores are no-ops there.
   */
  versions?: PineScriptVersion[];
  /**
   * Scalar `input.*` values from the last successful run, keyed as the
   * runtime keys them (declaration order / `id` kwarg). Absent on records
   * saved before this snapshot existed; a failed run does not set it, so a
   * prior snapshot may remain.
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
  /**
   * Feed this row is quoted from. Absent means "follow the global feed", which
   * is how rows saved before sources existed keep working.
   */
  source?: EffectiveSource;
}

export const DEFAULT_WATCHLIST: WatchEntry[] = [
  { symbol: "BINANCE:BTCUSDT", ticker: "BTCUSDT", description: "Bitcoin / Tether", assetClass: "Crypto", precision: 2, price: null, changePct: null },
  { symbol: "BINANCE:ETHUSDT", ticker: "ETHUSDT", description: "Ethereum / Tether", assetClass: "Crypto", precision: 2, price: null, changePct: null },
  { symbol: "OANDA:XAUUSD", ticker: "XAUUSD", description: "Gold / US Dollar", assetClass: "Commodity", precision: 2, price: null, changePct: null },
  { symbol: "OANDA:EURUSD", ticker: "EURUSD", description: "Euro / US Dollar", assetClass: "Forex", precision: 4, price: null, changePct: null },
  { symbol: "OANDA:GBPUSD", ticker: "GBPUSD", description: "British Pound / US Dollar", assetClass: "Forex", precision: 4, price: null, changePct: null },
  { symbol: "NASDAQ:AAPL", ticker: "AAPL", description: "Apple Inc.", assetClass: "Stock", precision: 2, price: null, changePct: null },
  { symbol: "NASDAQ:NVDA", ticker: "NVDA", description: "NVIDIA Corp.", assetClass: "Stock", precision: 2, price: null, changePct: null },
  { symbol: "AMEX:SPY", ticker: "SPY", description: "SPDR S&P 500 ETF Trust", assetClass: "Index", precision: 2, price: null, changePct: null },
];

/** One key that changes when a row's feed or symbol changes, not on a tick. */
export function watchlistQuoteKeys(list: readonly WatchEntry[]): string {
  return list.map((w) => (w.source ? `${w.source}|${w.symbol}` : w.symbol)).join(",");
}

const LAYOUT_COLORS = ["#d91400", "#0ea600", "#f2a93b", "#4a90e2", "#9c27b0", "#00bcd4"];

/** How many superseded sources a script keeps in its version list. */
const MAX_PINE_VERSIONS = 20;

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
function pushUndo(stack: Drawing[][], item: Drawing[]): Drawing[][] {
  const next = [...stack, item.slice()];
  return next.length > MAX_DRAWING_UNDO ? next.slice(-MAX_DRAWING_UNDO) : next;
}

function pushChartHistory(
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
  /**
   * Colour theme for the shell (rails, toolbar, panels, dialogs). `auto`
   * follows the active chart's theme, which is what the app did before the
   * brand pass; `light`/`dark`/`tokyo` pin the chrome so a mixed-theme grid
   * stays readable.
   */
  appTheme: AppTheme;
  /** Pin or unpin the shell theme. */
  setAppTheme(theme: AppTheme): void;
  /** Table/chrome density; applied as `data-density` on the root. */
  density: Density;
  setDensity(density: Density): void;
  /** The theme the shell actually paints with (resolves `auto`). */
  shellTheme(): ChartThemeName;
  activeLayoutId: string;
  /** Currently armed drawing tool, or null when panning/selecting. */
  activeTool: DrawingToolId | null;
  /** Keep the tool armed after each completed drawing for rapid placement. */
  stayInDrawingMode: boolean;
  setStayInDrawingMode(on: boolean): void;
  /** Global lock: drawings stay visible but cannot be dragged. */
  lockAllDrawings: boolean;
  setLockAllDrawings(on: boolean): void;
  /** Global visibility: hides every drawing without touching its own flag. */
  hideAllDrawings: boolean;
  setHideAllDrawings(on: boolean): void;
  /** Click-a-drawing-to-delete navigation mode. */
  eraserMode: boolean;
  setEraserMode(on: boolean): void;
  /** Starred tools shown in the chart's quick-access pill. */
  favoriteTools: DrawingToolId[];
  toggleFavoriteTool(tool: DrawingToolId): void;
  /** Last-used style per tool, inherited by the next drawing of that tool. */
  drawingToolStyles: Partial<Record<DrawingToolId, DrawingStyle>>;
  rememberDrawingStyle(tool: DrawingToolId, style: DrawingStyle): void;
  /** Layout ids that have unsaved local edits. */
  dirty: Record<string, boolean>;
  /** All price alerts across layouts. */
  alerts: PriceAlert[];
  /** Per-alert rolling close history, newest last. */
  alertHistory: AlertHistory;
  /** Symbols tracked in the watchlist panel. */
  watchlist: WatchEntry[];
  /** Memoized comma-joined symbols for O(1) watchlist key comparison. */
  watchlistSymbolKey: string;
  /** Symbols paired with their feed, so a price tick does not restart polling. */
  watchlistQuoteKey: string;
  /** Saved Pine scripts, keyed by id. */
  pineScripts: Record<string, PineScriptRecord>;
  /** Replay cursor into the loaded history, or null when off. */
  replayBar: number | null;
  /** Drawing magnet: snaps placed anchors to the nearest candle's OHLC. */
  magnet: MagnetMode;
  /** Mirror the crosshair time across every cell of the active layout. */
  crosshairSync: boolean;
  /** Which chart events to draw (earnings, economic, impact levels). */
  eventOptions: EventOptions;
  /** Saved chart looks + indicators, applicable to any chart. */
  chartTemplates: ChartTemplate[];
  /** Last copied drawing (in memory only). */
  drawingClipboard: Drawing | null;
  /** Replay play speed (× 500 ms/bar). */
  replaySpeed: ReplaySpeed;

  activeLayout(): Layout;
  /** The focused chart cell of the active layout. */
  activeChart(): ChartState;
  setActiveLayout(id: string): void;
  /** Patch the focused chart cell. */
  updateActive(patch: Partial<ChartState>): void;
  /** Patch a specific chart cell by index in the active layout. */
  updateChart(index: number, patch: Partial<ChartState>): void;
  /**
   * Set the focused cell's symbol, and every cell in its link group. When the
   * symbol belongs to a specific feed (an MT5 ticker, say), pass it so linked
   * cells switch with the symbol instead of asking the old feed for it.
   */
  setSymbol(symbol: string, source?: EffectiveSource): void;
  /** Set the focused cell's interval, and every cell in its link group. */
  setResolution(resolution: ChartState["resolution"]): void;
  /** Put the focused cell into a link group, or clear it with an empty name. */
  setLinkGroup(group: string): void;
  setGrid(grid: GridMode): void;
  setActiveChart(index: number): void;

  addLayout(): void;
  copyLayout(id: string): void;
  /** Add a parsed layout file as a new layout (fresh id/colour/date) and activate it. */
  importLayout(layout: Layout): void;
  deleteLayout(id: string): void;
  renameLayout(id: string, name: string): void;

  addIndicator(id: string): void;
  removeIndicator(uid: string): void;
  updateIndicatorParams(uid: string, params: Record<string, number | boolean | string>): void;

  /** Replace the drawings of the focused cell, or of cell `chartIndex`. */
  setDrawings(drawings: Drawing[], chartIndex?: number): void;
  /** Undo the last drawing change on the focused cell (or specified chartIndex). */
  undoDrawing(chartIndex?: number): void;
  /** Redo the last undone drawing change on the focused cell (or specified chartIndex). */
  redoDrawing(chartIndex?: number): void;
  /** Drawing undo stacks keyed by layoutId:chartIndex. */
  drawingUndoStacks: Record<string, Drawing[][]>;
  /** Drawing redo stacks keyed by layoutId:chartIndex. */
  drawingRedoStacks: Record<string, Drawing[][]>;
  /** Drawing edit history sequence across charts. */
  drawingHistoryOrder: { layoutId: string; chartIndex: number }[];
  /** Undo stack for the focused cell's drawings (not persisted). */
  drawingUndo: Drawing[][];
  /** Redo stack for the focused cell's drawings (not persisted). */
  drawingRedo: Drawing[][];
  /** Edit a drawing of the focused cell (or chartIndex); pushes one undo entry. */
  updateDrawing(id: string, patch: Partial<Drawing>, chartIndex?: number): void;
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
  setEventOptions(patch: Partial<Omit<EventOptions, "impacts">> & { impacts?: Partial<EventOptions["impacts"]> }): void;
  setReplaySpeed(speed: ReplaySpeed): void;
  /** Save the focused chart's look and indicators as a named template. */
  saveChartTemplate(name: string): void;
  applyChartTemplate(id: string): void;
  deleteChartTemplate(id: string): void;
  /** Copy the selected drawing (or `id`) into the clipboard. */
  copyDrawing(id?: string): void;
  /** Paste the clipboard drawing with its first anchor at `at`, selected, undoable. */
  pasteDrawing(at: { time: number; price: number }): void;
  /** Clone the selected drawing (or `id`) with a small price offset; selects the clone. */
  duplicateDrawing(id?: string): void;
  /** Move a drawing forward/backward in the paint order. */
  moveDrawing(id: string, to: "front" | "back" | "forward" | "backward", chartIndex?: number): void;
  /** Remove every indicator from the focused chart (rail's remove menu). */
  clearIndicators(chartIndex?: number): void;
  /** Reorder the layout tabs alphabetically, or oldest-first. */
  sortLayouts(by: "name" | "date"): void;

  addAlert(
    symbol: string,
    condition: AlertCondition,
    frequency: AlertFrequency,
    message: string,
    drawingId?: string,
    levelKey?: string,
  ): void;
  removeAlert(id: string): void;
  /** Fold one candle into every matching alert; returns ids that just fired. */
  applyCandle(symbol: string, candle: Candle, barClosed: boolean): string[];

  addToWatchlist(entry: WatchEntry): void;
  removeFromWatchlist(symbol: string): void;
  updateWatchPrice(symbol: string, price: number, changePct: number | null): void;

  /** Save a Pine script's source under its name; a changed source archives the old head. */
  savePineScript(id: string, name: string, source: string): void;
  /** Replace a script's source with version `index` (newest-first); the list is kept. */
  restorePineScriptVersion(id: string, index: number): void;
  deletePineScript(id: string): void;
  /** Result of the last script run, for the tester panel. */
  setPineResult(id: string, result: PineScriptRecord | null): void;
  /** Bar-by-bar replay cursor, or null when not replaying. */
  setReplay(barIndex: number | null): void;

  markSaved(id: string): void;
}

/** Apply `fn` to the active layout and flag it as edited. */
function editActive(s: WorkspaceStore, fn: (layout: Layout) => Layout): Partial<WorkspaceStore> {
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
function editChart(s: WorkspaceStore, fn: (chart: ChartState) => ChartState): Partial<WorkspaceStore> {
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
function applyToGroup(layout: Layout, patch: LinkPatch): Layout {
  const charts = withLinkedUpdate(layout.charts, layout.activeChart, patch);
  if (charts === layout.charts) return layout;
  return { ...layout, charts };
}

/**
 * Keep price alerts bound to a drawing in step with its geometry: moving
 * the anchor or line re-arms the alert's level. Only price-carrying conditions can
 * follow; channel/moving conditions are left alone.
 */
function syncBoundAlert(
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
function restoreAppTheme(raw: unknown): AppTheme {
  return raw === "dark" || raw === "light" || raw === "tokyo" ? raw : "auto";
}

const initial = [defaultLayout(0)];

/** Write one workspace blob, surviving a full disk. */
function writeWorkspace(name: string, value: string): void {
  try {
    localStorage.setItem(name, value);
  } catch {
    // Quota exceeded. The corrupt-payload backup is the first thing to go.
    try {
      localStorage.removeItem(`${name}.corrupt`);
      localStorage.setItem(name, value);
    } catch {
      // Still full: the workspace stays in memory and is lost on quit.
    }
  }
}

/** The slice of the workspace that reaches localStorage. */
type PersistedState = PersistedWorkspace & {
  pineScripts: Record<string, PineScriptRecord>;
  eventOptions: EventOptions;
  chartTemplates: ChartTemplate[];
  appTheme: AppTheme;
  density: Density;
  alerts: PriceAlert[];
  watchlist: WatchEntry[];
  favoriteTools: DrawingToolId[];
  drawingToolStyles: Partial<Record<DrawingToolId, DrawingStyle>>;
  stayInDrawingMode: boolean;
  lockAllDrawings: boolean;
};

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let queued: { name: string; value: StorageValue<PersistedState> } | null = null;

function flushWorkspace(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!queued) return;
  const { name, value } = queued;
  queued = null;
  try {
    writeWorkspace(name, JSON.stringify(value));
  } catch {
    // A value that cannot be serialised must not take the app down.
  }
}

if (typeof window !== "undefined") window.addEventListener("pagehide", flushWorkspace);

/**
 * Workspace persistence that survives the two ways localStorage hurts:
 * a truncated payload (which used to wipe every layout, drawing and script)
 * and a full disk (which used to throw out of the store's `set`).
 *
 * The state is serialised inside the debounce, not before it: a drawing
 * drag updates the store on every pointer move, and serialising the whole
 * workspace each time was the app's biggest source of jank.
 */
const workspaceStorage: PersistStorage<PersistedState> = {
  getItem: (name) => {
    if (typeof localStorage === "undefined") return null;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(name);
    } catch {
      return null;
    }
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(raw) as StorageValue<PersistedState>;
      if (!parsed || typeof parsed !== "object" || !parsed.state) return null;
      return parsed;
    } catch {
      // Corrupt payload: keep a copy for support and start from defaults
      // instead of letting the next write destroy the good data.
      try {
        localStorage.setItem(`${name}.corrupt`, raw);
      } catch {
        // ignore
      }
      return null;
    }
  },
  setItem: (name, value) => {
    if (typeof localStorage === "undefined") return;
    if (readDetached(globalThis.location?.search ?? "")) return; // detached windows never write
    queued = { name, value };
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(flushWorkspace, 400);
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};

export const useWorkspace = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
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
      alerts: [],
      alertHistory: {},
      watchlist: DEFAULT_WATCHLIST,
      watchlistSymbolKey: DEFAULT_WATCHLIST.map((w) => w.symbol).join(","),
      watchlistQuoteKey: watchlistQuoteKeys(DEFAULT_WATCHLIST),
      pineScripts: {},
      replayBar: null,
      magnet: "off",
      crosshairSync: false,
      eventOptions: DEFAULT_EVENT_OPTIONS,
      chartTemplates: [],
      drawingClipboard: null,
      replaySpeed: 1,
      drawingUndoStacks: {},
      drawingRedoStacks: {},
      drawingHistoryOrder: [],
      drawingUndo: [],
      drawingRedo: [],
      selectedDrawingId: null,

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
          const selection = s.selectedDrawingId === id ? null : s.selectedDrawingId;
          if (drawings.length === prev.length) {
            return selection === s.selectedDrawingId ? s : { selectedDrawingId: selection };
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

      selectDrawing: (id) => set({ selectedDrawingId: id }),

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

      addAlert: (symbol, condition, frequency, message, drawingId, levelKey) =>
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
              ...(levelKey ? { levelKey } : {}),
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
          let currentAlert = alert;
          if (alert.drawingId && "value" in alert.condition) {
            const chart = get().activeChart();
            const drawing = chart.drawings.find((d) => d.id === alert.drawingId);
            if (drawing) {
              const dynamicPrice = priceAt(drawing, candle.time, alert.levelKey);
              if (dynamicPrice !== null && Number.isFinite(dynamicPrice) && dynamicPrice !== alert.condition.value) {
                currentAlert = { ...alert, condition: { ...alert.condition, value: dynamicPrice } };
              }
            }
          }
          const closes = history[alert.id] ?? [];
          const next = evaluateAlert(currentAlert, closes, candle, barClosed);
          if (barClosed || closes.length === 0) {
            history = pushHistory(history, alert.id, candle.close);
          } else {
            history = { ...history, [alert.id]: [...closes.slice(0, -1), candle.close] };
          }
          if (!next) return alert;
          if (next.state === "triggered" && (alert.state !== "triggered" || next.triggeredAt !== alert.triggeredAt)) {
            fired.push(next.id);
          }
          return next;
        });
        // Keep the array identity when nothing fired or changed, so subscribers
        // (the MCP snapshot sync) are not woken by every quote poll.
        const prev = get().alerts;
        const alertsSame = alerts.every((a, i) => a === prev[i]);
        const historyChanged = !historySame(get().alertHistory, history);
        if (!alertsSame || historyChanged) {
          set({ alerts: alertsSame ? prev : alerts, alertHistory: history });
        }
        return fired;
      },

      addToWatchlist: (entry) =>
        set((s) => {
          if (s.watchlist.some((w) => w.symbol === entry.symbol)) return s;
          const next = [...s.watchlist, entry];
          return {
            watchlist: next,
            watchlistSymbolKey: next.map((w) => w.symbol).join(","),
            watchlistQuoteKey: watchlistQuoteKeys(next),
          };
        }),

      removeFromWatchlist: (symbol) =>
        set((s) => {
          const next = s.watchlist.filter((w) => w.symbol !== symbol);
          // Release the demo ticker when no chart needs the symbol any more.
          if (!next.some((w) => w.symbol === symbol) && !s.layouts.some((l) => l.charts.some((c) => c.symbol === symbol))) {
            stopTicking(symbol);
          }
          return {
            watchlist: next,
            watchlistSymbolKey: next.map((w) => w.symbol).join(","),
            watchlistQuoteKey: watchlistQuoteKeys(next),
          };
        }),

      updateWatchPrice: (symbol, price, changePct) =>
        set((s) => {
          const current = s.watchlist.find((w) => w.symbol === symbol);
          if (!current || (current.price === price && current.changePct === changePct)) return s;
          return {
            watchlist: s.watchlist.map((w) => (w.symbol === symbol ? { ...w, price, changePct } : w)),
          };
        }),

      savePineScript: (id, name, source) =>
        set((s) => {
          const existing = s.pineScripts[id];
          // Re-saving the same source must not spam the history: only a
          // changed head archives the one it replaces (newest first, capped).
          const versions =
            existing && existing.source !== source
              ? archiveVersion(existing.versions, existing.source)
              : existing?.versions;
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
                ...(versions !== undefined ? { versions } : {}),
              },
            },
          };
        }),

      restorePineScriptVersion: (id, index) =>
        set((s) => {
          const existing = s.pineScripts[id];
          const entry = existing?.versions?.[index];
          // Unknown id, out-of-range index, or a pre-versioning record: no-op.
          if (!existing || !entry) return s;
          return {
            pineScripts: {
              ...s.pineScripts,
              [id]: {
                ...existing,
                // The current head exists nowhere else — archive it before the
                // restore overwrites it (same prepend+cap as a save).
                ...(existing.source !== entry.source
                  ? { versions: archiveVersion(existing.versions, existing.source) }
                  : {}),
                source: entry.source,
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
          // A run writes the live buffer into the record; archive the head it
          // replaces so a later same-source save cannot destroy it.
          const versions =
            existing && existing.source !== result.source
              ? archiveVersion(existing.versions, existing.source)
              : existing?.versions;
          return {
            pineScripts: {
              ...s.pineScripts,
              [id]: {
                ...existing,
                ...result,
                id,
                // Spread so a pre-versioning record stays without the key.
                ...(versions !== undefined ? { versions } : {}),
              },
            },
          };
        }),

      setReplay: (barIndex) => set({ replayBar: barIndex }),

      setCrosshairSync: (on) => set({ crosshairSync: on }),
      saveChartTemplate: (name) =>
        set((s) => ({
          chartTemplates: [...s.chartTemplates, templateFromChart(activeChartOf(s.activeLayout()), name, uid())].slice(-50),
        })),

      applyChartTemplate: (id) => {
        const template = get().chartTemplates.find((t) => t.id === id);
        if (!template) return;
        set((s) => editChart(s, (c) => applyTemplate(c, template, getIndicator, uid)));
      },

      deleteChartTemplate: (id) => set((s) => ({ chartTemplates: s.chartTemplates.filter((t) => t.id !== id) })),

      copyDrawing: (id) => {
        const s = get();
        const target = id ?? s.selectedDrawingId;
        const drawing = activeChartOf(s.activeLayout()).drawings.find((d) => d.id === target);
        if (drawing) set({ drawingClipboard: structuredClone(drawing) });
      },

      pasteDrawing: (at) => {
        const s = get();
        if (!s.drawingClipboard) return;
        const pasted = pasteAt(s.drawingClipboard, at, uid());
        s.setDrawings([...activeChartOf(s.activeLayout()).drawings, pasted]);
        set({ selectedDrawingId: pasted.id });
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

/** Only tools the app knows can be favorited; duplicates collapse. */
function restoreFavoriteTools(raw: unknown, fallback: DrawingToolId[]): DrawingToolId[] {
  if (!Array.isArray(raw)) return fallback;
  const seen = new Set<DrawingToolId>();
  for (const value of raw) {
    if (typeof value !== "string" || !(value in TOOL_ANCHORS)) continue;
    seen.add(value as DrawingToolId);
  }
  return [...seen].slice(0, 24);
}

/**
 * A tool's remembered style must be a usable drawing style; anything else is
 * dropped rather than poisoning every future drawing of that tool.
 */
function restoreToolStyles(
  raw: unknown,
  fallback: Partial<Record<DrawingToolId, DrawingStyle>>,
): Partial<Record<DrawingToolId, DrawingStyle>> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return fallback;
  const out: Partial<Record<DrawingToolId, DrawingStyle>> = {};
  for (const [tool, style] of Object.entries(raw)) {
    if (!(tool in TOOL_ANCHORS)) continue;
    if (typeof style !== "object" || style === null) continue;
    const s = style as Partial<DrawingStyle>;
    if (typeof s.color !== "string" || typeof s.width !== "number" || typeof s.lineStyle !== "string") continue;
    out[tool as DrawingToolId] = s as DrawingStyle;
  }
  return out;
}

const ALERT_STATES = new Set(["armed", "triggered"]);
const ALERT_FREQUENCIES = new Set(["once", "once_per_bar", "once_per_bar_close"]);

/** Keep only well-formed alerts; a bad state/frequency would never evaluate right. */
/** Same keys, and each key's closes equal element by element. */
function historySame(a: AlertHistory, b: AlertHistory): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => {
    const x = a[k];
    const y = b[k];
    return y !== undefined && x !== undefined && x.length === y.length && x.every((n, i) => n === y[i]);
  });
}

export function restoreAlerts(raw: unknown, fallback: PriceAlert[]): PriceAlert[] {
  if (!Array.isArray(raw)) return fallback;
  return raw.filter((a): a is PriceAlert => {
    if (typeof a !== "object" || a === null) return false;
    const x = a as Partial<PriceAlert>;
    return (
      typeof x.id === "string" &&
      typeof x.symbol === "string" &&
      typeof x.condition === "object" &&
      x.condition !== null &&
      typeof x.state === "string" &&
      ALERT_STATES.has(x.state) &&
      typeof x.frequency === "string" &&
      ALERT_FREQUENCIES.has(x.frequency)
    );
  });
}

function restoreAlertHistory(raw: unknown): AlertHistory {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: AlertHistory = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k === "__proto__") continue;
    if (Array.isArray(v)) {
      out[k] = v.filter((n): n is number => typeof n === "number" && Number.isFinite(n)).slice(-200);
    }
  }
  return out;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function restoreWatchlist(raw: unknown, fallback: WatchEntry[]): WatchEntry[] {
  const safeFallback = fallback.length > 0 ? fallback : DEFAULT_WATCHLIST;
  if (!Array.isArray(raw)) return safeFallback;
  const out: WatchEntry[] = [];
  for (const w of raw) {
    if (typeof w !== "object" || w === null) continue;
    const x = w as Partial<Record<keyof WatchEntry, unknown>>;
    if (typeof x.symbol !== "string" || typeof x.ticker !== "string") continue;
    // `auto` describes a chart, not a stored row: rows saved with it (or with
    // junk) keep following the global feed rather than pinning a stale venue.
    const source = isDataSourceChoice(x.source) && x.source !== "auto" ? x.source : undefined;
    out.push({
      symbol: x.symbol,
      ticker: x.ticker,
      description: typeof x.description === "string" ? x.description : x.ticker,
      assetClass: typeof x.assetClass === "string" ? x.assetClass : "",
      precision: typeof x.precision === "number" && Number.isFinite(x.precision) ? Math.max(0, Math.min(10, Math.trunc(x.precision))) : 2,
      price: num(x.price),
      changePct: num(x.changePct),
      ...(source ? { source } : {}),
    });
  }
  return out.length > 0 ? out : safeFallback;
}

/** Prepend a superseded head to the archive: newest first, capped. */
function archiveVersion(
  versions: PineScriptVersion[] | undefined,
  prevSource: string,
): PineScriptVersion[] {
  return [
    { source: prevSource, savedAt: Math.floor(Date.now() / 1000) },
    ...(versions ?? []),
  ].slice(0, MAX_PINE_VERSIONS);
}

/**
 * Rebuild the saved-scripts map from a storage blob. Blobs written before
 * versioning lack `versions`/`inputs` (left absent, not invented), and any
 * entry missing the required id/name/source strings is dropped rather than
 * throwing — a corrupt save must never brick startup.
 */
function restorePineScripts(raw: unknown): Record<string, PineScriptRecord> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, PineScriptRecord> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    // A literal "__proto__" key on `out` would fire Object.prototype's
    // inherited setter and retarget the map's prototype instead of creating
    // an own key — drop it like any other invalid entry.
    if (id === "__proto__") continue;
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    const rec = value as Partial<PineScriptRecord>;
    if (typeof rec.id !== "string" || typeof rec.name !== "string" || typeof rec.source !== "string") continue;
    const versions = Array.isArray(rec.versions)
      ? rec.versions.filter(
          (v): v is PineScriptVersion =>
            typeof v === "object" && v !== null && typeof v.source === "string" && typeof v.savedAt === "number",
        )
      : undefined;
    out[id] = {
      id: rec.id,
      name: rec.name,
      source: rec.source,
      options:
        typeof rec.options === "object" && rec.options !== null && !Array.isArray(rec.options)
          ? rec.options
          : null,
      plots: Array.isArray(rec.plots) ? rec.plots : [],
      orders: Array.isArray(rec.orders) ? rec.orders : [],
      error: typeof rec.error === "string" ? rec.error : null,
      ...(rec.inputs !== undefined && typeof rec.inputs === "object" && rec.inputs !== null
        ? { inputs: rec.inputs }
        : {}),
      ...(versions !== undefined ? { versions } : {}),
    };
  }
  return out;
}

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
