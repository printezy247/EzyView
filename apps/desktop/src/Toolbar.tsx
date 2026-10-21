import type { Resolution } from "@ezyview/data-adapters";
import type { ChartType } from "@ezyview/chart-engine";
import { useEffect, useSyncExternalStore, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ArrowLeftRight, CandlestickChart, Clock, Eye, FlaskConical, Search, Share2, Telescope } from "lucide-react";
import { CommandPalette } from "./CommandPalette";
import type { CommandGroup } from "./CommandPalette";
import { RESOLUTION_GROUPS, resolutionName } from "./data";
import { Menu } from "./Menu";
import type { MenuEntry } from "./Menu";
import { SymbolSearch } from "./SymbolSearch";
import { getActiveExportSource, getExportSourceVersion, subscribeExportSources } from "./exportBridge";
import type { ExportSource } from "./exportBridge";
import { saveChartPng } from "./exportUi";
import { GRID_MODES } from "./layout";
import type { ChartThemeName, CrosshairModeName, GridMode, PriceScaleModeName } from "./layout";
import { useWorkspace } from "./store";
import type { MagnetMode } from "@ezyview/drawing-tools";

/** Timezones offered in the View menu; empty = exchange/UTC default. */
const TIMEZONES: { id: string; label: string }[] = [
  { id: "", label: "Default (UTC)" },
  { id: "America/New_York", label: "New York" },
  { id: "Europe/London", label: "London" },
  { id: "Europe/Berlin", label: "Berlin" },
  { id: "Asia/Tokyo", label: "Tokyo" },
  { id: "Asia/Hong_Kong", label: "Hong Kong" },
  { id: "Asia/Kolkata", label: "Kolkata" },
  { id: "Australia/Sydney", label: "Sydney" },
];

export const CHART_TYPES: { id: ChartType; label: string }[] = [
  { id: "candles", label: "Candles" },
  { id: "bars", label: "Bars" },
  { id: "hollow", label: "Hollow candles" },
  { id: "heikin", label: "Heikin Ashi" },
  { id: "line", label: "Line" },
  { id: "area", label: "Area" },
  { id: "baseline", label: "Baseline" },
  { id: "renko", label: "Renko" },
  { id: "kagi", label: "Kagi" },
  { id: "pnf", label: "Point & Figure" },
];

/** Chart side panels. Journal/Fundamentals/Options/Pine are routes now, not panels. */
export type PanelId = "watchlist" | "depth" | "objects" | "trading";

const MAGNET_MODES: { id: MagnetMode; label: string }[] = [
  { id: "off", label: "Magnet off" },
  { id: "weak", label: "Weak magnet" },
  { id: "strong", label: "Strong magnet" },
];

interface Props {
  symbol: string;
  resolution: Resolution;
  chartType: ChartType;
  showVolume: boolean;
  showVolumeProfile: boolean;
  /** Renko/P&F box or Kagi reversal; null = automatic. */
  boxSize: number | null;
  showGrid: boolean;
  theme: ChartThemeName;
  /** Per-cell chart controls (focused cell). */
  crosshairMode: CrosshairModeName;
  priceScale: PriceScaleModeName;
  invertScale: boolean;
  timezone: string | undefined;
  watermark: boolean;
  indicatorCount: number;
  replayActive: boolean;
  panels: Record<PanelId, boolean>;
  onSymbol: (s: string) => void;
  onResolution: (r: Resolution) => void;
  onChartType: (t: ChartType) => void;
  onToggleVolume: () => void;
  onToggleVolumeProfile: () => void;
  onBoxSize: (size: number | null) => void;
  onToggleGrid: () => void;
  onSetTheme: (theme: ChartThemeName) => void;
  onCrosshairMode: (mode: CrosshairModeName) => void;
  onPriceScale: (mode: PriceScaleModeName) => void;
  onInvertScale: () => void;
  onTimezone: (tz: string | undefined) => void;
  onWatermark: () => void;
  onOpenIndicators: () => void;
  onToggleReplay: () => void;
  onTogglePanel: (id: PanelId) => void;
  onOpenWindow: () => void;
  onOpenAlerts: () => void;
  onOpenApiKeys: () => void;
  grid: GridMode;
  onGrid: (grid: GridMode) => void;
}

