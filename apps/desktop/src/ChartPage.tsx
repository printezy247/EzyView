import { useCallback, useEffect, useMemo, useState } from "react";
import type { TradingLine } from "@ezyview/chart-engine";
import { ChartHost } from "./ChartHost";
import { ChartCommandInput } from "./ChartCommandInput";
import { DrawingToolbar } from "./DrawingToolbar";
import { ReplayBar } from "./ReplayBar";
import { RightRail } from "./RightRail";
import type { PanelId } from "./Toolbar";
import { DepthOfMarket } from "./DepthOfMarket";
import { TradingPanel } from "./TradingPanel";
import { Watchlist } from "./Watchlist";
import { activeChartOf, cellCount } from "./layout";
import type { Layout } from "./store";
import type { GridMode } from "./layout";
import { ObjectTree } from "./ObjectTree";
import { loadHistory } from "./data";
import { useWorkspace } from "./store";
import type { ChartState } from "./store";
import { useTrading, useTradingTicks } from "./trading";

interface ChartPageProps {
  watchlistOpen: boolean;
  domOpen: boolean;
  objectsOpen: boolean;
  tradingOpen: boolean;
  onToggle: (id: PanelId) => void;
  onOpenAlerts: () => void;
}

/**
 * The chart workspace: grid, drawing toolbar, side panels, trading ticket,
 * replay bar and the quick command input. Navigation destinations live on
 * their own routes; only these side panels stay page-local booleans.
 */
export function ChartPage({ watchlistOpen, domOpen, objectsOpen, tradingOpen, onToggle, onOpenAlerts }: ChartPageProps) {
  const layout = useWorkspace((s) => s.activeLayout());
  const state = activeChartOf(layout);
  const setActiveChart = useWorkspace((s) => s.setActiveChart);
  const updateActive = useWorkspace((s) => s.updateActive);
  const activeTool = useWorkspace((s) => s.activeTool);
  const replayBar = useWorkspace((s) => s.replayBar);
  const setReplay = useWorkspace((s) => s.setReplay);
  const positions = useTrading((s) => s.positions);
  const orders = useTrading((s) => s.orders);

  const watchlist = useWorkspace((s) => s.watchlist);
  const symbols = watchlist.map((w) => w.symbol);
  const [commandOpen, setCommandOpen] = useState(false);
  const [historyBars, setHistoryBars] = useState(0);
  const [crosshairTime, setCrosshairTime] = useState<number | null>(null);

  const onCrosshairTime = useCallback((t: number | null) => setCrosshairTime(t), []);

  // The replay transport needs the bar count for its slider range.
  useEffect(() => {
    let cancelled = false;
    setReplay(null);
    void loadHistory(state.symbol, state.resolution).then((candles) => {
      if (!cancelled) setHistoryBars(candles.length);
    });
    return () => {
      cancelled = true;
    };
  }, [state.symbol, state.resolution, setReplay]);

  // Escape clears the armed drawing tool, like TradingView.
  // Undo/redo: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z. "/" or Ctrl+K opens commands.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.key === "Escape") {
        useWorkspace.getState().setActiveTool(null);
        useWorkspace.getState().selectDrawing(null);
        setCommandOpen(false);
        return;
      }
      // Delete/Backspace removes the selected drawing (the input guard above
      // keeps this from firing while typing or editing in Monaco).
      if (e.key === "Delete" || e.key === "Backspace") {
        const id = useWorkspace.getState().selectedDrawingId;
        if (id) {
          e.preventDefault();
          useWorkspace.getState().deleteDrawing(id);
        }
        return;
      }
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setCommandOpen(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((v) => !v);
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        useWorkspace.getState().undoDrawing();
      } else if (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey)) {
        e.preventDefault();
        useWorkspace.getState().redoDrawing();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The engine only needs ticks where it has something at stake: an open
  // position or a resting order, plus the chart's symbol while the ticket can
  // be used to open one.
  const exposure = new Set<string>(positions.map((p) => p.symbol));
  for (const order of orders) exposure.add(order.symbol);
  if (tradingOpen) exposure.add(state.symbol);
  useTradingTicks([...exposure].join("|"));

  // Entry/stop/target for the position on this chart, as constant price lines.
  // Built once per positions change, so each cell gets a stable array and the
  // chart only redraws its lines when a fill actually changes them.
  const linesBySymbol = useMemo(() => {
    const out = new Map<string, TradingLine[]>();
    for (const position of positions) {
      const lines: TradingLine[] = [
        { price: position.entryPrice, color: "#2962ff", title: position.side === "long" ? "LONG" : "SHORT" },
      ];
      if (position.stopLoss !== undefined) {
        lines.push({ price: position.stopLoss, color: "#ef5350", title: "SL", dashed: true });
      }
      if (position.takeProfit !== undefined) {
        lines.push({ price: position.takeProfit, color: "#26a69a", title: "TP", dashed: true });
      }
      if (!out.has(position.symbol)) out.set(position.symbol, lines);
    }
    return out;
  }, [positions]);
  const linesFor = useCallback((symbol: string) => linesBySymbol.get(symbol) ?? NO_LINES, [linesBySymbol]);

  return (
    <>
      <div className="relative flex min-h-0 flex-1">
        <DrawingToolbar />

        <main aria-label="Charts" className="relative min-w-0 flex-1">
          <ChartGrid
            layout={layout}
            replayBar={replayBar}
            linesFor={linesFor}
            onCrosshairTime={onCrosshairTime}
            crosshairTime={crosshairTime}
            onFocus={setActiveChart}
          />
          {activeTool && <ToolHint tool={activeTool} />}
          {commandOpen && (
            <ChartCommandInput
              open={commandOpen}
              symbols={symbols}
              currentSymbol={state.symbol}
              currentResolution={state.resolution}
              onClose={() => setCommandOpen(false)}
              onApply={(symbol, resolution) => updateActive({ symbol, resolution: resolution as never })}
            />
          )}
        </main>

        {objectsOpen && <ObjectTree onClose={() => onToggle("objects")} />}
        {watchlistOpen && <Watchlist onOpenAlerts={onOpenAlerts} />}
        {domOpen && <DepthOfMarket symbol={state.symbol} precision={2} />}
        <RightRail panels={{ watchlist: watchlistOpen, depth: domOpen, objects: objectsOpen, trading: tradingOpen }} onToggle={onToggle} />
      </div>

      {tradingOpen && <TradingPanel symbol={state.symbol} />}

      <ReplayBar totalBars={historyBars} />
    </>
  );
}

