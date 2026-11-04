import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Candle } from "@ezyview/data-adapters";
import type { EzyChart } from "@ezyview/chart-engine";
import type {
  IndicatorInstance,
  ScriptPlotSpec,
} from "@ezyview/chart-engine";
import type { Drawing, DrawingToolId, MagnetMode, ScreenPoint } from "@ezyview/drawing-tools";
import {
  defaultStyleForTool,
  hitTestAll,
  indexProjected,
  simplifyRdp,
  snapPoint,
  visibleOnResolution,
  DEFAULT_DRAWING_STYLE,
} from "@ezyview/drawing-tools";
import type { PinePlot } from "@ezyview/pine-transpiler";
import { MAX_DRAWINGS_PER_CHART, MAX_POINTS_PER_STROKE } from "./drawingsIO";
import { notice } from "./notice";
import { THEME_OF, uid as newId, useWorkspace } from "./store";
import { useDrawingUi } from "./drawingUi";
import { RESOLUTION_SECONDS } from "./data";
import type { ActiveIndicator, PineScriptRecord } from "./store";
import type { Props } from "./ChartHost";

/**
 * Refs and state setters shared by the host's extracted hooks. Everything is
 * a ref or a stable setter, so a hook can read the live value at call time
 * without re-subscribing — same contract the engine's own callbacks use.
 */
export interface HostContext {
  containerRef: RefObject<HTMLDivElement | null>;
  chartRef: RefObject<EzyChart | null>;
  /** Latest props, for callbacks that must not go stale. */
  propsRef: RefObject<Props>;
  crosshairRef: RefObject<((time: number | null) => void) | undefined>;
  crosshairMoveRef: RefObject<((time: number | null, price: number | null) => void) | undefined>;
  chartIndexRef: RefObject<number | undefined>;
  levelDragRef: RefObject<{ symbol: string; levels: { id: string; price: number }[] } | null>;
  sessionRef: RefObject<string | null>;
  themeRef: RefObject<Props["theme"]>;
  pendingRef: RefObject<{ tool: DrawingToolId; points: { time: number; price: number }[] } | null>;
  drawingInProgressRef: RefObject<boolean>;
  lastClickAtRef: RefObject<number>;
  suppressClickRef: RefObject<boolean>;
  historyRef: RefObject<Candle[]>;
  historyKeyRef: RefObject<string | null>;
  shownRef: RefObject<Candle[]>;
  onDrawingBoxRef: RefObject<((box: import("./ChartHost").DrawingBox | null) => void) | undefined>;
  setShown: Dispatch<SetStateAction<Candle[]>>;
  setLoadError: Dispatch<SetStateAction<string | null>>;
  setGhost: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setMarquee: Dispatch<SetStateAction<{ from: ScreenPoint; to: ScreenPoint } | null>>;
  setFlash: Dispatch<SetStateAction<string | null>>;
}

/**
 * Push the current bars' session-break flags onto the chart.
 *
 * Called from two effects (bars arrived, or the session/theme changed), so it
 * lives outside them. `session` is a session id from `sessionForSymbol`; null
 * clears the shading.
 */
export function applySessionShading(ctx: HostContext): void {
  const times = ctx.historyRef.current.map((c) => c.time);
  ctx.chartRef.current?.setSessionShading(times, ctx.sessionRef.current, THEME_OF[ctx.themeRef.current].sessionBand);
}

/**
 * Bars up to and including the cursor; the full history when not replaying.
 */
export function sliceForReplay(candles: Candle[], cursor: number | null): Candle[] {
  if (cursor === null || candles.length === 0) return candles;
  const resolved = cursor < 0 ? Math.max(0, candles.length + cursor) : cursor;
  const end = Math.max(1, Math.min(resolved + 1, candles.length));
  return candles.slice(0, end);
}

/**
 * The stateful helpers shared by the mount effect (click-to-place), the
 * gesture controller and the render path (context menu). Recreated per
 * render like the closures they replace — every read goes through refs or
 * getState(), so a stale instance still acts on live state.
 */
export function createChartHostKit(ctx: HostContext) {
  const { chartRef, chartIndexRef, propsRef, historyRef, pendingRef, setGhost } = ctx;

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
        const screenPts = strokePoints.map((p) => ({
          x: chart.timeToCoordinate(p.time),
          y: chart.priceToCoordinate(p.price),
          orig: p,
        }));
        // Simplify in pixel space only; if any point cannot be projected (empty
        // chart) keep the raw stroke rather than mixing pixels with epoch/price.
        if (screenPts.every((p) => p.x !== null && p.y !== null)) {
          const simplified = simplifyRdp(screenPts as { x: number; y: number; orig: (typeof points)[number] }[], 1.75);
          strokePoints = simplified.map((s) => s.orig);
        }
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

  return { hittableDrawings, snapAt, hitAt, finishDrawing, placePosition };
}
/**
 * Average true range over the last `period` bars. Used to give a one-click
 * long/short position sensible stop and target distances; falls back to a
 * fraction of price when there is not enough history to measure volatility.
 */
export function atrOf(bars: readonly Candle[], period: number): number {
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

export function toInstances(indicators: ActiveIndicator[]): IndicatorInstance[] {
  return indicators
    .filter((i) => !i.hidden)
    .map((i) => ({ uid: i.uid, def: i.def, params: i.params, colorIndex: i.colorIndex }));
}

/** `bgcolor()` is a region, not a value — it has no line width to draw. */
export function isBand(plot: PinePlot): boolean {
  return plot.linewidth === 0;
}

/** `na`, booleans and off-scale pins all become "no point here". */
export function toValue(value: PinePlot["values"][number]): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function toPlotSpecs(scripts: Record<string, PineScriptRecord>): ScriptPlotSpec[] {
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

export function toBands(scripts: Record<string, PineScriptRecord>): { color: string; values: (number | null)[] }[] {
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
