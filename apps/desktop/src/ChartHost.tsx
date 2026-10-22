import { useEffect, useMemo, useRef, useState } from "react";
import type { Candle, Resolution } from "@ezyview/data-adapters";
import { EzyChart } from "@ezyview/chart-engine";
import type { ChartType, FundamentalEventOverlay, IndicatorInstance, ScriptPlotSpec, TradingLine } from "@ezyview/chart-engine";
import type { Drawing, DrawingToolId } from "@ezyview/drawing-tools";
import { hitTestAll, isComplete, setAnchor, snapToOhlc, translateDrawing } from "@ezyview/drawing-tools";
import { hitTestLevel, moveLevel } from "./priceDrag";
import { DEFAULT_DRAWING_STYLE } from "@ezyview/drawing-tools";
import type { PinePlot } from "@ezyview/pine-transpiler";
import { THEME_OF, uid as newId, useWorkspace } from "./store";
import type { ActiveIndicator, PineScriptRecord } from "./store";
import type { ChartThemeName, CrosshairModeName, PriceScaleModeName } from "./layout";
import { brokerFeed, loadHistory, quoteOf, RESOLUTION_SECONDS, tickerOf } from "./data";
import { barsNeeded, rangeStart } from "./chartView";
import { mergeQuote } from "./liveBars";
import { summarizeChart } from "./chartSummary";
import { EMPTY_FUNDAMENTAL_EVENTS } from "./fundamentalEvents";
import { registerExportSource } from "./exportBridge";
import { compositeCanvasesToPng } from "./chartImage";

interface Props {
  symbol: string;
  resolution: Resolution;
  chartType: ChartType;
  showVolume: boolean;
  showVolumeProfile?: boolean;
  boxSize?: number | null;
  showGrid: boolean;
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
  onContextMenu?: (info: { clientX: number; clientY: number; time: number; price: number }) => void;
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
  const onLevelPreview = props.onLevelPreview;
  const onLevelCommit = props.onLevelCommit;
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

