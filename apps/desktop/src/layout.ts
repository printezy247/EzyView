import type { Resolution } from "@ezyview/data-adapters";
import type { ChartType } from "@ezyview/chart-engine";
import type { Drawing, MagnetMode } from "@ezyview/drawing-tools";
import type { IndicatorDef } from "@ezyview/indicators";

/** A live indicator on the chart, with its resolved parameters. */
export interface ActiveIndicator {
  uid: string;
  def: IndicatorDef;
  params: Record<string, number | boolean | string>;
  colorIndex: number;
  /** Kept on the chart but not drawn. */
  hidden?: boolean;
  /** User label shown in the object tree; falls back to the indicator name. */
  name?: string;
}

/** Crosshair interaction style. */
export type CrosshairModeName = "normal" | "magnet" | "hidden";

/** Named app/chart themes. Tokyo Night ships free. */
export type ChartThemeName = "dark" | "light" | "tokyo";

/**
 * App-chrome theme. `auto` follows the focused chart's theme (the behaviour
 * before the brand pass); anything else pins the shell.
 */
export type AppTheme = "auto" | ChartThemeName;

/** UI density. `compact` is the default terminal layout; `comfortable` adds a
 * row's worth of breathing room for long table reading. */
export type Density = "compact" | "comfortable";

export const DENSITIES: readonly Density[] = ["compact", "comfortable"] as const;

export function isDensity(v: unknown): v is Density {
  return v === "compact" || v === "comfortable";
}

/** The theme the shell should paint with, given the setting and the chart. */
export function resolveAppTheme(appTheme: AppTheme, chartTheme: ChartThemeName): ChartThemeName {
  return appTheme === "auto" ? chartTheme : appTheme;
}

/** Right price-scale rendering. */
export type PriceScaleModeName = "normal" | "log" | "percentage";

/** Everything the user can change about one chart cell. */
export interface ChartState {
  symbol: string;
  resolution: Resolution;
  chartType: ChartType;
  showVolume: boolean;
  /** Optional so layouts saved before it existed still load. */
  showVolumeProfile?: boolean;
  /** Renko/P&F box and Kagi reversal size; absent or null sizes it from the ATR. */
  boxSize?: number | null;
  showGrid: boolean;
  theme: ChartThemeName;
  indicators: ActiveIndicator[];
  drawings: Drawing[];
  /** Absent = normal. Magnet snaps the crosshair to bar OHLC. */
  crosshairMode?: CrosshairModeName;
  /** Absent = normal. Log and percentage change the right scale. */
  priceScale?: PriceScaleModeName;
  /** Flip the right price scale upside-down. */
  invertScale?: boolean;
  /** IANA zone for the time axis; absent or empty = exchange/local. */
  timezone?: string;
  /** Draw the symbol/interval watermark behind the candles. */
  watermark?: boolean;
  /**
   * Wash bars that fall outside the symbol's trading session. Optional so
   * layouts saved before it existed still load; absent means on, because it is
   * the kind of context a chart is harder to read without.
   */
  showSessionBreaks?: boolean;
  /**
   * Link group name. Cells in the same group share their symbol, interval and
   * crosshair. Absent or blank = the cell is on its own.
   */
  linkGroup?: string;
}

/** How a layout splits its chart area. */
export type GridMode = "1" | "2h" | "2v" | "4" | "6" | "8" | "9";

export const GRID_MODES: readonly { id: GridMode; label: string; cells: number }[] = [
  { id: "1", label: "Single chart", cells: 1 },
  { id: "2h", label: "2 charts side by side", cells: 2 },
  { id: "2v", label: "2 charts stacked", cells: 2 },
  { id: "4", label: "4 charts (2 × 2)", cells: 4 },
  { id: "6", label: "6 charts (3 × 2)", cells: 6 },
  { id: "8", label: "8 charts (4 × 2)", cells: 8 },
  { id: "9", label: "9 charts (3 × 3)", cells: 9 },
];

export const cellCount = (grid: GridMode): number => GRID_MODES.find((g) => g.id === grid)?.cells ?? 1;

/**
 * A named, restorable workspace. Tabs in the tab bar map 1:1 to layouts; each
 * layout holds up to four chart cells with their own symbol and interval.
 */
export interface Layout {
  id: string;
  name: string;
  color: string;
  grid: GridMode;
  /** Creation timestamp for date-sorting layout tabs; absent on legacy saves. */
  createdAt?: number;
  /**
   * Chart cells. May hold more entries than the grid shows, so shrinking to a
   * single chart and back restores the cells you had.
   */
  charts: ChartState[];
  /** Index of the cell the toolbar and drawing tools act on. */
  activeChart: number;
}

export function activeChartOf(layout: Layout): ChartState {
  return layout.charts[layout.activeChart] ?? layout.charts[0]!;
}

/** A fresh cell that looks like `from` but carries no studies or drawings. */
function blankCellLike(from: ChartState): ChartState {
  return { ...from, indicators: [], drawings: [] };
}

/** Switch the grid; adds cells as needed and keeps the active cell on screen. */
export function setGrid(layout: Layout, grid: GridMode): Layout {
  const n = cellCount(grid);
  const charts = [...layout.charts];
  const template = activeChartOf(layout);
  while (charts.length < n) charts.push(blankCellLike(template));
  return { ...layout, grid, charts, activeChart: Math.min(layout.activeChart, n - 1) };
}

