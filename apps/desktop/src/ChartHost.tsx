import { useEffect, useMemo, useRef, useState } from "react";
import type { Candle, Quote, Resolution } from "@ezyview/data-adapters";
import { EzyChart } from "@ezyview/chart-engine";
import type {
  ChartType,
  CrosshairStyleName,
  FundamentalEventOverlay,
  IndicatorInstance,
  ScriptPlotSpec,
  TradingLine,
} from "@ezyview/chart-engine";
import type { Drawing, DrawingToolId, MagnetMode, ScreenPoint } from "@ezyview/drawing-tools";
import {
  defaultStyleForTool,
  hitTestAll,
  isComplete,
  isPositionTool,
  setAnchor,
  indexProjected,
  simplifyRdp,
  snapPoint,
  translateDrawing,
  visibleOnResolution,
} from "@ezyview/drawing-tools";
import { MAX_DRAWINGS_PER_CHART, MAX_POINTS_PER_STROKE } from "./drawingsIO";
import { notice } from "./notice";
import { hitTestLevel, moveLevel } from "./priceDrag";
import { DEFAULT_DRAWING_STYLE } from "@ezyview/drawing-tools";
import { useDrawingUi } from "./drawingUi";
import type { PinePlot } from "@ezyview/pine-transpiler";
import { THEME_OF, uid as newId, useWorkspace } from "./store";
import type { ActiveIndicator, PineScriptRecord } from "./store";
import type { ChartThemeName, CrosshairModeName, PriceScaleModeName } from "./layout";
import { loadHistory, safeHistory, resolveSource, RESOLUTION_SECONDS, subscribeLive, tickerOf } from "./data";
import { subscribeQuote } from "./quotePoller";
import { isLiveSourceChoice } from "./chartSource";
import type { DataSourceChoice } from "./chartSource";
import { useMt5 } from "./mt5";
import { barsNeeded, rangeStart } from "./chartView";
import { mergeQuote } from "./liveBars";
import { summarizeChart } from "./chartSummary";
import { EMPTY_FUNDAMENTAL_EVENTS } from "./fundamentalEvents";
import { registerExportSource } from "./exportBridge";
import { compositeCanvasesToPng } from "./chartImage";
import { loadImageAssets } from "./imageAssets";

interface Props {
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
  // `auto` follows the global MT5 switch, so re-run the data effects when it flips.
  const globalFeed = useMt5((s) => s.source);
  const feed = resolveSource(props.dataSource);
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
  /** Shift-drag selection rectangle, in container pixels. */
  const [marquee, setMarquee] = useState<{ from: ScreenPoint; to: ScreenPoint } | null>(null);

  const activeTool = useWorkspace((s) => s.activeTool);
  const hideAllDrawings = useWorkspace((s) => s.hideAllDrawings);
  const eraserMode = useWorkspace((s) => s.eraserMode);
  const crosshairCursor = useDrawingUi((s) => s.crosshairCursor);

  /** Drawings this host may hit-test: visible on this timeframe and not globally hidden. */
  const hittableDrawings = (chartIndex?: number): Drawing[] => {
    const st = useWorkspace.getState();
    if (st.hideAllDrawings) return [];
    const idx = chartIndex ?? chartIndexRef.current;
    if (idx === undefined) return [];
    const list = st.activeLayout().charts[idx]?.drawings ?? [];
    return list.filter((d) => !d.hidden && visibleOnResolution(d, propsRef.current.resolution));
  };

  /** Magnet with object anchors first, then the nearest candle OHLC. */
  const snapAt = (point: { time: number; price: number }, mode: MagnetMode) => {
    const st = useWorkspace.getState();
    const idx = chartIndexRef.current;
    const drawings = idx === undefined ? [] : (st.activeLayout().charts[idx]?.drawings ?? []);
    return snapPoint(point, historyRef.current, drawings, mode);
  };

