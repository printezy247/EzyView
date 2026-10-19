import { create } from "zustand";
import type { Candle, Resolution } from "@ezyview/data-adapters";
import { evaluateAlert, pushHistory } from "@ezyview/data-adapters";
import type { AlertCondition, AlertFrequency, AlertHistory, PriceAlert } from "@ezyview/data-adapters";
import type { ChartType } from "@ezyview/chart-engine";
import { DARK_THEME, LIGHT_THEME } from "@ezyview/chart-engine";
import type { Drawing, DrawingToolId } from "@ezyview/drawing-tools";
import { catalog, getIndicator } from "@ezyview/indicators";
import type { IndicatorDef } from "@ezyview/indicators";
import { DEFAULT_SYMBOL } from "./data";

/** A live indicator on the chart, with its resolved parameters. */
export interface ActiveIndicator {
  uid: string;
  def: IndicatorDef;
  params: Record<string, number | boolean | string>;
  colorIndex: number;
}

/** Everything the user can change about one chart, saved per layout. */
export interface ChartState {
  symbol: string;
  resolution: Resolution;
  chartType: ChartType;
  showVolume: boolean;
  showGrid: boolean;
  theme: "dark" | "light";
  indicators: ActiveIndicator[];
  drawings: Drawing[];
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

/** A named, restorable chart. Tabs in the tab bar map 1:1 to layouts. */
export interface Layout {
  id: string;
  name: string;
  color: string;
  state: ChartState;
}

const LAYOUT_COLORS = ["#2962ff", "#ff9800", "#4caf50", "#e91e63", "#00bcd4", "#9c27b0"];

export const uid = (): string => Math.random().toString(36).slice(2, 10);

export function defaultChartState(): ChartState {
  return {
    symbol: DEFAULT_SYMBOL,
    resolution: "1D",
    chartType: "candles",
    showVolume: true,
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
    state: defaultChartState(),
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

  activeLayout(): Layout;
  setActiveLayout(id: string): void;
  updateActive(patch: Partial<ChartState>): void;

  addLayout(): void;
  copyLayout(id: string): void;
  deleteLayout(id: string): void;
  renameLayout(id: string, name: string): void;

  addIndicator(id: string): void;
  removeIndicator(uid: string): void;
  updateIndicatorParams(uid: string, params: Record<string, number | boolean | string>): void;

  setDrawings(drawings: Drawing[]): void;
  setActiveTool(tool: DrawingToolId | null): void;

  addAlert(symbol: string, condition: AlertCondition, frequency: AlertFrequency, message: string): void;
  removeAlert(id: string): void;
  /** Fold one candle into every matching alert; returns ids that just fired. */
  applyCandle(symbol: string, candle: Candle, barClosed: boolean): string[];

  addToWatchlist(entry: WatchEntry): void;
  removeFromWatchlist(symbol: string): void;
  updateWatchPrice(symbol: string, price: number, changePct: number | null): void;

  markSaved(id: string): void;
}

const initial = [defaultLayout(0)];

export const useWorkspace = create<WorkspaceStore>((set, get) => ({
  layouts: initial,
  activeLayoutId: initial[0]!.id,
  activeTool: null,
  dirty: {},
  alerts: [],
  alertHistory: {},
  watchlist: [],

  activeLayout: () => {
    const { layouts, activeLayoutId } = get();
    return layouts.find((l) => l.id === activeLayoutId) ?? layouts[0]!;
  },

  setActiveLayout: (id) => set({ activeLayoutId: id, activeTool: null }),

  updateActive: (patch) =>
    set((s) => ({
      layouts: s.layouts.map((l) => (l.id === s.activeLayoutId ? { ...l, state: { ...l.state, ...patch } } : l)),
      dirty: { ...s.dirty, [s.activeLayoutId]: true },
    })),

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
        ...structuredClone(src),
        id: uid(),
        name: `${src.name} copy`,
        color: LAYOUT_COLORS[s.layouts.length % LAYOUT_COLORS.length]!,
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
    set((s) => {
      const layout = s.layouts.find((l) => l.id === s.activeLayoutId)!;
      const active: ActiveIndicator = {
        uid: uid(),
        def,
        params: Object.fromEntries(def.params.map((p) => [p.id, p.default])),
        colorIndex: layout.state.indicators.length,
      };
      return {
        layouts: s.layouts.map((l) =>
          l.id === s.activeLayoutId ? { ...l, state: { ...l.state, indicators: [...l.state.indicators, active] } } : l,
        ),
        dirty: { ...s.dirty, [s.activeLayoutId]: true },
      };
    });
  },

  removeIndicator: (target) =>
    set((s) => ({
      layouts: s.layouts.map((l) =>
        l.id === s.activeLayoutId
          ? { ...l, state: { ...l.state, indicators: l.state.indicators.filter((i) => i.uid !== target) } }
          : l,
      ),
      dirty: { ...s.dirty, [s.activeLayoutId]: true },
    })),

  updateIndicatorParams: (target, params) =>
    set((s) => ({
      layouts: s.layouts.map((l) =>
        l.id === s.activeLayoutId
          ? {
              ...l,
              state: {
                ...l.state,
                indicators: l.state.indicators.map((i) => (i.uid === target ? { ...i, params } : i)),
              },
            }
          : l,
      ),
      dirty: { ...s.dirty, [s.activeLayoutId]: true },
    })),

  setDrawings: (drawings) =>
    set((s) => ({
      layouts: s.layouts.map((l) => (l.id === s.activeLayoutId ? { ...l, state: { ...l.state, drawings } } : l)),
      dirty: { ...s.dirty, [s.activeLayoutId]: true },
    })),

  setActiveTool: (tool) => set({ activeTool: tool }),

  addAlert: (symbol, condition, frequency, message) =>
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

  markSaved: (id) => set((s) => ({ dirty: { ...s.dirty, [id]: false } })),
}));

/** Catalogue grouped by family, memoized at module scope for the picker. */
export const INDICATOR_FAMILIES = (() => {
  const out: Record<string, IndicatorDef[]> = {};
  for (const def of catalog()) (out[def.family] ??= []).push(def);
  return out;
})();

export const THEME_OF = { dark: DARK_THEME, light: LIGHT_THEME } as const;