const NO_LINES: TradingLine[] = [];

const GRID_CLASS: Record<GridMode, string> = {
  "1": "grid-cols-1 grid-rows-1",
  "2h": "grid-cols-2 grid-rows-1",
  "2v": "grid-cols-1 grid-rows-2",
  "4": "grid-cols-2 grid-rows-2",
};

interface ChartGridProps {
  layout: Layout;
  replayBar: number | null;
  linesFor: (symbol: string) => TradingLine[];
  onCrosshairTime: (t: number | null) => void;
  crosshairTime: number | null;
  onFocus: (index: number) => void;
}

/**
 * The layout's chart cells. Each cell keeps its own symbol and interval; the
 * focused one (blue outline) is what the toolbar, studies and drawings act on.
 */
function ChartGrid({ layout, replayBar, linesFor, onCrosshairTime, crosshairTime, onFocus }: ChartGridProps) {
  const cells: ChartState[] = layout.charts.slice(0, cellCount(layout.grid));
  const multi = cells.length > 1;
  return (
    <div className={`absolute inset-0 grid gap-px bg-ev-raised ${GRID_CLASS[layout.grid]}`}>
      {cells.map((chart, index) => {
        const focused = index === layout.activeChart;
        return (
          <section
            key={index}
            aria-label={`Chart ${index + 1}: ${chart.symbol} ${chart.resolution}`}
            aria-current={multi && focused ? "true" : undefined}
            // Capture so focus moves before the chart handles the click.
            onPointerDownCapture={() => onFocus(index)}
            className="relative min-h-0 min-w-0 bg-ev-bg"
          >
            <ChartHost
              key={`${layout.id}:${index}`}
              chartIndex={index}
              symbol={chart.symbol}
              resolution={chart.resolution}
              chartType={chart.chartType}
              showVolume={chart.showVolume}
              showVolumeProfile={chart.showVolumeProfile ?? false}
              boxSize={chart.boxSize ?? null}
              showGrid={chart.showGrid}
              theme={chart.theme}
              indicators={chart.indicators}
              drawings={chart.drawings}
              replayBar={focused ? replayBar : null}
              tradingLines={linesFor(chart.symbol)}
              onCrosshairTime={focused ? onCrosshairTime : undefined}
            />
            <Readout symbol={multi ? `${chart.symbol} · ${chart.resolution}` : chart.symbol} time={focused ? crosshairTime : null} />
            {multi && focused && (
              <div className="pointer-events-none absolute inset-0 z-10 ring-1 ring-inset ring-ev-accent" aria-hidden />
            )}
          </section>
        );
      })}
    </div>
  );
}

function Readout({ symbol, time }: { symbol: string; time: number | null }) {
  return (
    <div className="pointer-events-none absolute left-2 top-2 z-10 text-[11px] text-ev-muted">
      <span className="font-medium text-ev-strong">{symbol}</span>
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
    <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded border border-ev-line bg-ev-panel px-2.5 py-1 text-[11px] text-ev-text shadow-lg">
      {TOOL_HINTS[tool] ?? "Click to place"} · Esc to cancel
    </div>
  );
}