  const activeTool = useWorkspace((s) => s.activeTool);
  const setDrawings = useWorkspace((s) => s.setDrawings);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = new EzyChart(el, {
      chartType: props.chartType,
      boxSize: props.boxSize ?? null,
      theme: THEME_OF[props.theme],
      onCrosshairTime: (t) => crosshairRef.current?.(t),
      onCrosshairMove: (t, p) => crosshairMoveRef.current?.(t, p),
      onClick: (info) => {
        const now = Date.now();
        if (now - lastClickAtRef.current < 150) return;
        lastClickAtRef.current = now;
        if (drawingInProgressRef.current) return;
        const { activeTool: tool, magnet } = useWorkspace.getState();
        const chartIndex = chartIndexRef.current;
        if (chartIndex === undefined) return; // detached windows stay inert
        if (!tool) {
          // No tool armed: select what was clicked, or clear on empty space.
          const drawings = useWorkspace.getState().activeLayout().charts[chartIndex]?.drawings ?? [];
          const hit = hitTestAll(
            drawings.map((d) => ({ drawing: d, screen: chart.projectDrawing(d) })),
            { x: info.x, y: info.y },
          );
          useWorkspace.getState().selectDrawing(hit?.id ?? null);
          chart.setSelection(hit?.id ?? null);
          return;
        }
        if (info.time === null || info.price === null) {
          setFlash("Click inside the chart area to place a point");
          return;
        }
        drawingInProgressRef.current = true;
        try {
          const point = snapToOhlc({ time: info.time, price: info.price }, historyRef.current, magnet);
          const pending = pendingRef.current;
          const points =
            !pending || pending.tool !== tool ? [point] : [...pending.points, point];
          pendingRef.current = { tool, points };
          setGhost({ x: info.x, y: info.y });
          if (isComplete(tool, points)) {
            const drawings = useWorkspace.getState().activeLayout().charts[chartIndex]?.drawings ?? [];
            setDrawings(
              [...drawings, { id: newId(), tool, points, style: { ...DEFAULT_DRAWING_STYLE } }],
              chartIndex,
            );
            pendingRef.current = null;
            setGhost(null);
            useWorkspace.getState().setActiveTool(null);
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

  // Select-and-drag when no tool is armed. The pointerdown listener runs in
  // the capture phase, before lightweight-charts' own canvas listeners, so a
  // grab on a drawing stops the event there and the chart never starts panning.
  //
  // Two gestures share the effect because only one can be active at a time and
  // both need the same capture/release-pan bookkeeping: dragging a drawing, and
  // dragging a position's stop/target level.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    type Drag = {
      kind: "drawing";
      id: string;
      /** 0-based anchor index, or -1 for the body. */
      handle: number;
      /** Pre-drag drawings, pushed as one undo entry when the drag ends. */
      snapshot: Drawing[];
      startPoint: { time: number; price: number };
      moved: boolean;
    };
    type LevelDrag = {
      kind: "level";
      /** "SL" or "TP". */
      id: string;
      symbol: string;
      /** Where the line should be drawn while dragging; null until the first move. */
      preview: number | null;
    };
    let gesture: Drag | LevelDrag | null = null;

    const localPoint = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const chart = chartRef.current;
      const chartIndex = chartIndexRef.current;
      if (!chart || chartIndex === undefined) return;
      const st = useWorkspace.getState();
      if (st.activeTool) return;
      const pt = localPoint(e);

      // A stop/target line sits on top of the drawings, so it gets first refusal
      // on a grab: the same pixel could otherwise start a drawing drag.
      const levels = levelDragRef.current;
      if (levels) {
        const projected = levels.levels.map((l) => ({ ...l, y: chart.priceToCoordinate(l.price) }));
        const hitLevel = hitTestLevel(projected, pt.y);
        if (hitLevel) {
          e.stopPropagation();
          gesture = { kind: "level", id: hitLevel.id, symbol: levels.symbol, preview: null };
          el.setPointerCapture(e.pointerId);
          chart.setPanEnabled(false);
          return;
        }
      }

      const drawings = st.activeLayout().charts[chartIndex]?.drawings ?? [];
      if (drawings.length === 0) return;
      const hit = hitTestAll(
        drawings.map((d) => ({ drawing: d, screen: chart.projectDrawing(d) })),
        pt,
      );
      if (!hit) return;
      e.stopPropagation();
      st.selectDrawing(hit.id);
      chart.setSelection(hit.id);
      const target = drawings.find((d) => d.id === hit.id);
      if (!target || target.locked) return;
      const start = chart.screenToTimePrice(pt.x, pt.y);
      if (!start.ok || start.time === null || start.price === null) return;
      gesture = {
        kind: "drawing",
        id: hit.id,
        handle: hit.handle,
        snapshot: [...drawings], // entries are immutable; the array copy is the boundary
        startPoint: { time: start.time, price: start.price },
        moved: false,
      };
      el.setPointerCapture(e.pointerId);
      chart.setPanEnabled(false);
    };

    const onMove = (e: PointerEvent) => {
      const cur = gesture;
      if (!cur) return;
      const chart = chartRef.current;
      if (!chart) return;
      const pt = localPoint(e);

      if (cur.kind === "level") {
        // The line follows the pointer visually; the position is only amended on
        // pointerup, so a stray click never moves a stop.
        const price = moveLevel({ id: cur.id, price: 0, y: null }, chart.coordinateToPrice(pt.y));
        if (price !== null) {
          cur.preview = price;
          onLevelPreview?.(cur.symbol, cur.id, price);
        }
        e.preventDefault();
        return;
      }

      const chartIndex = chartIndexRef.current;
      if (chartIndex === undefined) return;
      const conv = chart.screenToTimePrice(pt.x, pt.y);
      if (!conv.ok || conv.time === null || conv.price === null) return;
      const st = useWorkspace.getState();
      const target = cur.snapshot.find((d) => d.id === cur.id);
      if (!target) return;
      let points: { time: number; price: number }[];
      if (cur.handle >= 0) {
        const want = { time: conv.time, price: conv.price };
        const effectiveMagnet = e.ctrlKey || e.metaKey ? (st.magnet === "off" ? "weak" : "off") : st.magnet;
        const snapped = effectiveMagnet === "off" ? want : snapToOhlc(want, historyRef.current, effectiveMagnet);
        points = setAnchor(target, cur.handle, snapped).points;
        if (e.shiftKey && points.length === 2 && (target.tool === "trend_line" || target.tool === "ray" || target.tool === "extended_line")) {
          const otherIdx = cur.handle === 0 ? 1 : 0;
          points[cur.handle] = { time: snapped.time, price: points[otherIdx]!.price };
        }
      } else {
        points = translateDrawing(target, conv.time - cur.startPoint.time, conv.price - cur.startPoint.price).points;
      }
      st.previewDrawing(cur.id, { points }, chartIndex);
      cur.moved = true;
      e.preventDefault();
    };

    const onFinish = (e: PointerEvent) => {
      const cur = gesture;
      if (!cur) return;
      if (cur.kind === "level") {
        if (cur.preview !== null) {
          // One amend carrying only the dragged level, so the other one stays put.
          onLevelCommit?.(cur.symbol, cur.id === "SL" ? { stopLoss: cur.preview } : { takeProfit: cur.preview });
        }
      } else {
        const chartIndex = chartIndexRef.current;
        if (cur.moved && chartIndex !== undefined) {
          useWorkspace.getState().commitDrawingHistory(cur.snapshot, chartIndex);
        }
      }
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        // Capture can already be gone (e.g. the window lost the pointer).
      }
      chartRef.current?.setPanEnabled(true);
      gesture = null;
    };

    el.addEventListener("pointerdown", onDown, true);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onFinish);
    el.addEventListener("pointercancel", onFinish);
    return () => {
      el.removeEventListener("pointerdown", onDown, true);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onFinish);
      el.removeEventListener("pointercancel", onFinish);
      if (gesture) chartRef.current?.setPanEnabled(true);
    };
  }, []);

  // Screen readers get a text summary in place of the canvas.
  const [shown, setShown] = useState<Candle[]>([]);
  /** Why the history could not be loaded, if it could not. */
  const [loadError, setLoadError] = useState<string | null>(null);
  shownRef.current = shown;

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
      const { symbol, resolution } = propsRef.current;
      const history = historyRef.current;
      if (history.length === 0 || history[0]!.time <= from) return;
      const need = barsNeeded(from, history[history.length - 1]!.time, RESOLUTION_SECONDS[resolution]);
      if (need <= history.length) return;
      const more = await loadHistory(symbol, resolution, need);
      if (propsRef.current.symbol !== symbol || propsRef.current.resolution !== resolution) return;
      if (more.length <= historyRef.current.length) return;
      if (propsRef.current.replayBar != null) return;
      historyRef.current = more;
      chartRef.current?.setData(more);
      setShown(more);
    }
  }, [props.chartIndex]);

  useEffect(() => {
    let cancelled = false;
    void loadHistory(props.symbol, props.resolution)
      .then((candles: Candle[]) => {
        if (cancelled) return;
        historyRef.current = candles;
        historyKeyRef.current = `${props.symbol}|${props.resolution}`;
        // A stale replay cursor from another symbol would index past the end.
        const cursor = useWorkspace.getState().replayBar;
        const bars = sliceForReplay(candles, cursor);
        chartRef.current?.setData(bars);
        setShown(bars);
        // The bars changed, so the per-bar break flags did too.
        applySessionShading();
        setLoadError(null);
      })
      .catch((err: unknown) => {
        // A failed load used to leave an empty chart with no explanation.
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [props.symbol, props.resolution]);

  // Revealing bars one at a time re-slices the cached history; no refetch.
  useEffect(() => {
    if (historyRef.current.length === 0) return;
    const bars = sliceForReplay(historyRef.current, props.replayBar ?? null);
    chartRef.current?.setData(bars);
    setShown(bars);
    if (props.replayBar != null) {
      chartRef.current?.scrollToRealTime();
    }
  }, [props.replayBar]);

  // Live last bar: once a second, fold the feed's price into the newest candle
  // (a new candle opens on a new period). Replay pauses it. The demo feed's
  // quotes are not tied to its synthetic history, so the first live price is
  // anchored to the last close; a broker feed needs no anchor.
  useEffect(() => {
    if (props.replayBar != null) return;
    let cancelled = false;
    let busy = false;
    let anchor: number | null = null;
    const step = RESOLUTION_SECONDS[props.resolution];
    let rafId: number | null = null;
    const timer = setInterval(() => {
      if (busy || historyRef.current.length === 0) return;
      if (historyKeyRef.current !== `${props.symbol}|${props.resolution}`) return;
      busy = true;
      void quoteOf(props.symbol)
        .then((q) => {
          const history = historyRef.current;
          if (cancelled || !q || history.length === 0) return;
          if (historyKeyRef.current !== `${props.symbol}|${props.resolution}`) return;
          if (!brokerFeed() && anchor === null) anchor = history[history.length - 1]!.close - q.last;
          const price = q.last + (brokerFeed() ? 0 : (anchor ?? 0));
          const merged = mergeQuote(history, price, q.time || Math.floor(Date.now() / 1000), step);
          if (merged === history) return;
          historyRef.current = merged;
          shownRef.current = merged;
          const applyLive = () => {
            rafId = null;
            if (cancelled) return;
            chartRef.current?.setData(historyRef.current);
            if (merged.length !== history.length) {
              setShown(merged);
            }
          };
          if (typeof requestAnimationFrame === "function") {
            if (rafId === null) rafId = requestAnimationFrame(applyLive);
          } else {
            applyLive();
          }
        })
        .catch(() => {})
        .finally(() => {
          busy = false;
        });
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      if (rafId !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafId);
    };
  }, [props.symbol, props.resolution, props.replayBar]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setTheme(THEME_OF[props.theme]);
    chart.setShowVolume(props.showVolume);
    chart.setShowVolumeProfile(props.showVolumeProfile ?? false);
    chart.setShowGrid(props.showGrid);
    chart.setIndicators(toInstances(props.indicators));
  }, [props.theme, props.showVolume, props.showVolumeProfile, props.showGrid, props.indicators]);

  // Crosshair style, price scale, timezone and watermark — the Phase 4 controls.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setCrosshairMode(props.crosshairMode ?? "normal");
    chart.setPriceScaleMode(props.priceScale ?? "normal");
    chart.setInvertScale(props.invertScale ?? false);
    chart.setTimezone(props.timezone ?? null);
    chart.setWatermark(props.watermark ? `${props.symbol} · ${props.resolution}` : null);
  }, [props.crosshairMode, props.priceScale, props.invertScale, props.timezone, props.watermark, props.symbol, props.resolution]);

  // Crosshair sync: another cell's pointer moves this chart's crosshair.
  // A null target clears a sync-imposed position so the local pointer wins.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const sync = props.syncCrosshair;
    if (sync) chart.showCrosshairAt(sync.price, sync.time);
    else chart.clearCrosshairPosition();
  }, [props.syncCrosshair]);

  // Every run replaces its script's output wholesale; the chart reconciles both
  // layers in one pass so they cannot fight over pane indices.
  const scripts = useWorkspace((s) => s.pineScripts);
  useEffect(() => {
    chartRef.current?.setScriptPlots(toPlotSpecs(scripts), toBands(scripts));
  }, [scripts]);

  useEffect(() => {
    chartRef.current?.setChartType(props.chartType);
  }, [props.chartType]);

  useEffect(() => {
    chartRef.current?.setBoxSize(props.boxSize ?? null);
  }, [props.boxSize]);

  useEffect(() => {
    chartRef.current?.setDrawings(props.drawings);
    // An undo/redo can drop the selected drawing; never keep a stale id.
    const sel = useWorkspace.getState().selectedDrawingId;
    if (sel && !props.drawings.some((d) => d.id === sel)) {
      useWorkspace.getState().selectDrawing(null);
      chartRef.current?.setSelection(null);
    }
  }, [props.drawings]);

  // Mirrors every selection change (click, tree, Escape) onto the primitive.
  // A foreign id simply finds no drawing here, so multi-cell stays correct.
  const selectedId = useWorkspace((s) => s.selectedDrawingId);
  useEffect(() => {
    chartRef.current?.setSelection(selectedId);
  }, [selectedId]);

  // Position levels are constant, so they only change when a fill does.
  useEffect(() => {
    chartRef.current?.setTradingLines(props.tradingLines ?? []);
  }, [props.tradingLines]);

  /**
   * Push the current bars' session-break flags onto the chart.
   *
   * Read through a ref-free closure because it is called from two effects (bars
   * arrived, or the session/theme changed). `session` is a session id from
   * `sessionForSymbol`; null clears the shading.
   */
  const applySessionShading = () => {
    const times = historyRef.current.map((c) => c.time);
    chartRef.current?.setSessionShading(times, sessionRef.current, THEME_OF[themeRef.current].sessionBand);
  };

  // Session shading: recoloured with the theme so the band stays a subtle
  // wash rather than a competing block of colour. Applied alongside the bars in
  // `applyBars`, since the flags are per loaded bar.
  useEffect(() => {
    applySessionShading();
  }, [props.session, props.theme]);

  // Fundamental overlays: refetched on symbol/toggle change upstream; each
  // cell applies whatever it is given (empty = clear).
  useEffect(() => {
    chartRef.current?.setFundamentalEvents(props.fundamentalEvents ?? EMPTY_FUNDAMENTAL_EVENTS);
  }, [props.fundamentalEvents]);

  // Switching tools abandons any half-placed drawing; arming a tool also
  // leaves selection mode (tools and selection are mutually exclusive).
  useEffect(() => {
    if (!activeTool) {
      pendingRef.current = null;
      setGhost(null);
    } else {
      useWorkspace.getState().selectDrawing(null);
      chartRef.current?.setSelection(null);
    }
  }, [activeTool]);

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
          handler({ clientX: e.clientX, clientY: e.clientY, time, price });
        }}
      />
      {ghost && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-20 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-ev-accent"
          style={{ left: ghost.x, top: ghost.y }}
        />
      )}
      {loadError && (
        <div role="alert" className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          <p className="max-w-xs rounded border border-ev-down/40 bg-ev-panel/95 px-3 py-2 text-center text-base text-ev-down">
            Could not load {props.symbol}: {loadError}
          </p>
        </div>
      )}
      {flash && (
        <p className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-ev-panel/90 px-2 py-1 text-dense text-ev-muted">
          {flash}
        </p>
      )}
      {hidesLayers && (
        <p className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-ev-panel/90 px-2 py-1 text-dense text-ev-muted">
          {typeLabel} plots price only, so volume, indicators and Pine plots are hidden.
        </p>
      )}
    </>
  );
}

