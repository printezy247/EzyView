import type { Candle } from "@ezyview/data-adapters";
import type { AlertCondition, AlertFrequency, AlertHistory, PriceAlert } from "@ezyview/data-adapters";
import type { Drawing, DrawingStyle, DrawingToolId, MagnetMode } from "@ezyview/drawing-tools";
import type { PineOrder, PinePlot, ScriptOptions } from "@ezyview/pine-transpiler";
import type { CompareMode } from "@ezyview/chart-engine";
import type { EffectiveSource } from "../chartSource";
import type { ChartTemplate } from "../chartTemplates";
import type { EventOptions } from "../eventOptions";
import type {
  ActiveIndicator,
  AppTheme,
  ChartState,
  ChartThemeName,
  CompareSymbol,
  Density,
  GridMode,
  Layout,
  ReplaySpeed,
} from "../layout";

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

export interface WorkspaceStore {
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
  /** Last copied drawings (in memory only); relative offsets are preserved. */
  drawingClipboard: Drawing[] | null;
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
  /** Overlay a secondary symbol on the focused chart. */
  addCompare(symbol: string, mode?: CompareMode): void;
  removeCompare(id: string): void;
  updateCompare(id: string, patch: Partial<CompareSymbol>): void;
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
  /** Full multi-selection. `selectedDrawingId` is the last/focused member. */
  selectedDrawingIds: string[];
  selectDrawing(id: string | null): void;
  /** Replace the selection (used by marquee, object tree and group actions). */
  setDrawingSelection(ids: readonly string[]): void;
  /** Shift+click: add/remove one drawing without clearing the rest. */
  toggleDrawingSelection(id: string): void;
  /** Select every visible, unlocked drawing on the focused chart. */
  selectAllDrawings(): void;
  /** Give the selected drawings one group id so they move/hide together. */
  groupSelectedDrawings(): void;
  /** Drop the group id from every selected drawing. */
  ungroupSelectedDrawings(): void;
  /** Patch every selected drawing in one undo step. */
  updateSelectedDrawings(patch: Partial<Drawing>): void;
  /** Patch an explicit id set (group row actions) in one undo step. */
  updateDrawings(ids: readonly string[], patch: Partial<Drawing>, chartIndex?: number): void;
  /** Move the selection by chart-space deltas (keyboard nudge). */
  nudgeSelectedDrawings(dTime: number, dPrice: number): void;
  /** Delete explicit ids (group row actions) in one undo step. */
  deleteDrawings(ids: readonly string[]): void;
  deleteSelectedDrawings(): void;
  duplicateSelectedDrawings(): void;
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
  /** Silence an alert until an epoch-second time (15m/1h/1d presets). */
  snoozeAlert(id: string, until: number): void;
  /** Set or clear an alert's expiry time in epoch seconds. */
  setAlertExpiry(id: string, at?: number): void;
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
