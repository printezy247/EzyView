import {
  AreaSeries,
  BarSeries,
  BaselineSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@ezyview/data-adapters";
import type { IndicatorDef, SeriesValue } from "@ezyview/indicators";
import type { Drawing, ScreenPoint } from "@ezyview/drawing-tools";
import { DrawingsPrimitive } from "./drawings.js";
import { DARK_THEME, colorAt, type ChartTheme } from "./theme.js";

export type ChartType = "candles" | "bars" | "hollow" | "line" | "area" | "baseline";

export interface IndicatorInstance {
  uid: string;
  def: IndicatorDef;
  params: Record<string, number | boolean | string>;
  colorIndex: number;
}

export interface ClickInfo {
  time: number | null;
  price: number | null;
  x: number;
  y: number;
}

export interface EzyChartOptions {
  theme?: ChartTheme;
  chartType?: ChartType;
  showVolume?: boolean;
  showGrid?: boolean;
  onCrosshairTime?: (time: number | null) => void;
  onClick?: (info: ClickInfo) => void;
}

/** Horizontal reference lines drawn automatically for certain indicators. */
const LEVEL_LINES: Record<string, number[]> = {
  rsi: [30, 70, 50],
  stoch: [20, 80, 50],
  willr: [-20, -80],
  cmo: [-50, 0, 50],
};

const PANE_HEIGHT = 140;

/**
 * Imperative wrapper around a Lightweight Charts instance.
 *
 * React owns only the container node; every series/pane reconciliation happens
 * here so React never talks to the chart API directly.
 */
export class EzyChart {
  private readonly chart: IChartApi;
  // Price→pixel for the drawing layer; reads mainSeries lazily so the field
  // can be initialized before the constructor runs createMainSeries().
  private readonly drawings = new DrawingsPrimitive((price) => this.priceToCoordinate(price));
  private mainSeries: ISeriesApi<never> | null = null;
  private volumeSeries: ISeriesApi<"Histogram"> | null = null;
  private readonly levelLines: IPriceLine[] = [];
  private readonly seriesByUid = new Map<string, ISeriesApi<never>[]>();
  private type: ChartType;
  private theme: ChartTheme;
  private showVolume: boolean;
  private opts: EzyChartOptions;
  private data: Candle[] = [];
  private drawingsLayer: Drawing[] = [];

  constructor(private readonly container: HTMLElement, options: EzyChartOptions = {}) {
    this.opts = options;
    this.type = options.chartType ?? "candles";
    this.theme = options.theme ?? DARK_THEME;
    this.showVolume = options.showVolume ?? true;

    this.chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: this.theme.background },
        textColor: this.theme.textColor,
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 11,
        panes: { separatorColor: this.theme.paneSeparator, enableResize: true },
      },
      grid: {
        vertLines: { color: options.showGrid === false ? "transparent" : this.theme.grid },
        horzLines: { color: options.showGrid === false ? "transparent" : this.theme.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: this.theme.crosshair, labelBackgroundColor: "#2962ff" },
        horzLine: { color: this.theme.crosshair, labelBackgroundColor: "#2962ff" },
      },
      rightPriceScale: { borderColor: this.theme.grid, scaleMargins: { top: 0.1, bottom: 0.16 } },
      timeScale: { borderColor: this.theme.grid, timeVisible: true, secondsVisible: false },
      localization: { priceFormatter: formatPrice },
    });

    this.chart.panes()[0]!.attachPrimitive(this.drawings);
    this.createMainSeries();
    if (this.showVolume) this.ensureVolume();

    this.chart.subscribeCrosshairMove((param) => {
      this.opts.onCrosshairTime?.(param.time === undefined ? null : Number(param.time));
    });

    this.chart.subscribeClick((param) => {
      const point = param.point;
      if (!point) return;
      const price = this.mainSeries?.coordinateToPrice(point.y) ?? null;
      this.opts.onClick?.({
        time: param.time === undefined ? null : Number(param.time),
        price: price === null ? null : Number(price),
        x: point.x,
        y: point.y,
      });
    });
  }

  // --- data -----------------------------------------------------------------

  setData(candles: Candle[]): void {
    this.data = candles;
    this.mainSeries?.setData(toSeriesData(this.type, candles));
    this.volumeSeries?.setData(toVolumeData(candles));
    // Refresh indicator series in place — rebuilding panes per tick is too costly.
    for (const inst of this.currentInstances) this.renderIndicator(inst, "refresh");
    this.drawings.setDrawings(this.drawingsLayer);
  }

  candles(): readonly Candle[] {
    return this.data;
  }

  // --- presentation ---------------------------------------------------------

  setChartType(type: ChartType): void {
    if (type === this.type) return;
    this.type = type;
    if (this.mainSeries) this.chart.removeSeries(this.mainSeries);
    this.createMainSeries();
    this.drawings.setDrawings(this.drawingsLayer);
  }

  setTheme(theme: ChartTheme): void {
    this.theme = theme;
    this.chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: theme.background },
        textColor: theme.textColor,
        panes: { separatorColor: theme.paneSeparator, enableResize: true },
      },
      grid: { vertLines: { color: theme.grid }, horzLines: { color: theme.grid } },
      crosshair: { vertLine: { color: theme.crosshair }, horzLine: { color: theme.crosshair } },
      rightPriceScale: { borderColor: theme.grid },
      timeScale: { borderColor: theme.grid },
    });
    this.applyCandleColors();
    for (const line of this.levelLines) line.applyOptions({ color: theme.paneSeparator });
  }

  setShowVolume(show: boolean): void {
    if (show === this.showVolume) return;
    this.showVolume = show;
    if (show) this.ensureVolume();
    else if (this.volumeSeries) {
      this.chart.removeSeries(this.volumeSeries);
      this.volumeSeries = null;
    }
  }

  setShowGrid(show: boolean): void {
    const color = show ? this.theme.grid : "transparent";
    this.chart.applyOptions({ grid: { vertLines: { color }, horzLines: { color } } });
  }

  // --- indicators -----------------------------------------------------------

  /**
   * Rebuild every indicator layer from scratch.
   *
   * Full teardown is deliberate: pane indices shift on removal, so patching in
   * place is where off-by-one pane bugs come from.
   */
  setIndicators(instances: IndicatorInstance[]): void {
    this.currentInstances = instances;

    for (const series of this.seriesByUid.values()) {
      for (const s of series) this.chart.removeSeries(s);
    }
    this.seriesByUid.clear();
    this.levelLines.length = 0;

    const panes = this.chart.panes();
    for (let i = panes.length - 1; i >= 1; i--) this.chart.removePane(i);

    for (const inst of instances) this.renderIndicator(inst, "create");

    this.drawings.setDrawings(this.drawingsLayer);
  }

  private currentInstances: IndicatorInstance[] = [];

  private renderIndicator(inst: IndicatorInstance, mode: "create" | "refresh"): void {
    const color = colorAt(inst.colorIndex);
    const values = inst.def.compute(
      {
        open: this.data.map((c) => c.open),
        high: this.data.map((c) => c.high),
        low: this.data.map((c) => c.low),
        close: this.data.map((c) => c.close),
        volume: this.data.map((c) => c.volume),
      },
      inst.params as Record<string, number | boolean>,
    );

    const overlay = inst.def.pane === "overlay";
    const specs: { values: SeriesValue[]; color: string; hist: boolean }[] = [
      { values: values.values, color, hist: false },
      ...Object.entries(values.plots ?? {}).map(([name, v]) => ({
        values: v,
        color: name === "hist" ? "#787b86" : color,
        hist: name === "hist",
      })),
    ];

    if (mode === "refresh") {
      const existing = this.seriesByUid.get(inst.uid) ?? [];
      existing.forEach((series, i) => {
        const spec = specs[i];
        if (!spec) return;
        series.setData(toValueData(this.data, spec.values, undefined, spec.hist && !overlay));
      });
      return;
    }

    const paneIndex = overlay ? 0 : this.chart.addPane().paneIndex();
    const created: ISeriesApi<never>[] = [];
    for (const spec of specs) {
      if (spec.hist && !overlay) {
        const series = this.chart.addSeries(
          HistogramSeries,
          { priceLineVisible: false, lastValueVisible: false, priceFormat: { type: "price", precision: 4, minMove: 0.0001 } },
          paneIndex,
        );
        series.setData(toValueData(this.data, spec.values, undefined, true));
        created.push(series as ISeriesApi<never>);
        continue;
      }
      const series = this.chart.addSeries(
        LineSeries,
        {
          color: spec.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          ...(overlay ? {} : { priceScaleId: "" }),
        },
        paneIndex,
      );
      series.setData(toValueData(this.data, spec.values));
      created.push(series as ISeriesApi<never>);
    }
    this.seriesByUid.set(inst.uid, created);

    if (!overlay) {
      this.chart.panes()[paneIndex]?.setHeight(PANE_HEIGHT);
      const levels = LEVEL_LINES[inst.def.id];
      const host = created[0];
      if (levels && host) {
        for (const value of levels) {
          this.levelLines.push(
            host.createPriceLine({
              price: value,
              color: this.theme.paneSeparator,
              lineWidth: 1,
              lineStyle: LineStyle.Dotted,
              axisLabelVisible: false,
              title: "",
            }),
          );
        }
      }
    }
  }

  // --- drawings -------------------------------------------------------------

  setDrawings(drawings: Drawing[]): void {
    this.drawingsLayer = drawings;
    this.drawings.setDrawings(drawings);
  }

  /** Project a drawing's anchors into pixels for hit-testing. */
  projectDrawing(drawing: Drawing): (ScreenPoint | null)[] {
    return this.drawings.project(drawing);
  }

  coordinateToTime(x: number): number | null {
    const time = this.chart.timeScale().coordinateToTime(x);
    return time === null ? null : Number(time);
  }

  coordinateToPrice(y: number): number | null {
    const price = this.mainSeries?.coordinateToPrice(y) ?? null;
    return price === null ? null : Number(price);
  }

  priceToCoordinate(price: number): number | null {
    const c = this.mainSeries?.priceToCoordinate(price) ?? null;
    return c === null ? null : Number(c);
  }

  timeToCoordinate(time: number): number | null {
    const c = this.chart.timeScale().timeToCoordinate(time as UTCTimestamp);
    return c === null ? null : Number(c);
  }

  fitContent(): void {
    this.chart.timeScale().fitContent();
  }

  destroy(): void {
    this.chart.remove();
  }

  // --- internals ------------------------------------------------------------

  private createMainSeries(): void {
    const base = { priceLineVisible: false, lastValueVisible: true };
    switch (this.type) {
      case "line":
        this.mainSeries = this.chart.addSeries(LineSeries, { ...base, lineWidth: 2, color: "#2962ff" }) as ISeriesApi<never>;
        break;
      case "area":
        this.mainSeries = this.chart.addSeries(AreaSeries, {
          ...base,
          lineColor: "#2962ff",
          topColor: "rgba(41,98,255,0.28)",
          bottomColor: "rgba(41,98,255,0.02)",
        }) as ISeriesApi<never>;
        break;
      case "baseline":
        this.mainSeries = this.chart.addSeries(BaselineSeries, {
          ...base,
          baseValue: { type: "price", price: 0 },
          topLineColor: "#26a69a",
          topFillColor1: "rgba(38,166,154,0.28)",
          topFillColor2: "rgba(38,166,154,0.05)",
          bottomLineColor: "#ef5350",
          bottomFillColor1: "rgba(239,83,80,0.05)",
          bottomFillColor2: "rgba(239,83,80,0.28)",
        }) as ISeriesApi<never>;
        break;
      case "bars":
        this.mainSeries = this.chart.addSeries(BarSeries, { ...base }) as ISeriesApi<never>;
        break;
      case "hollow":
        this.mainSeries = this.chart.addSeries(CandlestickSeries, {
          ...base,
          upColor: "transparent",
          downColor: "transparent",
          borderVisible: true,
          wickVisible: true,
        }) as ISeriesApi<never>;
        break;
      default:
        this.mainSeries = this.chart.addSeries(CandlestickSeries, { ...base, borderVisible: true, wickVisible: true }) as ISeriesApi<never>;
    }
    this.applyCandleColors();
    this.mainSeries.setData(toSeriesData(this.type, this.data));
  }

  private applyCandleColors(): void {
    if (!this.mainSeries) return;
    if (this.type !== "candles" && this.type !== "hollow" && this.type !== "bars") return;
    const t = this.theme;
    const series = this.mainSeries as ISeriesApi<"Candlestick">;
    if (this.type === "hollow") {
      series.applyOptions({
        upColor: "transparent",
        downColor: "transparent",
        borderUpColor: t.upColor,
        borderDownColor: t.downColor,
        wickUpColor: t.wickUpColor,
        wickDownColor: t.wickDownColor,
        borderVisible: true,
        wickVisible: true,
      });
      return;
    }
    series.applyOptions({
      upColor: t.upColor,
      downColor: t.downColor,
      borderUpColor: t.borderUpColor,
      borderDownColor: t.borderDownColor,
      wickUpColor: t.wickUpColor,
      wickDownColor: t.wickDownColor,
      borderVisible: true,
      wickVisible: true,
    });
  }

  private ensureVolume(): void {
    if (this.volumeSeries) return;
    this.volumeSeries = this.chart.addSeries(HistogramSeries, {
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: "volume" },
    });
    this.volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    this.volumeSeries.setData(toVolumeData(this.data));
  }
}

