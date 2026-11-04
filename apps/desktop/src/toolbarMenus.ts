import type { Resolution } from "@ezyview/data-adapters";
import type { ChartType } from "@ezyview/chart-engine";
import type { DockTabId } from "./RightDock";
import { buildNavCommands } from "./commandRegistry";
import type { CommandGroup } from "./commandRegistry";
import { RESOLUTION_GROUPS, resolutionName } from "./data";
import type { SourceOption } from "./chartSource";
import type { ExportSource } from "./exportBridge";
import type { MenuEntry } from "./Menu";
import { GRID_MODES, type GridMode } from "./layout";
import type { ChartState, ChartThemeName, CrosshairModeName, PriceScaleModeName } from "./layout";
import type { ChartTemplate } from "./chartTemplates";
import type { MagnetMode } from "@ezyview/drawing-tools";
import { useZen } from "./zen";
import { notice } from "./notice";

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

const MAGNET_MODES: { id: MagnetMode; label: string }[] = [
  { id: "off", label: "Magnet off" },
  { id: "weak", label: "Weak magnet" },
  { id: "strong", label: "Strong magnet" },
];

export const PALETTE_KEY = "Ctrl+K";

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

/** Focused slice of the chart snapshot the menus need. */
export interface ChartMenuSnapshot {
  symbol: string;
  resolution: Resolution;
  chartType: ChartType;
  showVolume: boolean;
  showVolumeProfile: boolean;
  showGrid: boolean;
  boxSize: number | null;
  theme: ChartThemeName;
  crosshairMode: CrosshairModeName;
  priceScale: PriceScaleModeName;
  invertScale: boolean;
  timezone?: string;
  dataSource: ChartState["dataSource"];
  watermark: boolean;
  sessionBreaks: boolean;
  indicatorCount: number;
  grid: GridMode;
}

export interface ToolbarMenuInput {
  chart: ChartMenuSnapshot;
  actions: {
    updateActive: (patch: Partial<ChartState>) => void;
    setSymbol: (symbol: string) => void;
    setResolution: (resolution: Resolution) => void;
    setGrid: (grid: GridMode) => void;
    setReplay: (barIndex: number | null) => void;
  };
  magnet: MagnetMode;
  setMagnet: (mode: MagnetMode) => void;
  crosshairSync: boolean;
  setCrosshairSync: (on: boolean) => void;
  chartTemplates: ChartTemplate[];
  applyChartTemplate: (id: string) => void;
  saveChartTemplate: (name: string) => void;
  addIndicator: (id: string) => void;
  replayBar: number | null;
  dockTabId: DockTabId | null;
  tradingOpen: boolean;
  onSelectDockTab: (id: DockTabId) => void;
  onToggleTrading: () => void;
  onOpenIndicators: () => void;
  onOpenAlerts: () => void;
  onOpenApiKeys: () => void;
  onOpenWindow: () => void;
  sourceOpts: SourceOption[];
  exportApi: ExportMenuApi;
  navigate: (to: string) => void;
  setPaletteOpen: (open: boolean) => void;
  setIntervalOpen: (open: boolean) => void;
}

export interface ToolbarMenuEntries {
  intervalEntries: MenuEntry[];
  typeEntries: MenuEntry[];
  sourceEntries: MenuEntry[];
  quickSymbols: MenuEntry[];
  templateEntries: MenuEntry[];
  gridEntries: MenuEntry[];
  studyEntries: MenuEntry[];
  analysisEntries: MenuEntry[];
  tradeEntries: MenuEntry[];
  viewEntries: MenuEntry[];
  exportEntries: MenuEntry[];
  groups: CommandGroup[];
}

/**
 * Every menu row of the top bar, built in one pass so the bar itself only
 * wires callbacks and renders. Pure apart from the injected `exportApi`,
 * which closes over the export bridge — tests can stub it.
 */
export function buildToolbarMenus(input: ToolbarMenuInput): ToolbarMenuEntries {
  const {
    chart,
    actions,
    magnet,
    setMagnet,
    crosshairSync,
    setCrosshairSync,
    chartTemplates,
    applyChartTemplate,
    saveChartTemplate,
    addIndicator,
    replayBar,
    dockTabId,
    tradingOpen,
    onSelectDockTab,
    onToggleTrading,
    onOpenIndicators,
    onOpenAlerts,
    onOpenApiKeys,
    onOpenWindow,
    sourceOpts,
    exportApi,
    navigate,
    setPaletteOpen,
    setIntervalOpen,
  } = input;

  const replayActive = replayBar !== null;

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
      onSelect: () => actions.updateActive({ indicators: [] }),
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

  const dockTabMenu = (id: DockTabId, label: string) =>
    toggle(id, label, dockTabId === id, () => onSelectDockTab(id));
  const tradingPanel = () => toggle("trading", "Order ticket & positions", tradingOpen, onToggleTrading);

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
    { kind: "action", id: "indicators", label: "Indicators…", onSelect: onOpenIndicators },
    { kind: "action", id: "pine", label: "Pine editor", onSelect: () => navigate("/strategies") },
  ];

  const analysisEntries: MenuEntry[] = [
    { kind: "label", id: "research", label: "Research" },
    { kind: "action", id: "fundamentals", label: "Fundamentals & screener", onSelect: () => navigate("/research?tab=fundamentals") },
    { kind: "action", id: "options", label: "Options chain", onSelect: () => navigate("/research?tab=options") },
    { kind: "separator", id: "s-tools" },
    { kind: "label", id: "tools", label: "Tools" },
    toggle("replay", "Bar replay", replayActive, () => actions.setReplay(replayBar === null ? -30 : null)),
    { kind: "action", id: "alerts", label: "Price alerts…", onSelect: onOpenAlerts },
    { kind: "separator", id: "s-data" },
    { kind: "label", id: "data", label: "Data" },
    { kind: "action", id: "api-keys", label: "Data provider API keys…", onSelect: onOpenApiKeys },
  ];

  const tradeEntries: MenuEntry[] = [
    tradingPanel(),
    dockTabMenu("depth", "Depth of market"),
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
    dockTabMenu("watchlist", "Watchlist"),
    dockTabMenu("objects", "Object tree"),
    dockTabMenu("tape", "Time & sales"),
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
    { kind: "action", id: "new-window", label: "Open chart in new window", onSelect: onOpenWindow },
    { kind: "action", id: "zen", label: "Fullscreen (hide tabs)", hint: "F11", onSelect: () => useZen.getState().toggle() },
    { kind: "action", id: "palette", label: "Search features…", hint: PALETTE_KEY, onSelect: () => setPaletteOpen(true) },
  ];

  const exportEntries: MenuEntry[] = buildExportEntries(exportApi);

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


  return { intervalEntries, typeEntries, sourceEntries, quickSymbols, templateEntries, gridEntries, studyEntries, analysisEntries, tradeEntries, viewEntries, exportEntries, groups };
}
