import { useCallback, useEffect, useMemo, useState } from "react";
import type { Candle } from "@ezyview/data-adapters";
import type { TradingLine } from "@ezyview/chart-engine";
import { ChartHost } from "./ChartHost";
import { DrawingToolbar } from "./DrawingToolbar";
import { IndicatorDialog } from "./IndicatorDialog";
import { PineEditor } from "./PineEditor";
import { ReplayBar } from "./ReplayBar";
import { TabBar } from "./TabBar";
import { Toolbar } from "./Toolbar";
import type { PanelId } from "./Toolbar";
import { AlertDialog } from "./AlertDialog";
import { DepthOfMarket } from "./DepthOfMarket";
import { TradingPanel } from "./TradingPanel";
import { Watchlist } from "./Watchlist";
import { JournalPanel } from "./JournalPanel";
import { FundamentalsPanel } from "./FundamentalsPanel";
import { ApiKeysDialog } from "./ApiKeysDialog";
import { useApiKeys } from "./apiKeys";
import { OptionsPanel } from "./OptionsPanel";
import { openChartWindow } from "./windows";
import { Mt5Setup } from "./Mt5Setup";
import { RightRail } from "./RightRail";
import { useWorkspace } from "./store";
import { loadHistory } from "./data";
import { bootstrapMt5, getMt5, useMt5 } from "./mt5";
import type { ChartSource } from "./mt5";
import { useTrading, useTradingTicks } from "./trading";