// --- data mapping -----------------------------------------------------------

function toSeriesData(type: ChartType, candles: Candle[]): never[] {
  if (type === "line" || type === "area" || type === "baseline") {
    return candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })) as never[];
  }
  return candles.map((c) => ({
    time: c.time as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  })) as never[];
}

function toValueData(candles: Candle[], values: SeriesValue[], color?: string, byColor?: boolean): never[] {
  const out: never[] = [];
  for (let i = 0; i < candles.length; i++) {
    const v = values[i];
    if (v === null || v === undefined) continue;
    const c = candles[i]!;
    const barColor = byColor ? (c.close >= c.open ? "rgba(38,166,154,0.8)" : "rgba(239,83,80,0.8)") : color;
    out.push({ time: c.time as UTCTimestamp, value: v, ...(barColor ? { color: barColor } : {}) } as never);
  }
  return out;
}

function toVolumeData(candles: Candle[]): never[] {
  return candles.map((c) => ({
    time: c.time as UTCTimestamp,
    value: c.volume,
    color: c.close >= c.open ? "rgba(38,166,154,0.5)" : "rgba(239,83,80,0.5)",
  })) as never[];
}

function formatPrice(price: number): string {
  const abs = Math.abs(price);
  if (abs >= 1000) return price.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (abs >= 1) return price.toFixed(4);
  return price.toFixed(6);
}