  /** Topmost drawing under a container-relative pixel, or null. */
  const hitAt = (x: number, y: number, chartIndex?: number) => {
    const chart = chartRef.current;
    const list = hittableDrawings(chartIndex);
    if (!chart || list.length === 0) return null;
    // Past 50 objects, narrow with the grid before running per-tool geometry.
    if (list.length > 50) {
      const { index, projected } = indexProjected(list, (d) => chart.projectDrawing(d));
      const ids = new Set(index.query(x, y));
      const candidates = list.filter((d) => ids.has(d.id));
      if (candidates.length === 0) return null;
      return hitTestAll(
        candidates.map((d) => ({ drawing: d, screen: [...(projected.get(d.id) ?? [])] })),
        { x, y },
      );
    }
    return hitTestAll(
      list.map((d) => ({ drawing: d, screen: chart.projectDrawing(d) })),
      { x, y },
    );
  };

  /**
   * Commit a finished drawing: remember the tool's style, push it to the store
   * and select it (unless the user is staying in drawing mode).
   */
  const finishDrawing = (tool: DrawingToolId, points: Drawing["points"], chartIndex: number): string => {
    const st = useWorkspace.getState();
    const drawings = st.activeLayout().charts[chartIndex]?.drawings ?? [];
    if (drawings.length >= MAX_DRAWINGS_PER_CHART) {
      notice.alert("Drawings could not be saved", `Drawing limit of ${MAX_DRAWINGS_PER_CHART} reached for this chart.`);
      chartRef.current?.setPreview(null);
      pendingRef.current = null;
      setGhost(null);
      return "";
    }

    let strokePoints = points;
    if (tool === "brush" && strokePoints.length > 2) {
      const chart = chartRef.current;
      if (chart) {
        const screenPts = strokePoints.map((p) => {
          const x = chart.timeToCoordinate(p.time);
          const y = chart.priceToCoordinate(p.price);
          return { x: x ?? p.time, y: y ?? p.price, orig: p };
        });
        const simplified = simplifyRdp(screenPts, 1.75);
        strokePoints = simplified.map((s) => s.orig);
      } else {
        const mapped = strokePoints.map((p) => ({ x: p.time, y: p.price, orig: p }));
        strokePoints = simplifyRdp(mapped, 1.75).map((s) => s.orig);
      }
      if (strokePoints.length > MAX_POINTS_PER_STROKE) {
        strokePoints = strokePoints.slice(0, MAX_POINTS_PER_STROKE);
      }
    }

    const id = newId();
    const base = st.drawingToolStyles[tool] ?? DEFAULT_DRAWING_STYLE;
    const style = defaultStyleForTool(tool, base);
    st.setDrawings(
      [
        ...drawings,
        {
          id,
          tool,
          points: strokePoints,
          style: { ...style },
          ...(tool === "text" || tool === "callout" ? { text: "" } : {}),
        },
      ],
      chartIndex,
    );
    chartRef.current?.setPreview(null);
    pendingRef.current = null;
    setGhost(null);
    if (tool === "text" || tool === "callout") useDrawingUi.getState().requestTextEdit(id);
    // The new drawing is selected even while staying in drawing mode: the
    // floating bar is how its style gets adjusted without leaving the tool.
    st.selectDrawing(id);
    chartRef.current?.setSelection(id);
    if (st.stayInDrawingMode) st.setActiveTool(tool);
    else st.setActiveTool(null);
    return id;
  };

  /** One-click long/short: entry, ATR-derived stop/target and a 15-bar width. */
  const placePosition = (
    tool: "long_position" | "short_position",
    time: number,
    entry: number,
    chartIndex: number,
  ): void => {
    const atr = atrOf(historyRef.current, 14);
    const risk = Math.max(atr * 1.5, Math.abs(entry) * 0.0005);
    const long = tool === "long_position";
    const stop = long ? entry - risk : entry + risk;
    const target = long ? entry + risk * 2 : entry - risk * 2;
    const step = RESOLUTION_SECONDS[propsRef.current.resolution] ?? 60;
    const end = time + step * 15;
    finishDrawing(
      tool,
      [
        { time, price: entry },
        { time: end, price: stop },
        { time: end, price: target },
        // Fourth anchor is the draggable right-edge width handle.
        { time: end, price: entry },
      ],
      chartIndex,
    );
  };

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

