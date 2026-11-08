import { useEffect, useState } from "react";
import type { FundamentalEventOverlay, TradingLine } from "@ezyview/chart-engine";
import { ChartHost } from "./ChartHost";
import type { DrawingBox } from "./ChartHost";
import { FloatingDrawingBar } from "./FloatingDrawingBar";
import { cellCount } from "./layout";
import type { GridMode } from "./layout";
import type { ChartState } from "./store";
import { useWorkspace } from "./store";
import { linkGroupOf } from "./linkGroups";
import { sessionForSymbol } from "./sessionFor";
import { precisionForSymbol } from "./pricePrecision";
import { useQuote } from "./quotePoller";
import { useShortcut } from "./shortcuts";
import { getActiveExportSource, setActiveExportSource } from "./exportBridge";
import type { CrosshairMessage } from "./crosshairBus";
import { useTrading } from "./trading";
import { Button, IconButton, Select } from "./ui";
import { SourceWarning } from "./SourceWarning";

const GRID_CLASS: Record<GridMode, string> = {
  "1": "grid-cols-1 grid-rows-1",
  "2h": "grid-cols-2 grid-rows-1",
  "2v": "grid-cols-1 grid-rows-2",
  "4": "grid-cols-2 grid-rows-2",
  "6": "grid-cols-3 grid-rows-2",
  "8": "grid-cols-4 grid-rows-2",
  "9": "grid-cols-3 grid-rows-3",
};

interface ChartGridProps {
  replayBar: number | null;
  linesFor: (symbol: string) => TradingLine[];
  /** Which levels on a symbol a pointer may drag, or undefined = none. */
  draggableLevelsFor: (symbol: string) => { id: string; price: number }[] | undefined;
  onLevelPreview: (symbol: string, id: string, price: number) => void;
  onLevelCommit: (symbol: string, levels: { stopLoss?: number; takeProfit?: number }) => void;
  /** Focused cell's symbol — its overlays apply to matching cells only. */
  activeSymbol: string;
  fundamentalEvents: FundamentalEventOverlay;
  onCrosshairTime: (t: number | null) => void;
  crosshairTime: number | null;
  /** Focused cell's pointer position, mirrored into the other cells. */
  syncCrosshair: { time: number; price: number } | null;
  /** Crosshair from another EzyView window; used for cells on the same symbol. */
  remoteCrosshair: CrosshairMessage | null;
  /** Cell under the pointer; its crosshair is the user's, never a mirror. */
  hoverIndex: number | null;
  onHover: (index: number | null) => void;
  syncOn: boolean;
  onCrosshairMove: (t: number | null, p: number | null) => void;
  onFocus: (index: number) => void;
  onContextMenu: (index: number, info: { clientX: number; clientY: number; time: number; price: number; drawingId?: string }) => void;
  /** Box of the selected drawing in the focused cell, for the floating bar. */
  drawingBox: { index: number; box: DrawingBox } | null;
  onDrawingBox: (index: number, box: DrawingBox | null) => void;
}

/**
 * The layout's chart cells. Each cell keeps its own symbol and interval; the
 * focused one (blue outline) is what the toolbar, studies and drawings act on.
 */