/** Focus a visible cell; out-of-range indices are ignored. */
export function setActiveChart(layout: Layout, index: number): Layout {
  if (!Number.isInteger(index) || index < 0 || index >= cellCount(layout.grid)) return layout;
  if (index === layout.activeChart) return layout;
  return { ...layout, activeChart: index };
}

/** Apply `fn` to one cell, leaving the rest untouched. */
export function updateChart(layout: Layout, index: number, fn: (chart: ChartState) => ChartState): Layout {
  if (index < 0 || index >= layout.charts.length) return layout;
  return { ...layout, charts: layout.charts.map((c, i) => (i === index ? fn(c) : c)) };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const GRID_IDS = new Set<string>(GRID_MODES.map((g) => g.id));

/**
 * Rebuild one chart cell from storage. Indicator definitions carry their
 * compute function, which JSON cannot hold, so each is looked up again by id;
 * unknown ids are dropped.
 */
function restoreChart(raw: unknown, fallback: ChartState, resolveDef: (id: string) => IndicatorDef | null | undefined): ChartState {
  if (!isObject(raw)) return { ...fallback };
  const chart = { ...fallback, ...raw } as ChartState;
  const indicators: ActiveIndicator[] = [];
  for (const item of Array.isArray(raw.indicators) ? raw.indicators : []) {
    if (!isObject(item) || !isObject(item.def) || typeof item.def.id !== "string") continue;
    const def = resolveDef(item.def.id);
    if (def) indicators.push({ ...(item as unknown as ActiveIndicator), def });
  }
  return {
    ...chart,
    indicators,
    drawings: Array.isArray(raw.drawings) ? (raw.drawings as Drawing[]) : [],
  };
}

/** Rebuild a layout from storage, or null when it is unusable. */
export function restoreLayout(
  raw: unknown,
  fallback: ChartState,
  resolveDef: (id: string) => IndicatorDef | null | undefined,
): Layout | null {
  if (!isObject(raw) || typeof raw.id !== "string") return null;
  const charts = (Array.isArray(raw.charts) ? raw.charts : []).map((c) => restoreChart(c, fallback, resolveDef));
  if (charts.length === 0) return null;
  const grid: GridMode = typeof raw.grid === "string" && GRID_IDS.has(raw.grid) ? (raw.grid as GridMode) : "1";
  const sized = setGrid(
    {
      id: raw.id,
      name: typeof raw.name === "string" ? raw.name : "Layout",
      color: typeof raw.color === "string" ? raw.color : "#2962ff",
      grid: "1",
      charts,
      activeChart: 0,
      ...(typeof raw.createdAt === "number" ? { createdAt: raw.createdAt } : {}),
    },
    grid,
  );
  const active = typeof raw.activeChart === "number" ? raw.activeChart : 0;
  return setActiveChart(sized, active);
}

/** The workspace fields that survive a reload. */
export interface PersistedWorkspace {
  layouts: Layout[];
  activeLayoutId: string;
  magnet: MagnetMode;
  /** Mirror the crosshair across every cell of the active layout. Absent = off. */
  crosshairSync?: boolean;
  /** Replay play speed; absent = 1×. */
  replaySpeed?: ReplaySpeed;
}

/** Replay transport speed multipliers (× a 500 ms/bar base). */
export type ReplaySpeed = 0.1 | 0.5 | 1 | 2 | 3 | 5;

const MAGNET_IDS = new Set<string>(["off", "weak", "strong"]);
const REPLAY_SPEEDS = new Set<number>([0.1, 0.5, 1, 2, 3, 5]);

/**
 * Validate what came out of storage. Anything malformed falls back to
 * `current`, so a corrupt save can never leave the app without a chart.
 */
export function restoreWorkspace(
  raw: unknown,
  current: PersistedWorkspace,
  fallback: ChartState,
  resolveDef: (id: string) => IndicatorDef | null | undefined,
): PersistedWorkspace {
  if (!isObject(raw)) return current;
  const layouts = (Array.isArray(raw.layouts) ? raw.layouts : [])
    .map((l) => restoreLayout(l, fallback, resolveDef))
    .filter((l): l is Layout => l !== null);
  const magnet = typeof raw.magnet === "string" && MAGNET_IDS.has(raw.magnet) ? (raw.magnet as MagnetMode) : current.magnet;
  const crosshairSync = typeof raw.crosshairSync === "boolean" ? raw.crosshairSync : current.crosshairSync;
  const replaySpeed =
    typeof raw.replaySpeed === "number" && REPLAY_SPEEDS.has(raw.replaySpeed)
      ? (raw.replaySpeed as ReplaySpeed)
      : current.replaySpeed;
  if (layouts.length === 0) return { ...current, magnet, crosshairSync, replaySpeed };
  const activeLayoutId =
    typeof raw.activeLayoutId === "string" && layouts.some((l) => l.id === raw.activeLayoutId)
      ? raw.activeLayoutId
      : layouts[0]!.id;
  return { layouts, activeLayoutId, magnet, crosshairSync, replaySpeed };
}
