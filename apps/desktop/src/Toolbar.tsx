import type { Resolution } from "@ezyview/data-adapters";
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
import { PICKER_RESOLUTIONS, getLiveSources, resolutionName } from "./data";
import { sourceLabel, sourceOptions } from "./chartSource";
import { useApiKeys } from "./apiKeys";
import type { DockTabId } from "./RightDock";
import { Menu } from "./Menu";
import { SymbolSearch } from "./SymbolSearch";
import { QuoteHeader } from "./QuoteHeader";
import { getActiveExportSource, getExportSourceVersion, subscribeExportSources } from "./exportBridge";
import { copyChartEmbed, copyChartLink, pickTextFile, printChart, saveChartCsv, saveChartJson, saveChartPng, saveChartSvg, saveLayoutJson } from "./exportUi";
import { parseLayoutJson } from "./layoutShare";
import { getIndicator } from "@ezyview/indicators";
import { activeChartOf } from "./layout";
import { defaultChartState, useWorkspace } from "./store";
import { useShortcut } from "./shortcuts";
import { notice } from "./notice";
import { Button, IconButton, NumberInput, SegmentedControl, SHELL_BAR_HEIGHT, Tooltip } from "./ui";
import { CHART_TYPES, PALETTE_KEY, buildToolbarMenus, type ExportMenuApi } from "./toolbarMenus";

/**
 * Chart-hosted panels. The right-hand panels are tabs of one dock (see
 * `RightDock`), so they share the `dock` id; `trading` is the bottom strip.
 * Journal/Research/Strategies are routes, not panels.
 */
export type PanelId = "dock" | "trading";
export type { DockTabId } from "./RightDock";


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
  const exportApi: ExportMenuApi = {
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
  };

  const {
    intervalEntries,
    typeEntries,
    sourceEntries,
    quickSymbols,
    templateEntries,
    gridEntries,
    studyEntries,
    analysisEntries,
    tradeEntries,
    viewEntries,
    exportEntries,
    groups,
  } = buildToolbarMenus({
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
    dockTabId: props.dockTab,
    tradingOpen: props.tradingOpen,
    onSelectDockTab: props.onSelectDockTab,
    onToggleTrading: props.onToggleTrading,
    onOpenIndicators: props.onOpenIndicators,
    onOpenAlerts: props.onOpenAlerts,
    onOpenApiKeys: props.onOpenApiKeys,
    onOpenWindow: props.onOpenWindow,
    sourceOpts,
    exportApi,
    navigate,
    setPaletteOpen,
    setIntervalOpen,
  });

  const tradeOpen = props.tradingOpen || props.dockTab === "depth";
  const analysisOpen = replayActive;

  return (
    <div className={`flex ${SHELL_BAR_HEIGHT} shrink-0 items-center gap-0.5 overflow-x-auto border-b border-ev-raised px-2`}>
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