export function ChartGrid({
  replayBar,
  linesFor,
  draggableLevelsFor,
  onLevelPreview,
  onLevelCommit,
  activeSymbol,
  fundamentalEvents,
  onCrosshairTime,
  crosshairTime,
  syncCrosshair,
  remoteCrosshair,
  hoverIndex,
  onHover,
  syncOn,
  onCrosshairMove,
  onFocus,
  onContextMenu,
  drawingBox,
  onDrawingBox,
}: ChartGridProps) {
  const [maximizedCell, setMaximizedCell] = useState<number | null>(null);
  // The grid owns the layout subscription, not the page that renders it: the
  // grid has to redraw a cell whose drawings changed, but the page around it
  // does not, and one subscription for the pair would drag the page along.
  const layout = useWorkspace((s) => s.activeLayout());
  const cells: ChartState[] = layout.charts.slice(0, cellCount(layout.grid));
  const multi = cells.length > 1;

  // Alt+Enter toggles single-cell maximize
  useShortcut({
    id: "chart.maximize-cell",
    combo: "Alt+Enter",
    when: () => layout.grid !== "1",
    run: () => setMaximizedCell((cur) => (cur === null ? layout.activeChart : null)),
  });

  // The focused cell's link group. When it has one, the crosshair mirror stays
  // inside that group; when it has none, the mirror keeps reaching every cell.
  const focusedGroup = linkGroupOf(cells[layout.activeChart] ?? {});
  const remoteFor = (symbol: string) =>
    remoteCrosshair && remoteCrosshair.symbol === symbol && remoteCrosshair.time !== null && remoteCrosshair.price !== null
      ? { time: remoteCrosshair.time, price: remoteCrosshair.price }
      : null;
  // Export acts on the focused cell (the same `index === layout.activeChart`
  // test each cell uses below): its bridge id is the cell index. This lives in
  // the component body — a hook cannot run inside the cells.map callback —
  // and runs after ChartHost's registration effect, child-before-parent.
  useEffect(() => {
    setActiveExportSource(layout.activeChart);
  }, [layout.activeChart]);

  const renderCells = maximizedCell !== null ? [cells[maximizedCell] ?? cells[0]!] : cells;
  const gridClass = maximizedCell !== null ? "grid-cols-1 grid-rows-1" : GRID_CLASS[layout.grid];

  return (
    <div className={`absolute inset-0 grid gap-px bg-ev-raised ${gridClass}`}>
      {renderCells.map((chart, i) => {
        const index = maximizedCell !== null ? maximizedCell : i;
        const focused = index === layout.activeChart;
        return (
          <section
            key={index}
            aria-label={`Chart ${index + 1}: ${chart.symbol} ${chart.resolution}`}
            aria-current={multi && focused ? "true" : undefined}
            // Capture so focus moves before the chart handles the click.
            onPointerDownCapture={() => onFocus(index)}
            onFocusCapture={() => onFocus(index)}
            onPointerEnter={() => onHover(index)}
            onPointerLeave={() => onHover(null)}
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
              showVertGrid={chart.showVertGrid ?? chart.chartSettings?.canvas.vertGridLines}
              showHorzGrid={chart.showHorzGrid ?? chart.chartSettings?.canvas.horzGridLines}
              gridVertColor={chart.chartSettings?.canvas.vertGridColor}
              gridHorzColor={chart.chartSettings?.canvas.horzGridColor}
              crosshairColor={chart.chartSettings?.canvas.crosshairColor}
              crosshairStyle={chart.chartSettings?.canvas.crosshairStyle}
              showLastPrice={chart.chartSettings?.scales.symbolLastPriceLabel ?? true}
              theme={chart.theme}
              indicators={chart.indicators}
              drawings={chart.drawings}
              replayBar={focused ? replayBar : null}
              tradingLines={linesFor(chart.symbol)}
              session={chart.showSessionBreaks !== false ? sessionForSymbol(chart.symbol) : null}
              draggableLevels={focused ? draggableLevelsFor(chart.symbol) : undefined}
              onLevelPreview={onLevelPreview}
              onLevelCommit={onLevelCommit}
              fundamentalEvents={chart.symbol === activeSymbol ? fundamentalEvents : undefined}
              crosshairMode={chart.crosshairMode}
              priceScale={chart.priceScale}
              invertScale={chart.invertScale}
              timezone={chart.timezone}
              dataSource={chart.dataSource}
              compare={chart.compare}
              watermark={chart.watermark}
              syncCrosshair={
                !syncOn || hoverIndex === index
                  ? null
                  : focused
                    ? remoteFor(chart.symbol)
                    : focusedGroup && linkGroupOf(chart) !== focusedGroup
                      ? // A linked cell mirrors only into its own group.
                        null
                      : (syncCrosshair ?? remoteFor(chart.symbol))
              }
              onContextMenu={(info) => onContextMenu(index, info)}
              onCrosshairTime={focused ? onCrosshairTime : undefined}
              onCrosshairMove={focused ? onCrosshairMove : undefined}
              onDrawingBox={focused ? (box) => onDrawingBox(index, box) : undefined}
            />
            {focused && <FloatingDrawingBar anchor={drawingBox?.index === index ? drawingBox.box : null} />}
            <Readout
              symbol={multi ? `${chart.symbol} · ${chart.resolution}` : chart.symbol}
              rawSymbol={chart.symbol}
              time={focused ? crosshairTime : null}
              indicators={chart.indicators}
              showGrid={chart.showGrid}
              showVolume={chart.showVolume}
              focused={focused}
              chartIndex={index}
              multi={multi}
              isMaximized={maximizedCell !== null}
              onToggleMaximize={() => setMaximizedCell((cur) => (cur === null ? index : null))}
              dataSource={chart.dataSource}
            />
            {multi && focused && (
              <div className="pointer-events-none absolute inset-0 z-10 ring-1 ring-inset ring-ev-accent" aria-hidden />
            )}
          </section>
        );
      })}
    </div>
  );
}

