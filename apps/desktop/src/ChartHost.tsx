import { useEffect, useMemo, useRef, useState } from "react";
import type { Candle, Resolution } from "@ezyview/data-adapters";
import { EzyChart } from "@ezyview/chart-engine";
import type {
  ChartType,
  CompareSeries,
  CrosshairStyleName,
  FundamentalEventOverlay,
  TradingLine,
} from "@ezyview/chart-engine";
import type { Drawing, DrawingToolId, ScreenPoint } from "@ezyview/drawing-tools";
import { isComplete, isPositionTool, visibleOnResolution } from "@ezyview/drawing-tools";
import { HoverCard } from "./ui";
import { EventStripCard } from "./EventStripCard";
import type { EventStripHit } from "@ezyview/chart-engine";
import { THEME_OF, useWorkspace } from "./store";
import type { ActiveIndicator } from "./store";
import type { ChartThemeName, CrosshairModeName, PriceScaleModeName } from "./layout";
import type { DataSourceChoice } from "./chartSource";
import { barsNeeded, rangeStart } from "./chartView";
import { summarizeChart } from "./chartSummary";
import { registerExportSource } from "./exportBridge";
import { compositeCanvasesToPng } from "./chartImage";
import { safeHistory, RESOLUTION_SECONDS, tickerOf } from "./data";
import { createChartHostKit } from "./chartHostKit";
import type { HostContext } from "./chartHostKit";
import { useChartData } from "./useChartData";
import { useChartSync } from "./useChartSync";
import { useDrawingGestures } from "./useDrawingGestures";

export interface Props {
  symbol: string;
  resolution: Resolution;
  chartType: ChartType;
  showVolume: boolean;
  showVolumeProfile?: boolean;
  boxSize?: number | null;
  showGrid: boolean;
  /** Per-axis grid visibility; fall back to `showGrid` when absent. */
  showVertGrid?: boolean;
  showHorzGrid?: boolean;
  /** Canvas settings colours; absent = theme colour. */
  gridVertColor?: string;
  gridHorzColor?: string;
  crosshairColor?: string;
  crosshairStyle?: CrosshairStyleName;
  /** Scales -> symbol last price label; absent = on. */
  showLastPrice?: boolean;
  theme: ChartThemeName;
  indicators: ActiveIndicator[];
  drawings: Drawing[];
  /** Replay cursor: show bars up to and including this index, or null for all. */
  replayBar?: number | null;
  /** Entry/stop/target levels for the open position on this symbol. */
  tradingLines?: TradingLine[];
  /**
   * Which of `tradingLines` a drag may grab, and by what id ("SL"/"TP"). Absent
   * = the levels are display-only, which is right in a detached window and for
   * the entry line.
   */
  draggableLevels?: { id: string; price: number }[];
  /**
   * Session id from `sessionForSymbol`, or absent for no session shading. Bars
   * that fall outside it are washed with the theme's `sessionBand`.
   */
  session?: string | null;
  /** While dragging: the level's preview price, so the chart can redraw it. */
  onLevelPreview?: (symbol: string, id: string, price: number) => void;
  /** On drop: amend the position. Only the dragged level is in the patch. */
  onLevelCommit?: (symbol: string, levels: { stopLoss?: number; takeProfit?: number }) => void;
  /** Earnings markers + macro event lines; absent = none. */
  fundamentalEvents?: FundamentalEventOverlay;
  /** Price feed for this chart; absent or "auto" = the global feed switch. */
  dataSource?: DataSourceChoice;
  /** Crosshair interaction style; absent = normal. */
  crosshairMode?: CrosshairModeName;
  /** Right price-scale rendering; absent = linear. */
  priceScale?: PriceScaleModeName;
  /** Flip the right price scale; absent = off. */
  invertScale?: boolean;
  /** IANA zone for the time axis; absent = exchange/UTC default. */
  timezone?: string;
  /** Draw the symbol/interval watermark; absent = off. */
  watermark?: boolean;
  /** Secondary symbols to overlay on this cell, normalised. */
  compare?: { id: string; symbol: string; color: string; mode: CompareSeries["mode"]; visible?: boolean }[];
  /** Crosshair position mirrored from another cell while sync is on. */
  syncCrosshair?: { time: number; price: number } | null;
  onCrosshairTime?: (time: number | null) => void;
  /** Crosshair source hook: time + price of the pointer, for sync broadcast. */
  onCrosshairMove?: (time: number | null, price: number | null) => void;
  /**
   * Which cell of the active layout this chart is. Placed drawings are saved
   * there; without it (detached windows) drawing tools are inert.
   */
  chartIndex?: number;
  /** Right-click on the plot: viewport position plus the time/price under it. */
  onContextMenu?: (info: { clientX: number; clientY: number; time: number; price: number; drawingId?: string }) => void;
  /** Screen bounding box of the selected drawing, for the floating settings bar. */
  onDrawingBox?: (box: DrawingBox | null) => void;
}

