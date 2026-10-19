import { useEffect, useRef } from "react";
import type { Candle, Resolution } from "@ezyview/data-adapters";
import { EzyChart } from "@ezyview/chart-engine";
import type { ChartType, IndicatorInstance } from "@ezyview/chart-engine";
import type { Drawing, DrawingToolId } from "@ezyview/drawing-tools";
import { isComplete } from "@ezyview/drawing-tools";
import { DEFAULT_DRAWING_STYLE } from "@ezyview/drawing-tools";
import { THEME_OF, uid as newId, useWorkspace } from "./store";
import type { ActiveIndicator } from "./store";
import { loadHistory } from "./data";

interface Props {
  symbol: string;
  resolution: Resolution;
  chartType: ChartType;
  showVolume: boolean;
  showGrid: boolean;
  theme: "dark" | "light";
  indicators: ActiveIndicator[];
  drawings: Drawing[];
  onCrosshairTime?: (time: number | null) => void;
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

  // In-progress drawing anchors, kept off the store so each pointer move does
  // not trigger a React render.
  const pendingRef = useRef<{ tool: DrawingToolId; points: { time: number; price: number }[] } | null>(null);

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
        const tool = useWorkspace.getState().activeTool;
        if (!tool || info.time === null || info.price === null) return;
        const pending = pendingRef.current;
        if (!pending || pending.tool !== tool) {
          pendingRef.current = { tool, points: [{ time: info.time, price: info.price }] };
          return;
        }
        pending.points.push({ time: info.time, price: info.price });
        if (isComplete(tool, pending.points)) {
          const drawings = useWorkspace.getState().activeLayout().state.drawings;
          setDrawings([
            ...drawings,
            { id: newId(), tool, points: pending.points, style: { ...DEFAULT_DRAWING_STYLE } },
          ]);
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
      if (!cancelled) chartRef.current?.setData(candles);
    });
    return () => {
      cancelled = true;
    };
  }, [props.symbol, props.resolution]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setTheme(THEME_OF[props.theme]);
    chart.setShowVolume(props.showVolume);
    chart.setShowGrid(props.showGrid);
    chart.setIndicators(toInstances(props.indicators));
  }, [props.theme, props.showVolume, props.showGrid, props.indicators]);

  useEffect(() => {
    chartRef.current?.setChartType(props.chartType);
  }, [props.chartType]);

  useEffect(() => {
    chartRef.current?.setDrawings(props.drawings);
  }, [props.drawings]);

  // Switching tools abandons any half-placed drawing.
  useEffect(() => {
    if (!activeTool) pendingRef.current = null;
  }, [activeTool]);

  return <div ref={containerRef} className="absolute inset-0" data-testid="chart-host" />;
}

function toInstances(indicators: ActiveIndicator[]): IndicatorInstance[] {
  return indicators.map((i) => ({ uid: i.uid, def: i.def, params: i.params, colorIndex: i.colorIndex }));
}
