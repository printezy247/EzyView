import { useEffect, useRef } from "react";
import type { Candle, Resolution } from "@ezyview/data-adapters";
import { EzyChart } from "@ezyview/chart-engine";
import type { ChartType, IndicatorInstance, ScriptPlotSpec, TradingLine } from "@ezyview/chart-engine";
import type { Drawing, DrawingToolId } from "@ezyview/drawing-tools";
import { isComplete, snapToOhlc } from "@ezyview/drawing-tools";
import { DEFAULT_DRAWING_STYLE } from "@ezyview/drawing-tools";
import type { PinePlot } from "@ezyview/pine-transpiler";
import { THEME_OF, uid as newId, useWorkspace } from "./store";
import type { ActiveIndicator, PineScriptRecord } from "./store";
import { loadHistory } from "./data";

interface Props {
  symbol: string;
  resolution: Resolution;
  chartType: ChartType;
  showVolume: boolean;
  showVolumeProfile?: boolean;
  showGrid: boolean;
  theme: "dark" | "light";
  indicators: ActiveIndicator[];
  drawings: Drawing[];
  /** Replay cursor: show bars up to and including this index, or null for all. */
  replayBar?: number | null;
  /** Entry/stop/target levels for the open position on this symbol. */
  tradingLines?: TradingLine[];
  onCrosshairTime?: (time: number | null) => void;
  /**
   * Which cell of the active layout this chart is. Placed drawings are saved
   * there; without it (detached windows) drawing tools are inert.
   */
  chartIndex?: number;
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
  const chartIndexRef = useRef(props.chartIndex);
  chartIndexRef.current = props.chartIndex;

  // In-progress drawing anchors, kept off the store so each pointer move does
  // not trigger a React render.
  const pendingRef = useRef<{ tool: DrawingToolId; points: { time: number; price: number }[] } | null>(null);
  // Full loaded history, so replay can reveal a prefix without a refetch.
  const historyRef = useRef<Candle[]>([]);

  const activeTool = useWorkspace((s) => s.activeTool);
  const setDrawings = useWorkspace((s) => s.setDrawings);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = new EzyChart(el, {
      chartType: props.chartType,
      theme: THEME_OF[props.theme],
      onCrosshairTime: (t) => crosshairRef.current?.(t),
      onClick: (info) => {
        const { activeTool: tool, magnet } = useWorkspace.getState();
        const chartIndex = chartIndexRef.current;
        if (!tool || chartIndex === undefined || info.time === null || info.price === null) return;
        const point = snapToOhlc({ time: info.time, price: info.price }, historyRef.current, magnet);
        const pending = pendingRef.current;
        if (!pending || pending.tool !== tool) {
          pendingRef.current = { tool, points: [point] };
          return;
        }
        pending.points.push(point);
        if (isComplete(tool, pending.points)) {
          const drawings = useWorkspace.getState().activeLayout().charts[chartIndex]?.drawings ?? [];
          setDrawings(
            [...drawings, { id: newId(), tool, points: pending.points, style: { ...DEFAULT_DRAWING_STYLE } }],
            chartIndex,
          );
          pendingRef.current = null;
          useWorkspace.getState().setActiveTool(null);
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

  useEffect(() => {
    let cancelled = false;
    void loadHistory(props.symbol, props.resolution).then((candles: Candle[]) => {
      if (cancelled) return;
      historyRef.current = candles;
      // A stale replay cursor from another symbol would index past the end.
      const cursor = useWorkspace.getState().replayBar;
      chartRef.current?.setData(sliceForReplay(candles, cursor));
    });
    return () => {
      cancelled = true;
    };
  }, [props.symbol, props.resolution]);

  // Revealing bars one at a time re-slices the cached history; no refetch.
  useEffect(() => {
    if (historyRef.current.length === 0) return;
    chartRef.current?.setData(sliceForReplay(historyRef.current, props.replayBar ?? null));
  }, [props.replayBar]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setTheme(THEME_OF[props.theme]);
    chart.setShowVolume(props.showVolume);
    chart.setShowVolumeProfile(props.showVolumeProfile ?? false);
    chart.setShowGrid(props.showGrid);
    chart.setIndicators(toInstances(props.indicators));
  }, [props.theme, props.showVolume, props.showVolumeProfile, props.showGrid, props.indicators]);

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
    chartRef.current?.setDrawings(props.drawings);
  }, [props.drawings]);

  // Position levels are constant, so they only change when a fill does.
  useEffect(() => {
    chartRef.current?.setTradingLines(props.tradingLines ?? []);
  }, [props.tradingLines]);

  // Switching tools abandons any half-placed drawing.
  useEffect(() => {
    if (!activeTool) pendingRef.current = null;
  }, [activeTool]);

  return <div ref={containerRef} className="absolute inset-0" data-testid="chart-host" />;
}

/** Bars up to and including the cursor; the full history when not replaying. */
function sliceForReplay(candles: Candle[], cursor: number | null): Candle[] {
  if (cursor === null) return candles;
  const end = Math.max(1, Math.min(cursor + 1, candles.length));
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