const PALETTE_KEY = "Ctrl+K";

const toggle = (id: string, label: string, checked: boolean, onSelect: () => void): MenuEntry => ({
  kind: "toggle",
  id,
  label,
  checked,
  onSelect,
});

/** Bridge surface the Export menu drives; injectable so the builder stays testable. */
export interface ExportMenuApi {
  getActive: () => ExportSource | null;
  savePng: (source: ExportSource) => void;
}

/**
 * The Export menu's rows (Phase 8 starts with one). Actions only: the PNG
 * entry is disabled until some chart cell has published an export source, and
 * re-reads the bridge at click time so a stale render can't save nothing.
 * The same array feeds the Ctrl+K palette through the groups below.
 */
export function buildExportEntries(api: ExportMenuApi): MenuEntry[] {
  return [
    {
      kind: "action",
      id: "save-png",
      label: "Save chart image (PNG)",
      disabled: api.getActive() === null,
      onSelect: () => {
        const source = api.getActive();
        if (source) api.savePng(source);
      },
    },
  ];
}

/**
 * The top bar is a quiet menu bar, not a row of buttons. Features are grouped
 * by intent, and every menu item is also reachable from the Ctrl+K palette:
 *   Interval · Chart type   — what the chart shows
 *   Studies                 — indicators and Pine scripts on the chart
 *   Analysis                — research tools (fundamentals, options, replay, alerts)
 *   Trade                   — order ticket, depth of market, journal
 *   View                    — side panels, overlays, theme, windows
 *   Export                  — save the focused chart (PNG first; formats grow later)
 */
