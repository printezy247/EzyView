import type { Resolution } from "@ezyview/data-adapters";
import type { ChartType } from "@ezyview/chart-engine";
import { useSyncExternalStore, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useLocation, useNavigate } from "react-router";
import {
  ArrowLeftRight,
  BellPlus,
  Bookmark,
  Camera,
  CandlestickChart,
  Clock,
  Database,
  Eye,
  FlaskConical,
  Grid2x2,
  PlusCircle,
  Rewind,
  Search,
  Settings,
  Share2,
  Telescope,
} from "lucide-react";
import { CommandPalette } from "./CommandPalette";
import { IntervalDialog } from "./IntervalDialog";
import { buildNavCommands } from "./commandRegistry";
import type { CommandGroup } from "./commandRegistry";
import { PICKER_RESOLUTIONS, RESOLUTION_GROUPS, getLiveSources, resolutionName } from "./data";
import { sourceLabel, sourceOptions } from "./chartSource";
import { useApiKeys } from "./apiKeys";
import type { DockTabId } from "./RightDock";
import { Menu } from "./Menu";
import type { MenuEntry } from "./Menu";
import { SymbolSearch } from "./SymbolSearch";
import { QuoteHeader } from "./QuoteHeader";
import { getActiveExportSource, getExportSourceVersion, subscribeExportSources } from "./exportBridge";
import type { ExportSource } from "./exportBridge";
import { copyChartEmbed, copyChartLink, pickTextFile, printChart, saveChartCsv, saveChartJson, saveChartPng, saveChartSvg, saveLayoutJson } from "./exportUi";
import { parseLayoutJson } from "./layoutShare";
import { getIndicator } from "@ezyview/indicators";
import { GRID_MODES, activeChartOf } from "./layout";
import { defaultChartState, useWorkspace } from "./store";
import { useZen } from "./zen";
import { useShortcut } from "./shortcuts";
import type { MagnetMode } from "@ezyview/drawing-tools";
import { notice } from "./notice";
import { Button, IconButton, NumberInput, SegmentedControl, Tooltip } from "./ui";

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
  { id: "linebreak", label: "Line Break" },
  { id: "rangebars", label: "Range Bars" },
  { id: "column", label: "Column" },
  { id: "highlow", label: "High-Low" },
];

/**
 * Chart-hosted panels. The right-hand panels are tabs of one dock (see
 * `RightDock`), so they share the `dock` id; `trading` is the bottom strip.
 * Journal/Research/Strategies are routes, not panels.
 */
export type PanelId = "dock" | "trading";
export type { DockTabId } from "./RightDock";

const MAGNET_MODES: { id: MagnetMode; label: string }[] = [
  { id: "off", label: "Magnet off" },
  { id: "weak", label: "Weak magnet" },
  { id: "strong", label: "Strong magnet" },
];

interface Props {
  /** Which dock tab is visible, or null when the dock is closed. */
  dockTab: DockTabId | null;
  tradingOpen: boolean;
  onOpenIndicators: () => void;
  onOpenAlerts: () => void;
  onOpenApiKeys: () => void;
  onOpenWindow: () => void;
  onOpenSettings?: () => void;
  onSelectDockTab: (id: DockTabId) => void;
  onToggleTrading: () => void;
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
  saveCsv: (source: ExportSource) => void;
  saveJson: (source: ExportSource) => void;
  copyLink: (source: ExportSource) => void;
  copyEmbed: (source: ExportSource) => void;
  saveSvg: (source: ExportSource) => void;
  printPdf: (source: ExportSource) => void;
  saveLayout: () => void;
  importLayout: () => void;
}

/**
 * The Export menu's rows (Phase 8 starts with one). Actions only: the PNG
 * entry is disabled until some chart cell has published an export source, and
 * re-reads the bridge at click time so a stale render can't save nothing.
 * The same array feeds the Ctrl+K palette through the groups below.
 */