export default function App() {
  const layout = useWorkspace((s) => s.activeLayout());
  const updateActive = useWorkspace((s) => s.updateActive);
  const activeTool = useWorkspace((s) => s.activeTool);
  const alerts = useWorkspace((s) => s.alerts);
  const addAlert = useWorkspace((s) => s.addAlert);
  const removeAlert = useWorkspace((s) => s.removeAlert);
  const replayBar = useWorkspace((s) => s.replayBar);
  const setReplay = useWorkspace((s) => s.setReplay);
  const positions = useTrading((s) => s.positions);
  const orders = useTrading((s) => s.orders);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const apiKeysOpen = useApiKeys((s) => s.dialogOpen);
  const openApiKeys = useApiKeys((s) => s.openDialog);
  useEffect(() => {
    void useApiKeys.getState().reload();
  }, []);
  const [pineOpen, setPineOpen] = useState(false);
  const [tradingOpen, setTradingOpen] = useState(true);
  const [journalOpen, setJournalOpen] = useState(false);
  const [fundamentalsOpen, setFundamentalsOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(true);
  const [domOpen, setDomOpen] = useState(true);
  const [pineBars, setPineBars] = useState<Candle[]>([]);
  const [historyBars, setHistoryBars] = useState(0);
  const [crosshairTime, setCrosshairTime] = useState<number | null>(null);

  const onCrosshairTime = useCallback((t: number | null) => setCrosshairTime(t), []);

  // Honour a remembered broker feed once, if MT5 answers on first load.
  useEffect(() => {
    void bootstrapMt5();
  }, []);

  // On the broker feed a demo ticker (BINANCE:…) resolves to nothing, so swap
  // to a symbol the terminal actually knows rather than leaving a blank chart.
  const source = useMt5((s) => s.source);
  useEffect(() => {
    if (source !== "mt5" || !layout.state.symbol.includes(":")) return;
    let cancelled = false;
    void getMt5()
      .data.searchSymbols("")
      .then(([first]) => {
        if (!cancelled && first) updateActive({ symbol: first.symbol });
      });
    return () => {
      cancelled = true;
    };
  }, [source, layout.state.symbol, updateActive]);

  // Load bars for the Pine editor on demand — not on every chart tick.
  useEffect(() => {
    if (!pineOpen) return;
    let cancelled = false;
    void loadHistory(layout.state.symbol, layout.state.resolution).then((candles) => {
      if (!cancelled) setPineBars(candles);
    });
    return () => {
      cancelled = true;
    };
  }, [pineOpen, layout.state.symbol, layout.state.resolution]);

  // The replay transport needs the bar count for its slider range.
  useEffect(() => {
    let cancelled = false;
    setReplay(null);
    void loadHistory(layout.state.symbol, layout.state.resolution).then((candles) => {
      if (!cancelled) setHistoryBars(candles.length);
    });
    return () => {
      cancelled = true;
    };
  }, [layout.state.symbol, layout.state.resolution, setReplay]);

  // Escape clears the armed drawing tool, like TradingView.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") useWorkspace.getState().setActiveTool(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { state } = layout;

  // The engine only needs ticks where it has something at stake: an open
  // position or a resting order, plus the chart's symbol while the ticket can
  // be used to open one.
  const exposure = new Set<string>(positions.map((p) => p.symbol));
  for (const order of orders) exposure.add(order.symbol);
  if (tradingOpen) exposure.add(state.symbol);
  useTradingTicks([...exposure].join("|"));

  // Entry/stop/target for the position on this chart, as constant price lines.
  const tradingLines = useMemo(() => {
    const position = positions.find((p) => p.symbol === state.symbol);
    if (!position) return [];
    const lines: TradingLine[] = [
      { price: position.entryPrice, color: "#2962ff", title: position.side === "long" ? "LONG" : "SHORT" },
    ];
    if (position.stopLoss !== undefined) {
      lines.push({ price: position.stopLoss, color: "#ef5350", title: "SL", dashed: true });
    }
    if (position.takeProfit !== undefined) {
      lines.push({ price: position.takeProfit, color: "#26a69a", title: "TP", dashed: true });
    }
    return lines;
  }, [positions, state.symbol]);

  // The View menu drives every panel: two independent side rails, one shared
  // bottom slot (trade, journal, fundamentals and options never overlap).
  const togglePanel = (id: PanelId) => {
    if (id === "watchlist") {
      setWatchlistOpen((v) => !v);
      return;
    }
    if (id === "depth") {
      setDomOpen((v) => !v);
      return;
    }
    const open: Record<"trading" | "journal" | "fundamentals" | "options", boolean> = {
      trading: tradingOpen,
      journal: journalOpen,
      fundamentals: fundamentalsOpen,
      options: optionsOpen,
    };
    const next = !open[id];
    setTradingOpen(id === "trading" && next);
    setJournalOpen(id === "journal" && next);
    setFundamentalsOpen(id === "fundamentals" && next);
    setOptionsOpen(id === "options" && next);
  };

  const panels = {
    watchlist: watchlistOpen,
    depth: domOpen,
    trading: tradingOpen,
    journal: journalOpen,
    fundamentals: fundamentalsOpen,
    options: optionsOpen,
  };

  return (
    <div className="flex h-full flex-col bg-[#0e1117] text-[#d1d4dc]">
      <TabBar />

      <Toolbar
        symbol={state.symbol}
        resolution={state.resolution}
        chartType={state.chartType}
        showVolume={state.showVolume}
        showGrid={state.showGrid}
        indicatorCount={state.indicators.length}
        onSymbol={(symbol) => updateActive({ symbol })}
        onResolution={(resolution) => updateActive({ resolution })}
        onChartType={(chartType) => updateActive({ chartType })}
        onToggleVolume={() => updateActive({ showVolume: !state.showVolume })}
        onToggleGrid={() => updateActive({ showGrid: !state.showGrid })}
        onToggleTheme={() => updateActive({ theme: state.theme === "dark" ? "light" : "dark" })}
        theme={state.theme}
        onOpenIndicators={() => setDialogOpen(true)}
        onTogglePine={() => setPineOpen((v) => !v)}
        pineActive={pineOpen}
        onToggleReplay={() => setReplay(replayBar === null ? 0 : null)}
        replayActive={replayBar !== null}
        panels={panels}
        onOpenWindow={() => void openChartWindow(state.symbol, state.resolution)}
        onOpenAlerts={() => setAlertOpen(true)}
        onOpenApiKeys={openApiKeys}
        onTogglePanel={togglePanel}
      />

      <div className="relative flex min-h-0 flex-1">
        <DrawingToolbar />

        <div className="relative min-w-0 flex-1">
          <ChartHost
            key={layout.id}
            symbol={state.symbol}
            resolution={state.resolution}
            chartType={state.chartType}
            showVolume={state.showVolume}
            showGrid={state.showGrid}
            theme={state.theme}
            indicators={state.indicators}
            drawings={state.drawings}
            replayBar={replayBar}
            tradingLines={tradingLines}
            onCrosshairTime={onCrosshairTime}
          />
          <Readout symbol={state.symbol} time={crosshairTime} />
          {activeTool && <ToolHint tool={activeTool} />}
        </div>

        {watchlistOpen && <Watchlist onOpenAlerts={() => setAlertOpen(true)} />}
        {domOpen && <DepthOfMarket symbol={state.symbol} precision={2} />}
        <RightRail panels={panels} onToggle={togglePanel} />
      </div>

      {journalOpen && <JournalPanel onClose={() => setJournalOpen(false)} />}
      {fundamentalsOpen && (
        <FundamentalsPanel
          symbol={state.symbol}
          onClose={() => setFundamentalsOpen(false)}
          onPickSymbol={(symbol) => updateActive({ symbol })}
        />
      )}
      {optionsOpen && <OptionsPanel symbol={state.symbol} onClose={() => setOptionsOpen(false)} />}
      {tradingOpen && <TradingPanel symbol={state.symbol} />}

      <ReplayBar totalBars={historyBars} />

      <IndicatorDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      <PineEditor
        open={pineOpen}
        onClose={() => setPineOpen(false)}
        bars={pineBars}
        symbol={state.symbol}
      />
      {apiKeysOpen && <ApiKeysDialog />}
      <AlertDialog
        open={alertOpen}
        onClose={() => setAlertOpen(false)}
        alerts={alerts.filter((a) => a.symbol === state.symbol)}
        onAdd={addAlert}
        onRemove={removeAlert}
        symbol={state.symbol}
        lastPrice={null}
      />

      <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-[#1e222d] px-3 text-[11px] text-[#787b86]">
        <SourceToggle />
        <FeedStatus />
        <span>
          {state.drawings.length} drawing{state.drawings.length === 1 ? "" : "s"}
        </span>
        <span className="ml-auto flex items-center gap-3">
          <Mt5Setup />
          <span className="uppercase">{state.theme}</span>
        </span>
      </footer>
    </div>
  );
}

const SOURCE_LABEL: Record<ChartSource, string> = {
  ezyview: "EzyView feed",
  mt5: "Broker · MT5",
};

/** Segmented switch between the bundled feed and the connected broker. */
function SourceToggle() {
  const source = useMt5((s) => s.source);
  const setSource = useMt5((s) => s.setSource);
  const [busy, setBusy] = useState(false);

  const pick = (id: ChartSource) => {
    if (busy || id === source) return;
    setBusy(true);
    void setSource(id).finally(() => setBusy(false));
  };

  return (
    <div
      role="group"
      aria-label="Chart price source"
      className="flex items-center rounded border border-[#2a2e39] p-px"
    >
      {(Object.keys(SOURCE_LABEL) as ChartSource[]).map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={source === id}
          disabled={busy}
          onClick={() => pick(id)}
          title={
            id === "mt5"
              ? "Candles, quotes, account and orders from the connected MT5 terminal"
              : "Bundled demo market feed"
          }
          className={
            source === id
              ? `rounded px-2 py-px font-medium text-white ${id === "mt5" ? "bg-[#2962ff]" : "bg-[#1e222d]"}`
              : "rounded px-2 py-px text-[#787b86] hover:text-white"
          }
        >
          {SOURCE_LABEL[id]}
        </button>
      ))}
    </div>
  );
}