  // Selection, dragging, rubber-band previews, freehand strokes and hover
  // cursors share one pointer effect: only one can be active at a time and all
  // need the same capture/release-pan bookkeeping. The pointerdown listener
  // runs in the capture phase, before lightweight-charts' own canvas listeners,
  // so a grab on a drawing stops the event there and the chart never pans.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    type Drag = {
      kind: "drawing";
      /** Every selected drawing moves on a body drag; a handle drag targets one. */
      ids: string[];
      /** 0-based anchor index, or -1 for the body. */
      handle: number;
      /** Pre-drag drawings, pushed as one undo entry when the drag ends. */
      snapshot: Drawing[];
      startPoint: { time: number; price: number };
      moved: boolean;
    };
    type Marquee = {
      kind: "marquee";
      /** Container-relative start and current corner. */
      from: ScreenPoint;
      to: ScreenPoint;
      additive: boolean;
    };
    type LevelDrag = {
      kind: "level";
      /** "SL" or "TP". */
      id: string;
      symbol: string;
      /** Where the line should be drawn while dragging; null until the first move. */
      preview: number | null;
    };
    type BrushDrag = {
      kind: "brush";
      chartIndex: number;
      /** Last appended pointer position, for the 2px throttle. */
      last: ScreenPoint;
    };
    let gesture: Drag | LevelDrag | BrushDrag | Marquee | null = null;

    const localPoint = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const defaultCursor = () => {
      const st = useWorkspace.getState();
      return st.activeTool || st.eraserMode || useDrawingUi.getState().crosshairCursor ? "crosshair" : "";
    };

    /** Style a live preview inherits: the tool's remembered look. */
    const previewStyle = (tool: DrawingToolId) =>
      defaultStyleForTool(tool, useWorkspace.getState().drawingToolStyles[tool] ?? DEFAULT_DRAWING_STYLE);

    /** Snap a preview point to 45° increments around the first anchor. */
    const snapAngle = (
      chart: EzyChart,
      anchor: { time: number; price: number },
      at: ScreenPoint,
      fallback: { time: number; price: number },
    ): { time: number; price: number } => {
      const x0 = chart.timeToCoordinate(anchor.time);
      const y0 = chart.priceToCoordinate(anchor.price);
      if (x0 === null || y0 === null) return fallback;
      const len = Math.hypot(at.x - x0, at.y - y0);
      if (len < 1) return fallback;
      const step = Math.PI / 4;
      const angle = Math.round(Math.atan2(at.y - y0, at.x - x0) / step) * step;
      const conv = chart.screenToTimePrice(x0 + Math.cos(angle) * len, y0 + Math.sin(angle) * len);
      return conv.ok && conv.time !== null && conv.price !== null ? { time: conv.time, price: conv.price } : fallback;
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const chart = chartRef.current;
      const chartIndex = chartIndexRef.current;
      if (!chart || chartIndex === undefined) return;
      const st = useWorkspace.getState();
      const pt = localPoint(e);

      // Freehand: record points from pointerdown to pointerup.
      if (st.activeTool === "brush") {
        const conv = chart.screenToTimePrice(pt.x, pt.y);
        if (!conv.ok || conv.time === null || conv.price === null) return;
        const point = snapAt({ time: conv.time, price: conv.price }, st.magnet);
        pendingRef.current = { tool: "brush", points: [point] };
        gesture = { kind: "brush", chartIndex, last: pt };
        e.stopPropagation();
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        chart.setPanEnabled(false);
        return;
      }
      if (st.activeTool) return;

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

      const all = st.activeLayout().charts[chartIndex]?.drawings ?? [];
      const hit = hitAt(pt.x, pt.y, chartIndex);
      if (!hit) {
        // Shift-drag on empty space paints a selection rectangle. Plain drag
        // stays the chart's pan gesture.
        if (e.shiftKey && all.length > 0) {
          e.stopPropagation();
          e.preventDefault();
          suppressClickRef.current = true;
          gesture = { kind: "marquee", from: pt, to: pt, additive: true };
          setMarquee({ from: pt, to: pt });
          el.setPointerCapture(e.pointerId);
          chart.setPanEnabled(false);
        }
        return;
      }
      e.stopPropagation();
      if (e.shiftKey) {
        suppressClickRef.current = true;
        st.toggleDrawingSelection(hit.id);
        chart.setSelection(useWorkspace.getState().selectedDrawingIds);
      } else if (!st.selectedDrawingIds.includes(hit.id)) {
        st.selectDrawing(hit.id);
        chart.setSelection(hit.id);
      }
      const selected = all.filter((d) => useWorkspace.getState().selectedDrawingIds.includes(d.id));
      const targets = selected.length > 0 ? selected : all.filter((d) => d.id === hit.id);
      if (targets.length === 0 || targets.some((d) => d.locked) || st.lockAllDrawings || st.eraserMode) return;
      const start = chart.screenToTimePrice(pt.x, pt.y);
      if (!start.ok || start.time === null || start.price === null) return;
      gesture = {
        kind: "drawing",
        ids: targets.map((d) => d.id),
        handle: targets.length === 1 ? hit.handle : -1,
        snapshot: [...all], // entries are immutable; the array copy is the boundary
        startPoint: { time: start.time, price: start.price },
        moved: false,
      };
      el.setPointerCapture(e.pointerId);
      chart.setPanEnabled(false);
    };

    const onMove = (e: PointerEvent) => {
      const chart = chartRef.current;
      if (!chart) return;
      const pt = localPoint(e);
      const st = useWorkspace.getState();
      const cur = gesture;

      // No gesture: either rubber-band a half-placed drawing or show hover state.
      if (!cur) {
        if (st.activeTool && !st.hideAllDrawings) {
          const pending = pendingRef.current;
          if (!pending || pending.points.length === 0) {
            chart.setPreview(null);
          } else {
            const conv = chart.screenToTimePrice(pt.x, pt.y);
            if (conv.ok && conv.time !== null && conv.price !== null) {
              const want = { time: conv.time, price: conv.price };
              const magnet = e.ctrlKey || e.metaKey ? (st.magnet === "off" ? "weak" : "off") : st.magnet;
              const snapped = magnet === "off" ? want : snapAt(want, magnet);
              const cursorPoint =
                e.shiftKey && pending.points.length === 1
                  ? snapAngle(chart, pending.points[0]!, pt, snapped)
                  : snapped;
              chart.setPreview({
                id: "__preview__",
                tool: pending.tool,
                points: [...pending.points, cursorPoint],
                style: { ...previewStyle(pending.tool) },
              });
            }
          }
          chart.setHovered(null);
          el.style.cursor = "crosshair";
          return;
        }
        const hit = hitAt(pt.x, pt.y);
        chart.setHovered(hit?.id ?? null, hit?.handle ?? null);
        el.style.cursor = hit
          ? st.lockAllDrawings
            ? "not-allowed"
            : hit.handle >= 0
              ? "grab"
              : "move"
          : defaultCursor();
        return;
      }

      if (cur.kind === "brush") {
        if (Math.hypot(pt.x - cur.last.x, pt.y - cur.last.y) < 2) return;
        const conv = chart.screenToTimePrice(pt.x, pt.y);
        const pending = pendingRef.current;
        if (!conv.ok || conv.time === null || conv.price === null || !pending) return;
        cur.last = pt;
        pending.points.push({ time: conv.time, price: conv.price });
        chart.setPreview({
          id: "__preview__",
          tool: "brush",
          points: [...pending.points],
          style: { ...previewStyle("brush") },
        });
        e.preventDefault();
        return;
      }

      if (cur.kind === "marquee") {
        cur.to = pt;
        setMarquee({ from: cur.from, to: pt });
        e.preventDefault();
        return;
      }

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
      for (const id of cur.ids) {
        const target = cur.snapshot.find((d) => d.id === id);
        if (!target) continue;
        let points: { time: number; price: number }[];
        if (cur.handle >= 0) {
          const want = { time: conv.time, price: conv.price };
          const effectiveMagnet = e.ctrlKey || e.metaKey ? (st.magnet === "off" ? "weak" : "off") : st.magnet;
          let snapped = effectiveMagnet === "off" ? want : snapAt(want, effectiveMagnet);
          // Position anatomy: entry/stop/target keep their bar, the width handle
          // keeps its price. Only the axis each one means is draggable.
          if (isPositionTool(target.tool) && cur.handle <= 2) {
            snapped = { time: target.points[cur.handle]!.time, price: snapped.price };
          } else if (isPositionTool(target.tool) && cur.handle === 3) {
            snapped = { time: snapped.time, price: target.points[3]!.price };
          }
          points = setAnchor(target, cur.handle, snapped).points;
          if (e.shiftKey && points.length === 2 && (target.tool === "trend_line" || target.tool === "ray" || target.tool === "extended_line")) {
            const otherIdx = cur.handle === 0 ? 1 : 0;
            points[cur.handle] = { time: snapped.time, price: points[otherIdx]!.price };
          }
        } else {
          points = translateDrawing(target, conv.time - cur.startPoint.time, conv.price - cur.startPoint.price).points;
        }
        st.previewDrawing(id, { points }, chartIndex);
      }
      cur.moved = true;
      e.preventDefault();
    };

    const onFinish = (e: PointerEvent) => {
      const cur = gesture;
      if (!cur) return;
      if (cur.kind === "marquee") {
        const chart = chartRef.current;
        const chartIndex = chartIndexRef.current;
        if (chart && chartIndex !== undefined) {
          const x0 = Math.min(cur.from.x, cur.to.x);
          const x1 = Math.max(cur.from.x, cur.to.x);
          const y0 = Math.min(cur.from.y, cur.to.y);
          const y1 = Math.max(cur.from.y, cur.to.y);
          const all = useWorkspace.getState().activeLayout().charts[chartIndex]?.drawings ?? [];
          const hits = all
            .filter((d) => {
              if (d.hidden) return false;
              const projected = chart.projectDrawing(d).filter((p): p is ScreenPoint => p !== null);
              if (projected.length === 0) return false;
              const bx0 = Math.min(...projected.map((p) => p.x));
              const bx1 = Math.max(...projected.map((p) => p.x));
              const by0 = Math.min(...projected.map((p) => p.y));
              const by1 = Math.max(...projected.map((p) => p.y));
              return bx1 >= x0 && bx0 <= x1 && by1 >= y0 && by0 <= y1;
            })
            .map((d) => d.id);
          const existing = cur.additive ? useWorkspace.getState().selectedDrawingIds : [];
          const ids = [...new Set([...existing, ...hits])];
          useWorkspace.getState().setDrawingSelection(ids);
          chart.setSelection(ids);
        }
        setMarquee(null);
      } else if (cur.kind === "level") {
        if (cur.preview !== null) {
          // One amend carrying only the dragged level, so the other one stays put.
          onLevelCommit?.(cur.symbol, cur.id === "SL" ? { stopLoss: cur.preview } : { takeProfit: cur.preview });
        }
      } else if (cur.kind === "brush") {
        const pending = pendingRef.current;
        if (pending && pending.points.length >= 2) finishDrawing("brush", pending.points, cur.chartIndex);
        pendingRef.current = null;
        chartRef.current?.setPreview(null);
        setGhost(null);
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
      chartRef.current?.setHovered(null);
      el.style.cursor = defaultCursor();
      setMarquee(null);
      gesture = null;
    };

    // Double-click opens the full settings dialog without disturbing a tool.
    const onDoubleClick = (e: MouseEvent) => {
      const st = useWorkspace.getState();
      if (st.activeTool) return;
      const r = el.getBoundingClientRect();
      const hit = hitAt(e.clientX - r.left, e.clientY - r.top);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      st.selectDrawing(hit.id);
      chartRef.current?.setSelection(hit.id);
      useDrawingUi.getState().openSettings(hit.id, "style");
    };

    const onLeave = () => {
      chartRef.current?.setHovered(null);
      el.style.cursor = defaultCursor();
    };

    el.addEventListener("pointerdown", onDown, true);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onFinish);
    el.addEventListener("pointercancel", onFinish);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("dblclick", onDoubleClick, true);
    return () => {
      el.removeEventListener("pointerdown", onDown, true);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onFinish);
      el.removeEventListener("pointercancel", onFinish);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("dblclick", onDoubleClick, true);
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

  useEffect(() => {
    let cancelled = false;
    void loadHistory(props.symbol, props.resolution, undefined, props.dataSource)
      .then((candles: Candle[]) => {
        if (cancelled) return;
        historyRef.current = candles;
        historyKeyRef.current = `${props.symbol}|${props.resolution}|${feed}`;
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
  }, [props.symbol, props.resolution, props.dataSource, globalFeed]);

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

  // Live last bar: fold the feed's price into the newest candle (a new candle
  // opens on a new period). Replay pauses it. Binance/Kraken/Twelve Data push
  // quotes through `subscribeLive` (the adapter falls back to its own polling);
  // if that cannot start, or for demo and MT5, `quoteOf` is polled. The demo
  // feed's quotes are not tied to its synthetic history, so its first live
  // price is anchored to the last close; real feeds need no anchor.
  useEffect(() => {
    if (props.replayBar != null) return;
    let cancelled = false;
    let busy = false;
    let anchor: number | null = null;
    const step = RESOLUTION_SECONDS[props.resolution];
    const key = `${props.symbol}|${props.resolution}|${feed}`;
    let rafId: number | null = null;
    let unsubscribe: (() => void) | null = null;

    const apply = (q: Quote) => {
      const history = historyRef.current;
      if (cancelled || history.length === 0) return;
      // The bars belong to another symbol/interval/source: do not mix prices in.
      if (historyKeyRef.current !== key) return;
      if (feed === "demo" && anchor === null) anchor = history[history.length - 1]!.close - q.last;
      const price = q.last + (feed === "demo" ? (anchor ?? 0) : 0);
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
    };

    const startPolling = () => {
      if (unsubscribe !== null || cancelled) return;
      // A broker quote is one cheap tick; Twelve Data's free key allows ~8 requests/minute.
      const every = feed === "mt5" ? 500 : feed === "twelvedata" ? 8000 : 1000;
      // The shared poller means the legend, ticket and tape on this chart do
      // not add a second request for the symbol the chart already polls.
      unsubscribe = subscribeQuote(props.symbol, (q) => {
        if (!busy && historyRef.current.length > 0 && historyKeyRef.current === key) {
          busy = true;
          try {
            if (q) apply(q);
          } finally {
            busy = false;
          }
        }
      }, { source: props.dataSource, intervalMs: every });
    };

    if (isLiveSourceChoice(feed)) {
      subscribeLive(props.symbol, feed, apply)
        .then((u) => {
          if (cancelled) u?.();
          else if (u) unsubscribe = u;
          else startPolling();
        })
        .catch(startPolling);
    } else {
      startPolling();
    }
    return () => {
      cancelled = true;
      try {
        unsubscribe?.();
      } catch {
        // ignore
      }
      if (rafId !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafId);
    };
  }, [props.symbol, props.resolution, props.replayBar, props.dataSource, globalFeed]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setTheme(THEME_OF[props.theme]);
    chart.setShowVolume(props.showVolume);
    chart.setShowVolumeProfile(props.showVolumeProfile ?? false);
    chart.setIndicators(toInstances(props.indicators));
  }, [props.theme, props.showVolume, props.showVolumeProfile, props.indicators]);

  // Canvas settings: per-axis grid visibility/colour, crosshair colour/style
  // and the last-price line. Kept separate from the theme effect so a theme
  // change cannot wipe a user's explicit colours.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setGrid({
      vert: props.showVertGrid ?? props.showGrid,
      horz: props.showHorzGrid ?? props.showGrid,
      vertColor: props.gridVertColor ?? null,
      horzColor: props.gridHorzColor ?? null,
    });
    chart.setCrosshair({ color: props.crosshairColor ?? null, style: props.crosshairStyle ?? "dashed" });
    chart.setLastPriceVisible(props.showLastPrice ?? true);
  }, [
    props.showGrid,
    props.showVertGrid,
    props.showHorzGrid,
    props.gridVertColor,
    props.gridHorzColor,
    props.crosshairColor,
    props.crosshairStyle,
    props.showLastPrice,
  ]);

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

  // Timeframe visibility and the global hide toggle filter the layer before it
  // reaches the primitive, so hit-testing and rendering always agree.
  const visibleDrawings = useMemo(
    () => (hideAllDrawings ? [] : props.drawings.filter((d) => visibleOnResolution(d, props.resolution))),
    [props.drawings, props.resolution, hideAllDrawings],
  );
  useEffect(() => {
    chartRef.current?.setDrawings(visibleDrawings);
    // An undo/redo can drop a selected drawing; never keep a stale id.
    const st = useWorkspace.getState();
    const alive = st.selectedDrawingIds.filter((id) => visibleDrawings.some((d) => d.id === id));
    if (alive.length !== st.selectedDrawingIds.length) st.setDrawingSelection(alive);
    chartRef.current?.setSelection(alive);
  }, [visibleDrawings]);

  // Image drawings store only an asset id; decode once per set and hand the
  // renderer a map it can draw synchronously on the next frame.
  const imageAssetKey = visibleDrawings
    .map((d) => d.image?.assetId)
    .filter((id): id is string => Boolean(id))
    .sort()
    .join("|");
  useEffect(() => {
    let cancelled = false;
    const ids = imageAssetKey ? imageAssetKey.split("|") : [];
    void loadImageAssets(ids).then((images) => {
      if (!cancelled) chartRef.current?.setDrawingImages(images);
    });
    return () => {
      cancelled = true;
    };
  }, [imageAssetKey]);

  // Mirrors every selection change (click, tree, Escape, marquee) onto the
  // primitive. A foreign id simply finds no drawing here, so multi-cell stays
  // correct.
  const selectedId = useWorkspace((s) => s.selectedDrawingId);
  const selectedIds = useWorkspace((s) => s.selectedDrawingIds);
  useEffect(() => {
    chartRef.current?.setSelection(selectedIds);
  }, [selectedIds]);

  // The floating mini-bar follows the selected drawing's box on screen. The
  // callback is read through a ref: cells pass an inline function, and making
  // it an effect dependency would let one box update re-render the page, hand
  // the cell a new callback and start the cycle again.
  const onDrawingBoxRef = useRef(props.onDrawingBox);
  onDrawingBoxRef.current = props.onDrawingBox;
  useEffect(() => {
    const chart = chartRef.current;
    const drawing = selectedId ? visibleDrawings.find((d) => d.id === selectedId) : null;
    if (!chart || !drawing) {
      onDrawingBoxRef.current?.(null);
      return;
    }
    const pts = chart.projectDrawing(drawing).filter((p): p is ScreenPoint => p !== null);
    if (pts.length === 0) {
      onDrawingBoxRef.current?.(null);
      return;
    }
    const x0 = Math.min(...pts.map((p) => p.x));
    const x1 = Math.max(...pts.map((p) => p.x));
    const y0 = Math.min(...pts.map((p) => p.y));
    const y1 = Math.max(...pts.map((p) => p.y));
    onDrawingBoxRef.current?.({ x: x0 - 6, y: y0 - 6, w: x1 - x0 + 12, h: y1 - y0 + 12 });
  }, [selectedId, visibleDrawings]);

  // Navigate cursor: crosshair for an armed tool, the eraser, or the cursor
  // mode button; the pointer handlers refine it over handles and bodies.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.style.cursor = activeTool || eraserMode || crosshairCursor ? "crosshair" : "";
  }, [activeTool, eraserMode, crosshairCursor]);

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
      chartRef.current?.setPreview(null);
    } else {
      useWorkspace.getState().selectDrawing(null);
      chartRef.current?.setSelection(null);
    }
  }, [activeTool]);

  // Hiding everything also drops the selection and any rubber-band preview, so
  // the floating bar cannot hover over something the user just hid.
  useEffect(() => {
    if (!hideAllDrawings) return;
    chartRef.current?.setPreview(null);
    useWorkspace.getState().selectDrawing(null);
    chartRef.current?.setSelection(null);
  }, [hideAllDrawings]);

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
      {hidesLayers && (
        <p className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-ev-panel/90 px-2 py-1 text-dense text-ev-muted">
          {typeLabel} plots price only, so volume, indicators and Pine plots are hidden.
        </p>
      )}
    </>
  );
}

const PRICE_ONLY_LABEL: Partial<Record<ChartType, string>> = { renko: "Renko", kagi: "Kagi", pnf: "Point & Figure" };

/**
 * Average true range over the last `period` bars. Used to give a one-click
 * long/short position sensible stop and target distances; falls back to a
 * fraction of price when there is not enough history to measure volatility.
 */
function atrOf(bars: readonly Candle[], period: number): number {
  if (bars.length === 0) return 0;
  if (bars.length === 1) return Math.abs(bars[0]!.close) * 0.005;
  const from = Math.max(1, bars.length - period);
  let sum = 0;
  let count = 0;
  for (let i = from; i < bars.length; i++) {
    const prev = bars[i - 1]!.close;
    const cur = bars[i]!;
    sum += Math.max(cur.high - cur.low, Math.abs(cur.high - prev), Math.abs(cur.low - prev));
    count++;
  }
  return count > 0 ? sum / count : Math.abs(bars.at(-1)!.close) * 0.005;
}

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