/** Bounding box of a selected drawing in the chart container's pixels. */
export interface DrawingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Hosts one EzyChart instance.
 *
 * The chart lives outside React's render cycle — effects call its setters on
 * prop change, so lightweight-charts never enters reconciliation.
 */

export function ChartHost(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EzyChart | null>(null);
  // The engine reads this at call time, so the latest callback is always used
  // without re-subscribing the chart.
  const crosshairRef = useRef(props.onCrosshairTime);
  crosshairRef.current = props.onCrosshairTime;
  const crosshairMoveRef = useRef(props.onCrosshairMove);
  crosshairMoveRef.current = props.onCrosshairMove;
  const chartIndexRef = useRef(props.chartIndex);
  chartIndexRef.current = props.chartIndex;
  // Export meta (symbol/interval) read at call time so the registered source
  // never serves stale identity after a prop change.
  const propsRef = useRef(props);
  propsRef.current = props;
  // Draggable stop/target levels and their drop handler, read inside the
  // mount-only pointer effect so a new position does not re-subscribe it.
  const levelDragRef = useRef<{ symbol: string; levels: { id: string; price: number }[] } | null>(null);
  levelDragRef.current = props.draggableLevels ? { symbol: props.symbol, levels: props.draggableLevels } : null;
  // Session id + theme, read inside the shading helper so it never needs to be
  // re-created when either changes.
  const sessionRef = useRef<string | null>(props.session ?? null);
  sessionRef.current = props.session ?? null;
  const themeRef = useRef(props.theme);
  themeRef.current = props.theme;

  // In-progress drawing anchors, kept off the store so each pointer move does
  // not trigger a React render.
  const pendingRef = useRef<{ tool: DrawingToolId; points: { time: number; price: number }[] } | null>(null);
  // Guards against a single physical click producing two anchors.
  const drawingInProgressRef = useRef(false);
  const lastClickAtRef = useRef(0);
  /** A Shift-click or marquee already changed selection; ignore the click event. */
  const suppressClickRef = useRef(false);
  // Full loaded history, so replay can reveal a prefix without a refetch.
  const historyRef = useRef<Candle[]>([]);
  // "symbol|interval" the bars in historyRef belong to; live polling waits for
  // it to match the props so a quote is never folded into another series.
  const historyKeyRef = useRef<string | null>(null);
  // The replay-visible slice (what the chart shows), mirrored for the export
  // bridge — exporters must not see bars hidden behind a replay cursor.
  const shownRef = useRef<Candle[]>([]);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  /** Transient strip preview (hover) and the pinned card (click). */
  const [eventHover, setEventHover] = useState<{ hit: EventStripHit; x: number; y: number } | null>(null);
  const [eventPinned, setEventPinned] = useState<{ hit: EventStripHit; x: number; y: number } | null>(null);
  /** Last viewport pointer position, so the engine's hit-only callback can place the card. */
  const mouseRef = useRef({ x: 0, y: 0 });
  const eventHoverRef = useRef<(hit: EventStripHit | null) => void>(() => {});
  eventHoverRef.current = (hit) => {
    setEventHover(hit ? { hit, x: mouseRef.current.x, y: mouseRef.current.y } : null);
  };
  /** Shift-drag selection rectangle, in container pixels. */
  const [marquee, setMarquee] = useState<{ from: ScreenPoint; to: ScreenPoint } | null>(null);

  const hideAllDrawings = useWorkspace((s) => s.hideAllDrawings);
  const selectedIds = useWorkspace((s) => s.selectedDrawingIds);
  const scripts = useWorkspace((s) => s.pineScripts);
  const [shown, setShown] = useState<Candle[]>([]);
  /** Why the history could not be loaded, if it could not. */
  const [loadError, setLoadError] = useState<string | null>(null);
  shownRef.current = shown;
  const onDrawingBoxRef = useRef(props.onDrawingBox);
  onDrawingBoxRef.current = props.onDrawingBox;
  const ctx: HostContext = {
    containerRef,
    chartRef,
    propsRef,
    crosshairRef,
    crosshairMoveRef,
    chartIndexRef,
    levelDragRef,
    sessionRef,
    themeRef,
    pendingRef,
    drawingInProgressRef,
    lastClickAtRef,
    suppressClickRef,
    historyRef,
    historyKeyRef,
    shownRef,
    onDrawingBoxRef,
    setShown,
    setLoadError,
    setGhost,
    setMarquee,
    setFlash,
  };
  const kit = createChartHostKit(ctx);
  const { hitAt, snapAt, finishDrawing, placePosition } = kit;

  // Timeframe visibility and the global hide toggle filter the layer before it
  // reaches the primitive, so hit-testing and rendering always agree.
  const visibleDrawings = useMemo(
    () => (hideAllDrawings ? [] : props.drawings.filter((d) => visibleOnResolution(d, props.resolution))),
    [props.drawings, props.resolution, hideAllDrawings],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = new EzyChart(el, {
      chartType: props.chartType,
      boxSize: props.boxSize ?? null,
      theme: THEME_OF[props.theme],
      onCrosshairTime: (t) => crosshairRef.current?.(t),
      onCrosshairMove: (t, p) => crosshairMoveRef.current?.(t, p),
      onEventHover: (hit) => eventHoverRef.current(hit),
      onClick: (info) => {
        const now = Date.now();
        if (now - lastClickAtRef.current < 150) return;
        lastClickAtRef.current = now;
        // A strip chip pins its preview card; drawing tools stand down.
        if (info.eventHit) {
          setEventPinned({ hit: info.eventHit, x: mouseRef.current.x, y: mouseRef.current.y });
          return;
        }
        setEventPinned(null);
        if (drawingInProgressRef.current) return;
        const st = useWorkspace.getState();
        const tool = st.activeTool;
        const chartIndex = chartIndexRef.current;
        if (chartIndex === undefined) return; // detached windows stay inert
        const hit = hitAt(info.x, info.y, chartIndex);
        if (!tool) {
          if (st.eraserMode) {
            // Eraser navigation deletes the drawing under the pointer at once.
            if (hit) st.deleteDrawing(hit.id, chartIndex);
            return;
          }
          // No tool armed: pointerdown already selected what was clicked
          // (including Shift multi-select). A plain click on empty space clears.
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          if (!hit) {
            st.selectDrawing(null);
            chart.setSelection(null);
          } else if (!st.selectedDrawingIds.includes(hit.id)) {
            st.selectDrawing(hit.id);
            chart.setSelection(hit.id);
          }
          return;
        }
        if (tool === "brush") return; // the pointer gesture owns freehand strokes
        if (info.time === null || info.price === null) {
          setFlash("Click inside the chart area to place a point");
          return;
        }
        if (isPositionTool(tool)) {
          // One click is enough: stop/target come from recent volatility and
          // the width handle can be dragged afterwards.
          placePosition(tool as "long_position" | "short_position", info.time, info.price, chartIndex);
          return;
        }
        drawingInProgressRef.current = true;
        try {
          const point = snapAt({ time: info.time, price: info.price }, st.magnet);
          const pending = pendingRef.current;
          const points = !pending || pending.tool !== tool ? [point] : [...pending.points, point];
          pendingRef.current = { tool, points };
          setGhost({ x: info.x, y: info.y });
          if (isComplete(tool, points)) {
            finishDrawing(tool, points, chartIndex);
          }
        } finally {
          drawingInProgressRef.current = false;
        }
      },
    });
    chartRef.current = chart;
    return () => {
      chart.destroy();
      chartRef.current = null;
    };
    // Mount-only: prop changes are applied by the effects below.
  }, []);

  useDrawingGestures(ctx, kit, props);

  // Export bridge: publish this cell while it is mounted (id = layout cell
  // index). ChartPage points the active source at the focused cell. Detached
  // windows have no cell index — drawings are inert there too — so they never
  // register. The source closes over refs, so every call reads live state.
  useEffect(() => {
    const index = props.chartIndex;
    if (index === undefined) return;
    return registerExportSource(index, {
      // The container compositor, not EzyChart.takeScreenshot(): it matches
      // journal capture and keeps every layer (parity note in chartImage.ts).
      getPng: () => (containerRef.current ? compositeCanvasesToPng(containerRef.current) : null),
      // Replay-visible bars only; historyRef holds the full loaded history.
      getCandles: () => shownRef.current,
      meta: () => ({ symbol: propsRef.current.symbol, resolution: propsRef.current.resolution }),
      view: {
        showRange: async (preset) => {
          // Replay owns the visible bars; loading history under it would reveal the future.
          if (propsRef.current.replayBar != null) return;
          const history = historyRef.current;
          const chart = chartRef.current;
          if (!chart || history.length === 0) return;
          const last = history[history.length - 1]!.time;
          const from = rangeStart(preset, last);
          if (from === null) {
            chart.fitContent();
            return;
          }
          await ensureHistory(from);
          const step = RESOLUTION_SECONDS[propsRef.current.resolution];
          chart.setVisibleTimeRange(from, last + step * 3);
        },
        goTo: async (time) => {
          if (propsRef.current.replayBar != null) return;
          const step = RESOLUTION_SECONDS[propsRef.current.resolution];
          await ensureHistory(time - step * 60);
          chartRef.current?.scrollToTime(time);
        },
        reset: () => chartRef.current?.resetView(),
        autoScale: () => chartRef.current?.autoScalePrice(),
      },
    });
    // Load enough history to reach back to `from` (capped); a symbol or
    // interval change mid-load drops the result.
    async function ensureHistory(from: number): Promise<void> {
      const { symbol, resolution, dataSource } = propsRef.current;
      const history = historyRef.current;
      if (history.length === 0 || history[0]!.time <= from) return;
      const need = barsNeeded(from, history[history.length - 1]!.time, RESOLUTION_SECONDS[resolution]);
      if (need <= history.length) return;
      const more = await safeHistory(symbol, resolution, need, dataSource);
      if (
        propsRef.current.symbol !== symbol ||
        propsRef.current.resolution !== resolution ||
        propsRef.current.dataSource !== dataSource
      )
        return;
      if (more.length <= historyRef.current.length) return;
      if (propsRef.current.replayBar != null) return;
      historyRef.current = more;
      chartRef.current?.setData(more);
      setShown(more);
    }
  }, [props.chartIndex]);

  useChartData(ctx, props);

  useChartSync(ctx, props, { visibleDrawings, selectedIds, scripts, hideAllDrawings });

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2000);
    return () => clearTimeout(t);
  }, [flash]);

  const withProfile = props.showVolumeProfile ?? false;
  const summary = useMemo(
    () => summarizeChart(tickerOf(props.symbol), props.resolution, shown, withProfile),
    [props.symbol, props.resolution, shown, withProfile],
  );
  // Price-only types drop the time axis, so time-aligned layers cannot be drawn on them.
  const typeLabel = PRICE_ONLY_LABEL[props.chartType];
  const hidesLayers = typeLabel !== undefined && (props.showVolume || props.indicators.length > 0 || Object.keys(scripts).length > 0);
  return (
    <>
      <div
        ref={containerRef}
        role="img"
        aria-label={summary}
        className="absolute inset-0"
        data-testid="chart-host"
        onMouseMove={(e) => {
          mouseRef.current = { x: e.clientX, y: e.clientY };
        }}
        onContextMenu={(e) => {
          const handler = propsRef.current.onContextMenu;
          const chart = chartRef.current;
          if (!handler || !chart) return;
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          const price = chart.coordinateToPrice(e.clientY - rect.top);
          if (price === null) return;
          // Past the newest bar there is no time under the cursor; use the newest bar's.
          const time = chart.coordinateToTime(e.clientX - rect.left) ?? historyRef.current.at(-1)?.time;
          if (time === undefined) return;
          // Right-clicking a drawing selects it and gives the menu drawing actions.
          const hit = hitAt(e.clientX - rect.left, e.clientY - rect.top);
          if (hit) {
            useWorkspace.getState().selectDrawing(hit.id);
            chart.setSelection(hit.id);
          }
          handler({ clientX: e.clientX, clientY: e.clientY, time, price, drawingId: hit?.id });
        }}
      />
      {ghost && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-20 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-ev-accent"
          style={{ left: ghost.x, top: ghost.y }}
        />
      )}
      {marquee && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-20 border border-ev-accent bg-ev-accent/10"
          style={{
            left: Math.min(marquee.from.x, marquee.to.x),
            top: Math.min(marquee.from.y, marquee.to.y),
            width: Math.abs(marquee.to.x - marquee.from.x),
            height: Math.abs(marquee.to.y - marquee.from.y),
          }}
        />
      )}
      <p aria-live="polite" className="sr-only">
        {selectedIds.length === 0
          ? "No drawings selected"
          : `${selectedIds.length} of ${visibleDrawings.length} drawings selected`}
      </p>
      {loadError && (
        <div role="alert" className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          <p className="max-w-xs rounded border border-ev-down/40 bg-ev-panel/95 px-3 py-2 text-center text-base text-ev-down-text">
            Could not load {props.symbol}: {loadError}
          </p>
        </div>
      )}
      {flash && (
        <p className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-ev-panel/90 px-2 py-1 text-dense text-ev-muted">
          {flash}
        </p>
      )}
      {(eventPinned ?? eventHover) && (
        <HoverCard
          title={(eventPinned ?? eventHover)!.hit.count === 1 ? (eventPinned ?? eventHover)!.hit.markers[0]!.title : `${(eventPinned ?? eventHover)!.hit.count} events`}
          x={(eventPinned ?? eventHover)!.x}
          y={(eventPinned ?? eventHover)!.y}
          onClose={eventPinned ? () => setEventPinned(null) : undefined}
        >
          <EventStripCard hit={(eventPinned ?? eventHover)!.hit} />
        </HoverCard>
      )}
      {hidesLayers && (
        <p className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-ev-panel/90 px-2 py-1 text-dense text-ev-muted">
          {typeLabel} plots price only, so volume, indicators and Pine plots are hidden.
        </p>
      )}
    </>
  );
}

const PRICE_ONLY_LABEL: Partial<Record<ChartType, string>> = {
  renko: "Renko",
  kagi: "Kagi",
  pnf: "Point & Figure",
  linebreak: "Line Break",
  rangebars: "Range Bars",
};