function Readout({
  symbol,
  rawSymbol,
  time,
  indicators,
  showGrid,
  showVolume,
  focused = true,
  chartIndex,
  multi = false,
  isMaximized = false,
  onToggleMaximize,
  dataSource,
}: {
  symbol: string;
  rawSymbol: string;
  time: number | null;
  indicators: ChartState["indicators"];
  showGrid: boolean;
  showVolume: boolean;
  focused?: boolean;
  chartIndex?: number;
  multi?: boolean;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  dataSource?: ChartState["dataSource"];
}) {
  const submit = useTrading((s) => s.submit);
  const updateIndicator = useWorkspace((s) => s.updateIndicator);
  const removeIndicator = useWorkspace((s) => s.removeIndicator);
  const addIndicator = useWorkspace((s) => s.addIndicator);
  const updateChart = useWorkspace((s) => s.updateChart);
  const activeIndex = useWorkspace((s) => s.activeLayout().activeChart);
  const targetIndex = chartIndex ?? activeIndex;
  const watchedPrice = useWorkspace((s) => s.watchlist.find((w) => w.symbol === rawSymbol)?.price ?? null);
  const { quote } = useQuote(rawSymbol, { source: dataSource, intervalMs: 2000 });

  const [qty, setQty] = useState<number>(1);
  const [collapsed, setCollapsed] = useState(false);
  const [tradeBoxVisible, setTradeBoxVisible] = useState(true);
  const [studyQuickOpen, setStudyQuickOpen] = useState(false);
  const [floatHudVisible, setFloatHudVisible] = useState(true);

  const displayPrice = quote?.last ?? watchedPrice;
  const liveChangePct = quote?.changePercent ?? null;
  const digits = precisionForSymbol(rawSymbol, displayPrice);
  const spread = displayPrice !== null ? Math.max(Math.pow(10, -digits) * 2, displayPrice * 0.00015) : 0;
  const bid = displayPrice !== null ? (displayPrice - spread / 2).toFixed(digits) : null;
  const ask = displayPrice !== null ? (displayPrice + spread / 2).toFixed(digits) : null;

  return (
    <>
      <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-col gap-1.5 text-dense text-ev-muted">
        {/* Top Symbol + Live Price + Quick Controls Row */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded bg-ev-bg/85 px-2 py-1 backdrop-blur-xs">
          <IconButton
            size="sm"
            label="Chart legend"
            title={collapsed ? "Expand chart legend" : "Collapse chart legend"}
            aria-expanded={!collapsed}
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed((v) => !v);
            }}
          >
            <span aria-hidden>{collapsed ? "▸" : "▾"}</span>
          </IconButton>
          {multi && onToggleMaximize && (
            <IconButton
              size="sm"
              label="Maximize chart"
              title={isMaximized ? "Restore grid (Alt+Enter)" : "Maximize chart (Alt+Enter)"}
              aria-pressed={isMaximized}
              onClick={(e) => {
                e.stopPropagation();
                onToggleMaximize();
              }}
            >
              <span aria-hidden>{isMaximized ? "⤡" : "⤢"}</span>
            </IconButton>
          )}
          <span role="status" className="sr-only">
            {multi && onToggleMaximize ? (isMaximized ? "Chart maximized" : "Chart grid restored") : ""}
            {collapsed ? ". Legend collapsed" : ""}
          </span>
          <span className="font-semibold text-ev-strong">{symbol}</span>
          {displayPrice !== null && (
            <span className="num font-semibold text-ev-strong">{displayPrice.toFixed(digits)}</span>
          )}
          {liveChangePct !== null && (
            <span className={`num text-micro font-medium ${liveChangePct >= 0 ? "text-ev-up-text" : "text-ev-down-text"}`}>
              {liveChangePct >= 0 ? "+" : ""}
              {liveChangePct.toFixed(2)}%
            </span>
          )}
          {time !== null && <span className="text-micro text-ev-faint">{new Date(time * 1000).toLocaleString()}</span>}

          <Button
            size="sm"
            variant="ghost"
            title={tradeBoxVisible ? "Hide 1-click Buy/Sell buttons" : "Show 1-click Buy/Sell buttons"}
            aria-pressed={tradeBoxVisible}
            onClick={(e) => {
              e.stopPropagation();
              setTradeBoxVisible((v) => !v);
            }}
            className={tradeBoxVisible ? "bg-ev-accent/15 text-ev-accent-text" : undefined}
          >
            B/S
          </Button>

          <div className="relative">
            <Button
              size="sm"
              variant="outline"
              title="Quickly add popular indicator to chart"
              onClick={(e) => {
                e.stopPropagation();
                setStudyQuickOpen((v) => !v);
              }}
            >
              + Study ▾
            </Button>
            {studyQuickOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute left-0 top-full z-20 mt-1 flex w-36 flex-col rounded border border-ev-line bg-ev-panel py-1 shadow-xl"
              >
                {[
                  { id: "ema", label: "EMA (20)" },
                  { id: "sma", label: "SMA (20)" },
                  { id: "rsi", label: "RSI (14)" },
                  { id: "bb", label: "Bollinger Bands" },
                  { id: "macd", label: "MACD" },
                  { id: "vwap", label: "VWAP" },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      addIndicator(s.id);
                      setStudyQuickOpen(false);
                    }}
                    className="px-2.5 py-1 text-left text-dense text-ev-text hover:bg-ev-raised hover:text-ev-strong"
                  >
                    + {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* TradingView-style 1-Click Bid / Qty / Ask Trade Box (hideable) */}
        {!collapsed && tradeBoxVisible && (
          <div className="pointer-events-auto flex items-center gap-1">
            <button
              type="button"
              title={`Quick market sell ${qty} of ${rawSymbol}`}
              onClick={(e) => {
                e.stopPropagation();
                void submit({ symbol: rawSymbol, side: "sell", type: "market", qty });
              }}
              className="flex items-center gap-1.5 rounded border border-ev-down/60 bg-ev-down/15 px-2 py-0.5 text-micro font-semibold text-ev-down-text shadow-xs hover:bg-ev-down hover:text-white"
            >
              <span>SELL</span>
              {bid && <span className="num font-bold">{bid}</span>}
            </button>

            <span onClick={(e) => e.stopPropagation()}>
              <Select
                label="Quick order quantity"
                size="sm"
                className="h-5 w-16 num text-micro"
                value={String(qty)}
                onChange={(v) => setQty(Number(v))}
                options={[0.01, 0.1, 0.5, 1, 2, 5, 10].map((v) => ({ value: String(v), label: String(v) }))}
              />
            </span>

            <button
              type="button"
              title={`Quick market buy ${qty} of ${rawSymbol}`}
              onClick={(e) => {
                e.stopPropagation();
                void submit({ symbol: rawSymbol, side: "buy", type: "market", qty });
              }}
              className="flex items-center gap-1.5 rounded border border-ev-up/60 bg-ev-up/15 px-2 py-0.5 text-micro font-semibold text-ev-up-text shadow-xs hover:bg-ev-up hover:text-white"
            >
              <span>BUY</span>
              {ask && <span className="num font-bold">{ask}</span>}
            </button>
          </div>
        )}
        {!collapsed && tradeBoxVisible && <SourceWarning source={dataSource} className="pointer-events-auto rounded bg-ev-bg/85 px-2 py-0.5" />}

        {/* Active Study Legend Chips */}
        {!collapsed && indicators.length > 0 && (
          <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
            {indicators.map((ind) => (
              <span
                key={ind.uid}
                className={`inline-flex items-center gap-1 rounded border border-ev-line/60 bg-ev-panel/90 px-1.5 py-0.5 text-micro shadow-xs ${
                  ind.hidden ? "text-ev-faint line-through" : "text-ev-text"
                }`}
              >
                <button
                  type="button"
                  title={ind.hidden ? `Show ${ind.def.name}` : `Hide ${ind.def.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateIndicator(ind.uid, { hidden: !ind.hidden });
                  }}
                  className="hover:text-ev-strong"
                >
                  {ind.name ?? ind.def.name}
                  {Object.keys(ind.params).length > 0 && ` (${Object.values(ind.params).join(",")})`}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${ind.name ?? ind.def.name}`}
                  title="Remove indicator"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeIndicator(ind.uid);
                  }}
                  className="text-ev-faint hover:text-ev-down-text"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Hideable Floating Bottom-Center Chart Controls Pill (TradingView style) - focused cell only */}
      {focused && (
        <div className="pointer-events-auto absolute bottom-8 left-1/2 z-10 -translate-x-1/2">
          {floatHudVisible ? (
            <div className="flex items-center gap-1 rounded-full border border-ev-line bg-ev-panel/90 px-2.5 py-0.5 text-micro text-ev-muted shadow-lg backdrop-blur-xs">
              <Button
                size="sm"
                variant="ghost"
                title="Reset chart zoom & scroll"
                onClick={(e) => {
                  e.stopPropagation();
                  getActiveExportSource()?.view?.reset();
                }}
                className="px-1.5 py-0.5 text-micro"
              >
                Reset view
              </Button>
              <Button
                size="sm"
                variant="ghost"
                title="Fit price scale to visible bars"
                onClick={(e) => {
                  e.stopPropagation();
                  getActiveExportSource()?.view?.autoScale();
                }}
                className="px-1.5 py-0.5 text-micro"
              >
                Auto fit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-pressed={showGrid}
                title="Toggle chart grid lines"
                onClick={(e) => {
                  e.stopPropagation();
                  updateChart(targetIndex, { showGrid: !showGrid });
                }}
                className={`px-1.5 py-0.5 text-micro ${showGrid ? "text-ev-accent-text" : ""}`}
              >
                Grid
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-pressed={showVolume}
                title="Toggle volume histogram"
                onClick={(e) => {
                  e.stopPropagation();
                  updateChart(targetIndex, { showVolume: !showVolume });
                }}
                className={`px-1.5 py-0.5 text-micro ${showVolume ? "text-ev-accent-text" : ""}`}
              >
                Vol
              </Button>
              <IconButton
                size="sm"
                label="Hide floating chart controls"
                onClick={(e) => {
                  e.stopPropagation();
                  setFloatHudVisible(false);
                }}
                className="ml-0.5 text-ev-faint"
              >
                <span aria-hidden>×</span>
              </IconButton>
            </div>
          ) : (
            <IconButton
              size="sm"
              label="Show floating chart controls"
              onClick={(e) => {
                e.stopPropagation();
                setFloatHudVisible(true);
              }}
              className="rounded-full border border-ev-line bg-ev-panel/75 px-2 py-0.5 text-micro text-ev-faint"
            >
              <span aria-hidden>•••</span>
            </IconButton>
          )}
        </div>
      )}
    </>
  );
}