const PRICE_ONLY_LABEL: Partial<Record<ChartType, string>> = { renko: "Renko", kagi: "Kagi", pnf: "Point & Figure" };

/** Bars up to and including the cursor; the full history when not replaying. */
function sliceForReplay(candles: Candle[], cursor: number | null): Candle[] {
  if (cursor === null || candles.length === 0) return candles;
  const resolved = cursor < 0 ? Math.max(0, candles.length + cursor) : cursor;
  const end = Math.max(1, Math.min(resolved + 1, candles.length));
  return candles.slice(0, end);
}

function toInstances(indicators: ActiveIndicator[]): IndicatorInstance[] {
  return indicators
    .filter((i) => !i.hidden)
    .map((i) => ({ uid: i.uid, def: i.def, params: i.params, colorIndex: i.colorIndex }));
}

/** `bgcolor()` is a region, not a value — it has no line width to draw. */
function isBand(plot: PinePlot): boolean {
  return plot.linewidth === 0;
}

/** `na`, booleans and off-scale pins all become "no point here". */
function toValue(value: PinePlot["values"][number]): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toPlotSpecs(scripts: Record<string, PineScriptRecord>): ScriptPlotSpec[] {
  const out: ScriptPlotSpec[] = [];
  for (const [scriptId, record] of Object.entries(scripts)) {
    if (record.error) continue;
    record.plots.forEach((plot, site) => {
      if (isBand(plot)) return;
      out.push({
        uid: `${scriptId}:${site}`,
        title: plot.title,
        values: plot.values.map(toValue),
        color: plot.color,
        linewidth: plot.linewidth,
        style: plot.style,
        overlay: plot.overlay,
      });
    });
  }
  return out;
}

function toBands(scripts: Record<string, PineScriptRecord>): { color: string; values: (number | null)[] }[] {
  const out: { color: string; values: (number | null)[] }[] = [];
  for (const record of Object.values(scripts)) {
    if (record.error) continue;
    for (const plot of record.plots) {
      if (!isBand(plot)) continue;
      out.push({ color: plot.color, values: plot.values.map(toValue) });
    }
  }
  return out;
}