export function Toolbar(props: Props) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const pineActive = location.pathname === "/pine";
  // Export registry changes (a chart cell mounts or focus moves) bump a
  // version so this bar re-renders and the Export entry's disabled state
  // tracks getActiveExportSource() instead of freezing at first paint.
  useSyncExternalStore(subscribeExportSources, getExportSourceVersion, getExportSourceVersion);

  // Ctrl+Shift+K (Cmd+Shift+K on macOS) opens the feature search from anywhere.
  // Ctrl+K is reserved for the quick chart command input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const magnet = useWorkspace((s) => s.magnet);
  const setMagnet = useWorkspace((s) => s.setMagnet);
  const crosshairSync = useWorkspace((s) => s.crosshairSync);
  const setCrosshairSync = useWorkspace((s) => s.setCrosshairSync);
  const showEvents = useWorkspace((s) => s.showEvents);
  const setShowEvents = useWorkspace((s) => s.setShowEvents);

  const panel = (id: PanelId, label: string) => toggle(id, label, props.panels[id], () => props.onTogglePanel(id));

  const intervalEntries: MenuEntry[] = [];
  for (const group of RESOLUTION_GROUPS) {
    intervalEntries.push({ kind: "label", id: `g-${group.label}`, label: group.label });
    for (const r of group.items) {
      intervalEntries.push({
        kind: "radio",
        id: r,
        label: resolutionName(r),
        selected: r === props.resolution,
        onSelect: () => props.onResolution(r),
      });
    }
  }

  const typeEntries: MenuEntry[] = CHART_TYPES.map(
    (t): MenuEntry => ({
      kind: "radio",
      id: t.id,
      label: t.label,
      selected: t.id === props.chartType,
      onSelect: () => props.onChartType(t.id),
    }),
  );

  const studyEntries: MenuEntry[] = [
    { kind: "action", id: "indicators", label: "Indicators…", onSelect: props.onOpenIndicators },
    { kind: "action", id: "pine", label: "Pine editor", onSelect: () => navigate("/pine") },
  ];

  const analysisEntries: MenuEntry[] = [
    { kind: "label", id: "research", label: "Research" },
    { kind: "action", id: "fundamentals", label: "Fundamentals & screener", onSelect: () => navigate("/fundamentals") },
    { kind: "action", id: "options", label: "Options chain", onSelect: () => navigate("/options") },
    { kind: "separator", id: "s-tools" },
    { kind: "label", id: "tools", label: "Tools" },
    toggle("replay", "Bar replay", props.replayActive, props.onToggleReplay),
    { kind: "action", id: "alerts", label: "Price alerts…", onSelect: props.onOpenAlerts },
    { kind: "separator", id: "s-data" },
    { kind: "label", id: "data", label: "Data" },
    { kind: "action", id: "api-keys", label: "Data provider API keys…", onSelect: props.onOpenApiKeys },
  ];

  const tradeEntries: MenuEntry[] = [
    panel("trading", "Order ticket & positions"),
    panel("depth", "Depth of market"),
    { kind: "separator", id: "s-review" },
    { kind: "action", id: "journal", label: "Trading journal", onSelect: () => navigate("/journal") },
  ];

  const viewEntries: MenuEntry[] = [
    { kind: "label", id: "layout", label: "Layout" },
    ...GRID_MODES.map(
      (g): MenuEntry => ({
        kind: "radio",
        id: `grid-${g.id}`,
        label: g.label,
        selected: props.grid === g.id,
        onSelect: () => props.onGrid(g.id),
      }),
    ),
    { kind: "separator", id: "s-panels" },
    { kind: "label", id: "panels", label: "Panels" },
    panel("watchlist", "Watchlist"),
    panel("objects", "Object tree"),
    { kind: "separator", id: "s-drawing" },
    { kind: "label", id: "drawing", label: "Drawing" },
    ...MAGNET_MODES.map(
      (m): MenuEntry => ({
        kind: "radio",
        id: `magnet-${m.id}`,
        label: m.label,
        selected: magnet === m.id,
        onSelect: () => setMagnet(m.id),
      }),
    ),
    { kind: "separator", id: "s-chart" },
    { kind: "label", id: "chart", label: "Chart" },
    toggle("volume", "Volume", props.showVolume, props.onToggleVolume),
    toggle("volume-profile", "Volume profile", props.showVolumeProfile, props.onToggleVolumeProfile),
    toggle("grid", "Grid", props.showGrid, props.onToggleGrid),
    { kind: "separator", id: "s-crosshair" },
    { kind: "label", id: "crosshair", label: "Crosshair" },
    ...(
      [
        { id: "normal", label: "Normal" },
        { id: "magnet", label: "Magnet (snap to OHLC)" },
        { id: "hidden", label: "Hidden" },
      ] as const
    ).map(
      (m): MenuEntry => ({
        kind: "radio",
        id: `crosshair-${m.id}`,
        label: m.label,
        selected: props.crosshairMode === m.id,
        onSelect: () => props.onCrosshairMode(m.id),
      }),
    ),
    toggle("crosshair-sync", "Sync across charts", crosshairSync, () => setCrosshairSync(!crosshairSync)),
    { kind: "separator", id: "s-scale" },
    { kind: "label", id: "scale", label: "Price scale" },
    ...(
      [
        { id: "normal", label: "Normal" },
        { id: "log", label: "Logarithmic" },
        { id: "percentage", label: "Percentage" },
      ] as const
    ).map(
      (m): MenuEntry => ({
        kind: "radio",
        id: `scale-${m.id}`,
        label: m.label,
        selected: props.priceScale === m.id,
        onSelect: () => props.onPriceScale(m.id),
      }),
    ),
    toggle("invert-scale", "Invert scale", props.invertScale, props.onInvertScale),
    { kind: "separator", id: "s-time" },
    { kind: "label", id: "time-axis", label: "Time axis" },
    ...TIMEZONES.map(
      (tz): MenuEntry => ({
        kind: "radio",
        id: `tz-${tz.id}`,
        label: tz.label,
        selected: (props.timezone ?? "") === tz.id,
        onSelect: () => props.onTimezone(tz.id === "" ? undefined : tz.id),
      }),
    ),
    toggle("watermark", "Watermark", props.watermark, props.onWatermark),
    { kind: "separator", id: "s-theme" },
    { kind: "label", id: "appearance", label: "Appearance" },
    ...(
      [
        { id: "dark", label: "Dark theme" },
        { id: "light", label: "Light theme" },
        { id: "tokyo", label: "Tokyo Night" },
      ] as const
    ).map(
      (t): MenuEntry => ({
        kind: "radio",
        id: t.id,
        label: t.label,
        selected: props.theme === t.id,
        onSelect: () => props.onSetTheme(t.id),
      }),
    ),
    { kind: "separator", id: "s-window" },
    { kind: "label", id: "window", label: "Window" },
    { kind: "action", id: "new-window", label: "Open chart in new window", onSelect: props.onOpenWindow },
    { kind: "action", id: "palette", label: "Search features…", hint: PALETTE_KEY, onSelect: () => setPaletteOpen(true) },
  ];

  const exportEntries: MenuEntry[] = buildExportEntries({ getActive: getActiveExportSource, savePng: saveChartPng });

  const groups: CommandGroup[] = [
    { title: "Interval", entries: intervalEntries },
    { title: "Chart type", entries: typeEntries },
    { title: "Studies", entries: studyEntries },
    { title: "Analysis", entries: analysisEntries },
    { title: "Trade", entries: tradeEntries },
    { title: "View", entries: viewEntries.filter((e) => e.id !== "palette") },
    { title: "Export", entries: exportEntries },
  ];

  const tradeOpen = props.panels.trading || props.panels.depth;
  const analysisOpen = props.replayActive;

  return (
    <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-ev-raised px-2">
      <SymbolSearch symbol={props.symbol} onSelect={props.onSymbol} />

      <div className="mx-1 h-4 w-px bg-ev-raised" />

      <Menu label={props.resolution} caption="Interval" icon={<Clock size={13} aria-hidden />} entries={intervalEntries} />
      <Menu
        label={CHART_TYPES.find((t) => t.id === props.chartType)?.label ?? "Candles"}
        caption="Chart type"
        icon={<CandlestickChart size={13} aria-hidden />}
        entries={typeEntries}
      />
      {(props.chartType === "renko" || props.chartType === "kagi" || props.chartType === "pnf") && (
        <label
          className="ml-1 flex items-center gap-1 text-[11px] text-ev-muted"
          title={`${props.chartType === "kagi" ? "Reversal amount" : "Box size"}; leave empty to size it from the average true range`}
        >
          {props.chartType === "kagi" ? "Reversal" : "Box"}
          <input
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            placeholder="auto"
            value={props.boxSize ?? ""}
            onChange={(e) => {
              const v = Number(e.target.value);
              props.onBoxSize(e.target.value === "" || !(v > 0) ? null : v);
            }}
            className="w-16 rounded border border-ev-line bg-ev-panel px-1.5 py-0.5 text-[11px] text-ev-text placeholder:text-ev-faint"
          />
        </label>
      )}

      <div className="mx-1 h-4 w-px bg-ev-raised" />

      <nav aria-label="Main menu" className="flex items-center gap-0.5">
        <Menu
          label="Studies"
          icon={<FlaskConical size={13} aria-hidden />}
          badge={props.indicatorCount}
          triggerActive={pineActive}
          entries={studyEntries}
        />
        <Menu label="Analysis" icon={<Telescope size={13} aria-hidden />} triggerActive={analysisOpen} entries={analysisEntries} />
        <Menu label="Trade" icon={<ArrowLeftRight size={13} aria-hidden />} triggerActive={tradeOpen} entries={tradeEntries} />
        <Menu label="View" icon={<Eye size={13} aria-hidden />} entries={viewEntries} />
        <Menu label="Export" icon={<Share2 size={13} aria-hidden />} entries={exportEntries} />
      </nav>

      {props.replayActive && (
        <span className="ml-2 rounded bg-ev-accent/15 px-1.5 py-0.5 text-[11px] font-medium text-ev-accent-text">Replay on</span>
      )}

      <button
        type="button"
        aria-pressed={showEvents}
        title="Earnings markers and macro event lines"
        onClick={() => setShowEvents(!showEvents)}
        className={
          showEvents
            ? "ml-2 rounded bg-ev-accent/15 px-1.5 py-0.5 text-[11px] font-medium text-ev-accent-text"
            : "ml-2 rounded px-1.5 py-0.5 text-[11px] text-ev-muted hover:text-ev-strong"
        }
      >
        Events
      </button>

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        aria-keyshortcuts="Control+K"
        className="ml-auto flex h-6 w-56 items-center gap-2 rounded border border-ev-line px-2 text-[11px] text-ev-muted hover:border-ev-dim hover:text-ev-strong"
      >
        <Search size={12} aria-hidden />
        <span className="flex-1 text-left">Search features</span>
        <kbd className="text-[11px] text-ev-faint">{PALETTE_KEY}</kbd>
      </button>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} groups={groups} />
    </div>
  );
}