/** One dot that says whether the broker feed is answering. */
function FeedStatus() {
  const source = useMt5((s) => s.source);
  const status = useMt5((s) => s.status);
  const error = useMt5((s) => s.error);

  if (source !== "mt5") {
    return (
      <span className="flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-[#26a69a]" aria-hidden />
        demo feed
      </span>
    );
  }

  const dot =
    status === "online" ? "#26a69a" : status === "connecting" ? "#f0b90b" : status === "error" ? "#ef5350" : "#434651";
  const label =
    status === "online" ? "MT5 live" : status === "connecting" ? "MT5 connecting…" : status === "error" ? "MT5 offline" : "MT5";

  return (
    <span className="flex items-center gap-1.5" title={error ?? undefined}>
      <span className="size-1.5 rounded-full" style={{ background: dot }} aria-hidden />
      {label}
    </span>
  );
}

function Readout({ symbol, time }: { symbol: string; time: number | null }) {
  return (
    <div className="pointer-events-none absolute left-2 top-2 text-[11px] text-[#787b86]">
      <span className="font-medium text-white">{symbol}</span>
      {time !== null && <span className="ml-2">{new Date(time * 1000).toLocaleString()}</span>}
    </div>
  );
}

const TOOL_HINTS: Record<string, string> = {
  trend_line: "Click two points",
  ray: "Click the origin and a direction",
  extended_line: "Click two points on the line",
  horizontal_line: "Click once",
  vertical_line: "Click once",
  parallel_channel: "Click the base start, base end, then offset",
  rectangle: "Click two corners",
  ellipse: "Click two opposite corners of the bounding box",
  triangle: "Click three corners",
  fib_retracement: "Click the swing start and end",
  fib_extension: "Click start, end, then the projection anchor",
  arrow: "Click the tail and the head",
  text: "Click where the text should sit",
  brush: "Drag to paint, release to commit",
  measure: "Click the start and end of the range",
  long_position: "Click entry, stop, then target",
  short_position: "Click entry, stop, then target",
};

function ToolHint({ tool }: { tool: string }) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded border border-[#2a2e39] bg-[#131722] px-2.5 py-1 text-[11px] text-[#d1d4dc] shadow-lg">
      {TOOL_HINTS[tool] ?? "Click to place"} · Esc to cancel
    </div>
  );
}