export function buildExportEntries(api: ExportMenuApi): MenuEntry[] {
  const action = (id: string, label: string, run: (source: ExportSource) => void): MenuEntry => ({
    kind: "action",
    id,
    label,
    disabled: api.getActive() === null,
    onSelect: () => {
      const source = api.getActive();
      if (source) run(source);
    },
  });
  return [
    action("save-png", "Save chart image (PNG)", api.savePng),
    action("save-csv", "Export chart data (CSV)", api.saveCsv),
    action("save-json", "Export chart data (JSON)", api.saveJson),
    action("save-svg", "Export chart image (SVG)", api.saveSvg),
    action("print-pdf", "Export chart image (PDF, print)", api.printPdf),
    action("copy-link", "Copy chart link", api.copyLink),
    action("copy-embed", "Copy embed snippet", api.copyEmbed),
    { kind: "separator", id: "s-layout" },
    { kind: "action", id: "save-layout", label: "Export layout (JSON)", onSelect: api.saveLayout },
    { kind: "action", id: "import-layout", label: "Import layout…", onSelect: api.importLayout },
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
  const [intervalOpen, setIntervalOpen] = useState(false);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const strategiesActive = location.pathname === "/strategies";
  // Export registry changes (a chart cell mounts or focus moves) bump a
  // version so this bar re-renders and the Export entry's disabled state
  // tracks getActiveExportSource() instead of freezing at first paint.
  useSyncExternalStore(subscribeExportSources, getExportSourceVersion, getExportSourceVersion);

  // Ctrl+K (Cmd+K on macOS) opens the command palette from anywhere; the
  // chart's quick command input moved to Ctrl+Shift+K in the redesign, since
  // the palette is the more common action once the app has eight sections.
  useShortcut({
    id: "command-palette",
    combo: "Mod+K",
    run: () => setPaletteOpen((v) => !v),
  });

  const magnet = useWorkspace((s) => s.magnet);
  const setMagnet = useWorkspace((s) => s.setMagnet);
  const crosshairSync = useWorkspace((s) => s.crosshairSync);
  const setCrosshairSync = useWorkspace((s) => s.setCrosshairSync);
  const chartTemplates = useWorkspace((s) => s.chartTemplates);
  const applyChartTemplate = useWorkspace((s) => s.applyChartTemplate);
  const saveChartTemplate = useWorkspace((s) => s.saveChartTemplate);
  const addIndicator = useWorkspace((s) => s.addIndicator);
  // The bar reads the focused chart itself; App passes only shell callbacks,
  // so a layout edit no longer threads 30 props through the shell.
  const chart = useWorkspace(
    useShallow((s) => {
      const c = activeChartOf(s.activeLayout());
      return {
        symbol: c.symbol,
        resolution: c.resolution,
        chartType: c.chartType,
        showVolume: c.showVolume,
        showVolumeProfile: c.showVolumeProfile ?? false,
        showGrid: c.showGrid,
        boxSize: c.boxSize ?? null,
        theme: c.theme,
        crosshairMode: c.crosshairMode ?? "normal",
        priceScale: c.priceScale ?? "normal",
        invertScale: c.invertScale ?? false,
        timezone: c.timezone,
        dataSource: c.dataSource ?? "auto",
        watermark: c.watermark ?? false,
        sessionBreaks: c.showSessionBreaks !== false,
        indicatorCount: c.indicators.length,
        grid: s.activeLayout().grid,
      };
    }),
  );
  const actions = useWorkspace(
    useShallow((s) => ({
      updateActive: s.updateActive,
      setSymbol: s.setSymbol,
      setResolution: s.setResolution,
      setReplay: s.setReplay,
      setGrid: s.setGrid,
    })),
  );
  const replayBar = useWorkspace((s) => s.replayBar);
  const replayActive = replayBar !== null;

  const hasTwelveKey = useApiKeys((s) => Boolean(s.keys.twelvedata));
  const liveSources = getLiveSources();
  const sourceOpts = sourceOptions(chart.symbol, { supports: (id, sym) => liveSources[id].supports(sym), hasTwelveKey });
  const sourceEntries: MenuEntry[] = sourceOpts.map(
    (o): MenuEntry => ({
      kind: "radio",
      id: `source-${o.id}`,
      label: o.label,
      selected: chart.dataSource === o.id,
      ...(o.disabled ? { disabled: true } : {}),
      ...(o.hint ? { hint: o.hint } : {}),
      onSelect: () => actions.updateActive({ dataSource: o.id }),
    }),
  );
  if (sourceOpts.some((o) => o.id === "twelvedata")) {
    sourceEntries.push(
      { kind: "separator", id: "source-sep" },
      { kind: "label", id: "source-help", label: "Twelve Data free keys update every ~8 s" },
    );
  }

  const quickSymbols: MenuEntry[] = [
    { kind: "label", id: "qs-metals", label: "Precious Metals & Forex" },
    { kind: "radio", id: "sym-xau", label: "OANDA:XAUUSD — Gold / US Dollar", selected: chart.symbol === "OANDA:XAUUSD", onSelect: () => actions.setSymbol("OANDA:XAUUSD") },
    { kind: "radio", id: "sym-eur", label: "FX:EURUSD — Euro / US Dollar", selected: chart.symbol === "FX:EURUSD", onSelect: () => actions.setSymbol("FX:EURUSD") },
    { kind: "radio", id: "sym-gbp", label: "FX:GBPUSD — British Pound / US Dollar", selected: chart.symbol === "FX:GBPUSD", onSelect: () => actions.setSymbol("FX:GBPUSD") },
    { kind: "separator", id: "qs-s1" },
    { kind: "label", id: "qs-crypto", label: "Crypto Spot" },
    { kind: "radio", id: "sym-btc", label: "BINANCE:BTCUSDT — Bitcoin / USDT", selected: chart.symbol === "BINANCE:BTCUSDT", onSelect: () => actions.setSymbol("BINANCE:BTCUSDT") },
    { kind: "radio", id: "sym-eth", label: "BINANCE:ETHUSDT — Ethereum / USDT", selected: chart.symbol === "BINANCE:ETHUSDT", onSelect: () => actions.setSymbol("BINANCE:ETHUSDT") },
    { kind: "radio", id: "sym-sol", label: "BINANCE:SOLUSDT — Solana / USDT", selected: chart.symbol === "BINANCE:SOLUSDT", onSelect: () => actions.setSymbol("BINANCE:SOLUSDT") },
    { kind: "separator", id: "qs-s2" },
    { kind: "label", id: "qs-eq", label: "Equities & Indices" },
    { kind: "radio", id: "sym-spx", label: "SP:SPX — S&P 500 Index", selected: chart.symbol === "SP:SPX", onSelect: () => actions.setSymbol("SP:SPX") },
    { kind: "radio", id: "sym-aapl", label: "NASDAQ:AAPL — Apple Inc.", selected: chart.symbol === "NASDAQ:AAPL", onSelect: () => actions.setSymbol("NASDAQ:AAPL") },
  ];

  const templateEntries: MenuEntry[] = [
    { kind: "label", id: "tpl-presets", label: "Quick Study Presets" },
    {
      kind: "action",
      id: "preset-trend",
      label: "Trend Pack (EMA + RSI)",
      onSelect: () => {
        addIndicator("ema");
        addIndicator("rsi");
      },
    },
    {
      kind: "action",
      id: "preset-bb",
      label: "Volatility Pack (Bollinger + MACD)",
      onSelect: () => {
        addIndicator("bb");
        addIndicator("macd");
      },
    },
    {
      kind: "action",
      id: "preset-clean",
      label: "Clear all indicators",
      onSelect: () => useWorkspace.getState().updateActive({ indicators: [] }),
    },
    { kind: "separator", id: "tpl-sep" },
    {
      kind: "action",
      id: "tpl-save",
      label: "Save current chart as template",
      onSelect: () => {
        const name = `${chart.symbol.split(":").pop()} ${chart.resolution} (${chart.indicatorCount} studies)`;
        saveChartTemplate(name);
        notice.alert("Template saved", `Saved "${name}" to Templates.`);
      },
    },
    ...chartTemplates.map(
      (t): MenuEntry => ({
        kind: "action",
        id: `tpl-${t.id}`,
        label: `Apply: ${t.name}`,
        onSelect: () => applyChartTemplate(t.id),
      }),
    ),
  ];

  const gridEntries: MenuEntry[] = GRID_MODES.map(
    (g): MenuEntry => ({
      kind: "radio",
      id: `qgrid-${g.id}`,
      label: `${g.label} (${g.id})`,
      selected: chart.grid === g.id,
      onSelect: () => actions.setGrid(g.id),
    }),
  );

  const dockTab = (id: DockTabId, label: string) =>
    toggle(id, label, props.dockTab === id, () => props.onSelectDockTab(id));
  const tradingPanel = () => toggle("trading", "Order ticket & positions", props.tradingOpen, props.onToggleTrading);

  const intervalEntries: MenuEntry[] = [];
  for (const group of RESOLUTION_GROUPS) {
    intervalEntries.push({ kind: "label", id: `g-${group.label}`, label: group.label });
    for (const r of group.items) {
      intervalEntries.push({
        kind: "radio",
        id: r,
        label: resolutionName(r),
        selected: r === chart.resolution,
        onSelect: () => actions.setResolution(r),
      });
    }
  }
  // The served intervals are a closed set, so "custom" is a dialog that explains
  // why a typed interval cannot be honoured rather than a free-text field that
  // silently picks something else.
  intervalEntries.push({ kind: "separator", id: "sep-custom" });
  intervalEntries.push({
    kind: "action",
    id: "custom",
    label: "Custom interval…",
    hint: "Type 15m, 4h, 1d",
    onSelect: () => setIntervalOpen(true),
  });

  const typeEntries: MenuEntry[] = CHART_TYPES.map(
    (t): MenuEntry => ({
      kind: "radio",
      id: t.id,
      label: t.label,
      selected: t.id === chart.chartType,
      onSelect: () => actions.updateActive({ chartType: t.id }),
    }),
  );

  const studyEntries: MenuEntry[] = [
    { kind: "action", id: "indicators", label: "Indicators…", onSelect: props.onOpenIndicators },
    { kind: "action", id: "pine", label: "Pine editor", onSelect: () => navigate("/strategies") },
  ];

  const analysisEntries: MenuEntry[] = [
    { kind: "label", id: "research", label: "Research" },
    { kind: "action", id: "fundamentals", label: "Fundamentals & screener", onSelect: () => navigate("/research?tab=fundamentals") },
    { kind: "action", id: "options", label: "Options chain", onSelect: () => navigate("/research?tab=options") },
    { kind: "separator", id: "s-tools" },
    { kind: "label", id: "tools", label: "Tools" },
    toggle("replay", "Bar replay", replayActive, () => actions.setReplay(replayBar === null ? -30 : null)),
    { kind: "action", id: "alerts", label: "Price alerts…", onSelect: props.onOpenAlerts },
    { kind: "separator", id: "s-data" },
    { kind: "label", id: "data", label: "Data" },
    { kind: "action", id: "api-keys", label: "Data provider API keys…", onSelect: props.onOpenApiKeys },
  ];

  const tradeEntries: MenuEntry[] = [
    tradingPanel(),
    dockTab("depth", "Depth of market"),
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
        selected: chart.grid === g.id,
        onSelect: () => actions.setGrid(g.id),
      }),
    ),
    { kind: "separator", id: "s-panels" },
    { kind: "label", id: "panels", label: "Panels" },
    dockTab("watchlist", "Watchlist"),
    dockTab("objects", "Object tree"),
    dockTab("tape", "Time & sales"),
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
    toggle("volume", "Volume", chart.showVolume, () => actions.updateActive({ showVolume: !chart.showVolume })),
    toggle("volume-profile", "Volume profile", chart.showVolumeProfile, () => actions.updateActive({ showVolumeProfile: !chart.showVolumeProfile })),
    toggle("grid", "Grid", chart.showGrid, () => actions.updateActive({ showGrid: !chart.showGrid })),
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
        selected: chart.crosshairMode === m.id,
        onSelect: () => actions.updateActive({ crosshairMode: m.id }),
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
        selected: chart.priceScale === m.id,
        onSelect: () => actions.updateActive({ priceScale: m.id }),
      }),
    ),
    toggle("invert-scale", "Invert scale", chart.invertScale, () => actions.updateActive({ invertScale: !chart.invertScale })),
    { kind: "separator", id: "s-time" },
    { kind: "label", id: "time-axis", label: "Time axis" },
    ...TIMEZONES.map(
      (tz): MenuEntry => ({
        kind: "radio",
        id: `tz-${tz.id}`,
        label: tz.label,
        selected: (chart.timezone ?? "") === tz.id,
        onSelect: () => actions.updateActive({ timezone: tz.id === "" ? undefined : tz.id }),
      }),
    ),
    toggle("watermark", "Watermark", chart.watermark, () => actions.updateActive({ watermark: !chart.watermark })),
    toggle("session-breaks", "Session breaks", chart.sessionBreaks, () => actions.updateActive({ showSessionBreaks: chart.sessionBreaks === false })),
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
        selected: chart.theme === t.id,
        onSelect: () => actions.updateActive({ theme: t.id }),
      }),
    ),
    { kind: "separator", id: "s-window" },
    { kind: "label", id: "window", label: "Window" },
    { kind: "action", id: "new-window", label: "Open chart in new window", onSelect: props.onOpenWindow },
    { kind: "action", id: "zen", label: "Fullscreen (hide tabs)", hint: "F11", onSelect: () => useZen.getState().toggle() },
    { kind: "action", id: "palette", label: "Search features…", hint: PALETTE_KEY, onSelect: () => setPaletteOpen(true) },
  ];

  const exportEntries: MenuEntry[] = buildExportEntries({
    getActive: getActiveExportSource,
    savePng: saveChartPng,
    saveCsv: saveChartCsv,
    saveJson: saveChartJson,
    copyLink: copyChartLink,
    copyEmbed: copyChartEmbed,
    saveSvg: saveChartSvg,
    printPdf: printChart,
    saveLayout: () => saveLayoutJson(useWorkspace.getState().activeLayout()),
    importLayout: () => {
      void pickTextFile(".json,application/json").then((text) => {
        if (text === null) return;
        try {
          const ws = useWorkspace.getState();
          ws.importLayout(parseLayoutJson(text, defaultChartState(), getIndicator));
        } catch (e) {
          notice.alert("Could not import layout", e instanceof Error ? e.message : String(e));
        }
      });
    },
  });

  const navCommands = buildNavCommands((to) => navigate(to));
  const navGroup: CommandGroup = {
    title: "Go to",
    entries: navCommands.map((c) => ({ kind: "action" as const, id: c.id, label: c.label, hint: c.hint, onSelect: c.run })),
  };

  const groups: CommandGroup[] = [
    navGroup,
    { title: "Interval", entries: intervalEntries },
    { title: "Chart type", entries: typeEntries },
    { title: "Data source", entries: sourceEntries },
    { title: "Studies", entries: studyEntries },
    { title: "Analysis", entries: analysisEntries },
    { title: "Trade", entries: tradeEntries },
    { title: "View", entries: viewEntries.filter((e) => e.id !== "palette") },
    { title: "Export", entries: exportEntries },
  ];

  const tradeOpen = props.tradingOpen || props.dockTab === "depth";
  const analysisOpen = replayActive;

  return (
    <div className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-ev-raised px-2">
      <SymbolSearch symbol={chart.symbol} onSelect={actions.setSymbol} />
      <Menu
        label=""
        caption="Quick symbol switcher & markets"
        icon={<PlusCircle size={13} aria-hidden />}
        entries={quickSymbols}
      />
      <QuoteHeader symbol={chart.symbol} dataSource={chart.dataSource} />

      <div className="mx-1 h-4 w-px shrink-0 bg-ev-raised" />

      {/* 1-click favorite interval pills (TradingView style) */}
      <SegmentedControl
        label="Favorite intervals"
        size="sm"
        className="hidden lg:inline-flex"
        value={chart.resolution}
        onChange={(r) => actions.setResolution(r as Resolution)}
        options={PICKER_RESOLUTIONS.map((r) => ({ value: r, label: r, title: resolutionName(r) }))}
      />

      <Menu label={chart.resolution} caption="Interval" icon={<Clock size={13} aria-hidden />} entries={intervalEntries} />
      <Menu
        label={CHART_TYPES.find((t) => t.id === chart.chartType)?.label ?? "Candles"}
        caption="Chart type"
        icon={<CandlestickChart size={13} aria-hidden />}
        entries={typeEntries}
      />
      <Menu
        label={sourceLabel(chart.dataSource)}
        caption="Data source"
        icon={<Database size={13} aria-hidden />}
        entries={sourceEntries}
      />
      {(chart.chartType === "renko" ||
        chart.chartType === "kagi" ||
        chart.chartType === "pnf" ||
        chart.chartType === "linebreak" ||
        chart.chartType === "rangebars") && (
        <NumberInput
          inline
          className="ml-1"
          label={chart.chartType === "kagi" ? "Reversal" : chart.chartType === "linebreak" ? "Lines" : "Box"}
          hint={`${chart.chartType === "kagi" ? "Reversal amount" : chart.chartType === "linebreak" ? "Lines per break" : "Box size"}; leave empty to size it from the average true range`}
          min={0}
          step={0.01}
          value={chart.boxSize}
          onValueChange={(v) => actions.updateActive({ boxSize: v !== null && v > 0 ? v : null })}
        />
      )}

      <div className="mx-1 h-4 w-px shrink-0 bg-ev-raised" />

      <nav aria-label="Main menu" className="flex items-center gap-0.5">
        <Menu
          label="Studies"
          icon={<FlaskConical size={13} aria-hidden />}
          badge={chart.indicatorCount}
          triggerActive={strategiesActive}
          entries={studyEntries}
        />
        <Menu
          label="Templates"
          caption="Indicator & chart templates"
          icon={<Bookmark size={13} aria-hidden />}
          entries={templateEntries}
        />
        <Menu label="Analysis" icon={<Telescope size={13} aria-hidden />} triggerActive={analysisOpen} entries={analysisEntries} />
        <Menu label="Trade" icon={<ArrowLeftRight size={13} aria-hidden />} triggerActive={tradeOpen} entries={tradeEntries} />
        <Menu label="View" icon={<Eye size={13} aria-hidden />} entries={viewEntries} />
        <Menu label="Export" icon={<Share2 size={13} aria-hidden />} entries={exportEntries} />
      </nav>

      <div className="mx-1 h-4 w-px shrink-0 bg-ev-raised" />

      {/* Direct 1-click TradingView action buttons: Alert, Replay, Grid, Snapshot */}
      <Tooltip content="Create a price alert on the active symbol">
        <Button size="sm" variant="ghost" onClick={props.onOpenAlerts} aria-label="Create price alert">
          <BellPlus size={13} aria-hidden />
          <span className="hidden xl:inline">Alert</span>
        </Button>
      </Tooltip>

      <Button
        size="sm"
        variant="ghost"
        aria-pressed={replayActive}
        aria-label="Toggle bar replay mode"
        onClick={() => actions.setReplay(replayBar === null ? -30 : null)}
        className={replayActive ? "bg-ev-accent/20 text-ev-accent-text hover:bg-ev-accent/25" : ""}
      >
        <Rewind size={13} aria-hidden />
        <span className="hidden xl:inline">Replay</span>
      </Button>

      <Menu
        label={chart.grid}
        caption="Chart grid layout"
        icon={<Grid2x2 size={13} aria-hidden />}
        entries={gridEntries}
      />

      <Tooltip content="Take an instant chart snapshot (PNG)">
        <IconButton
          label="Take chart snapshot"
          size="sm"
          disabled={snapshotBusy}
          onClick={() => {
            if (snapshotBusy) return;
            setSnapshotBusy(true);
            try {
              const src = getActiveExportSource();
              if (src) saveChartPng(src);
            } finally {
              setTimeout(() => setSnapshotBusy(false), 500);
            }
          }}
        >
          <Camera size={13} aria-hidden />
        </IconButton>
      </Tooltip>

      <Tooltip content="Chart settings">
        <IconButton label="Chart settings" size="sm" onClick={props.onOpenSettings}>
          <Settings size={13} aria-hidden />
        </IconButton>
      </Tooltip>

      <Button
        size="sm"
        variant="outline"
        onClick={() => setPaletteOpen(true)}
        aria-keyshortcuts="Control+K"
        className="ml-auto w-48 justify-start gap-2 font-normal text-ev-muted"
      >
        <Search size={12} aria-hidden />
        <span className="flex-1 truncate text-left">Search features</span>
        <kbd className="text-dense text-ev-faint">{PALETTE_KEY}</kbd>
      </Button>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} groups={groups} />
      <IntervalDialog open={intervalOpen} onClose={() => setIntervalOpen(false)} onPick={actions.setResolution} />
    </div>
  );
}
