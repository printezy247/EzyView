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
  LineType,
  PriceScaleMode,
  createChart,
  createSeriesMarkers,
  createTextWatermark,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type ITextWatermarkPluginApi,
  type SeriesMarker,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, Impact } from "@ezyview/data-adapters";
import type { IndicatorDef, SeriesResult, SeriesValue } from "@ezyview/indicators";
import type { Drawing, ScreenPoint } from "@ezyview/drawing-tools";
import { BgBandsPrimitive } from "./bands.js";
import { FundamentalLinesPrimitive, type FundamentalLine } from "./fundamentalLines.js";
import { DrawingsPrimitive } from "./drawings.js";
import { DARK_THEME, colorAt, type ChartTheme } from "./theme.js";
import { crosshairModeOf, priceScaleModeOf, timezoneFormatters, type CrosshairModeName, type PriceScaleModeName } from "./settings.js";
import { autoBoxSize, heikinAshi, kagi, pointAndFigure, renko, sequentialTimes, type PriceBox } from "./transforms.js";
import { VolumeProfilePrimitive } from "./volumeProfile.js";
import { sessionBreaks } from "./sessionBreaks.js";

export type ChartType =
  | "candles"
  | "bars"
  | "hollow"
  | "heikin"
  | "line"
  | "area"
  | "baseline"
  | "renko"
  | "kagi"
  | "pnf";

/**
 * Renko, Kagi and Point & Figure plot price moves, not time: their bars do not
 * line up with candles, so time-aligned layers (volume, indicators, scripts)
 * are hidden while one is shown.
 */
export function isTimeBased(type: ChartType): boolean {
  return type !== "renko" && type !== "kagi" && type !== "pnf";
}

/** Types drawn with the candlestick series and the theme's up/down colors. */
const CANDLE_TYPES = new Set<ChartType>(["candles", "hollow", "bars", "heikin", "renko", "pnf"]);

export interface IndicatorInstance {
  uid: string;
  def: IndicatorDef;
  params: Record<string, number | boolean | string>;
  colorIndex: number;
}

/** One output of a compiled Pine script, already coerced to chart-ready values. */
export interface ScriptPlotSpec {
  /** Stable across re-runs of the same script: `<scriptId>:<site>`. */
  uid: string;
  title: string;
  /** One entry per bar, aligned to the candle series; null = `na`. */
  values: SeriesValue[];
  color: string;
  linewidth: number;
  style: "line" | "histogram" | "cross" | "shape" | "circle" | "triangle";
  /** `overlay=false` gives the plot its own pane instead of sharing price. */
  overlay: boolean;
}

export interface ClickInfo {
  time: number | null;
  price: number | null;
  x: number;
  y: number;
}

/** One constant level drawn across the price scale for the open position. */
export interface TradingLine {
  price: number;
  color: string;
  title: string;
  /** Exits are dashed so the entry reads as the primary level. */
  dashed?: boolean;
}

export interface EzyChartOptions {
  theme?: ChartTheme;
  chartType?: ChartType;
  showVolume?: boolean;
  showVolumeProfile?: boolean;
  /** Renko/P&F box and Kagi reversal size; `null` or absent sizes it from the ATR. */
  boxSize?: number | null;
  showGrid?: boolean;
  onCrosshairTime?: (time: number | null) => void;
  /** Crosshair move with both coordinates — feeds crosshair sync across cells. */
  onCrosshairMove?: (time: number | null, price: number | null) => void;
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

/** Plot styles rendered as bar markers rather than a value series. */
const MARKER_STYLES = new Set<ScriptPlotSpec["style"]>(["shape", "circle", "triangle", "cross"]);

/** Pine line widths are unbounded; the chart only draws 1–4 px. */
function toLineWidth(width: number): 1 | 2 | 3 | 4 {
  const n = Math.trunc(width);
  if (n <= 1) return 1;
  if (n === 2) return 2;
  if (n === 3) return 3;
  return 4;
}

/** `#rrggbb` at reduced opacity for the watermark; other formats pass through. */
function translucent(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = Number.parseInt(m[1]!, 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${alpha})`;
}

// --- fundamental event overlays ----------------------------------------------

/**
 * Structural twin of `@ezyview/fundamentals`' `fundamentalOverlays` output.
 * Defined here (not imported) so the chart engine never depends on that package.
 * Times are epoch seconds.
 */
export interface FundamentalEventOverlay {
  markers: FundamentalEventMarker[];
  lines: number[];
}

/** One earnings dot or economic-event marker on the time axis. */
export interface FundamentalEventMarker {
  time: number;
  title: string;
  kind: "earnings" | "event";
  impact?: Impact;
}

/** Impact colours shared by event markers and their vertical lines. */
const IMPACT_COLORS: Record<Impact, string> = {
  high: "#f23645",
  medium: "#ff9800",
  low: "#787b86",
  none: "#787b86",
};

/** Earnings dots use the platform's amber so they read apart from events. */
const EARNINGS_COLOR = "#f0b90b";

/** Map overlay markers onto LWC series markers: amber circles and impact squares. */
export function toFundamentalMarkers(markers: readonly FundamentalEventMarker[]): SeriesMarker<Time>[] {
  return markers
    .map(
      (m): SeriesMarker<Time> => ({
        time: m.time as UTCTimestamp,
        position: "aboveBar",
        shape: m.kind === "earnings" ? "circle" : "square",
        color: m.kind === "earnings" ? EARNINGS_COLOR : IMPACT_COLORS[m.impact ?? "high"],
      }),
    )
    .sort((a, b) => Number(a.time) - Number(b.time));
}

/** Vertical lines with the impact colour of the event marker at the same time. */
export function toFundamentalLines(overlays: FundamentalEventOverlay): FundamentalLine[] {
  const impactAt = new Map<number, Impact>();
  for (const m of overlays.markers) {
    if (m.kind === "event") impactAt.set(m.time, m.impact ?? "high");
  }
  return [...overlays.lines]
    .map((time): FundamentalLine => ({ time, color: IMPACT_COLORS[impactAt.get(time) ?? "high"] }))
    .sort((a, b) => a.time - b.time);
}

/**
 * Script `plotshape()` markers and fundamental event markers, composited into
 * one time-ascending list for the series-markers plugin. Neither input is
 * mutated, so replacing or clearing the fundamentals layer always leaves the
 * script layer intact.
 */
export function mergeMarkerLayers(
  script: readonly SeriesMarker<Time>[],
  fundamental: readonly SeriesMarker<Time>[],
): SeriesMarker<Time>[] {
  // Stable sort: equal times keep script markers ahead of fundamentals.
  return [...script, ...fundamental].sort((a, b) => Number(a.time) - Number(b.time));
}

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
  private readonly plotSeriesByUid = new Map<string, ISeriesApi<never>[]>();
  /** Translucent `bgcolor()` regions, painted behind the price series. */
  private readonly bgBands = new BgBandsPrimitive();
  /**
   * Session shading, in its own primitive rather than sharing `bgBands`: a Pine
   * script's `bgcolor()` and the session break are independent layers, and
   * merging them into one call would mean the last writer wins.
   */
  private readonly sessionBands = new BgBandsPrimitive();
  /** Volume-by-price for the visible range, along the right edge. */
  private readonly volumeProfile = new VolumeProfilePrimitive((price) => this.priceToCoordinate(price));
  /** Markers contributed by `plotshape()`-style plots, rebuilt with the data. */
  private markerLayer: SeriesMarker<Time>[] = [];
  /** Earnings dots + event squares from `setFundamentalEvents`, kept apart from script markers. */
  private fundamentalMarkerLayer: SeriesMarker<Time>[] = [];
  /** Full-pane dashed lines for macro events; a primitive, never a drawing. */
  private readonly fundamentalLines = new FundamentalLinesPrimitive();
  /** v5 exposes markers as a series plugin, so it is bound to the main series. */
  private markerApi: ISeriesMarkersPluginApi<Time> | null = null;
  /** Entry/stop/target levels for the open position, drawn as price lines. */
  private tradingLines: TradingLine[] = [];
  private priceLineApi: IPriceLine[] = [];
  /** Attached symbol watermark, or null while the watermark is off. */
  private watermark: ITextWatermarkPluginApi<Time> | null = null;
  /** Current watermark text, kept so a theme change can recolour it. */
  private watermarkText: string | null = null;
  private type: ChartType;
  private theme: ChartTheme;
  private showVolume: boolean;
  private opts: EzyChartOptions;
  private data: Candle[] = [];
  private drawingsLayer: Drawing[] = [];
  private boxSize: number | null;
  /** Last main-series points and what they were built from, so a theme or type round-trip reuses them. */
  private seriesCache: { data: Candle[]; type: ChartType; theme: ChartTheme; box: number | null; points: never[] } | null =
    null;
  private sharedOhlcv: { open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] } | null = null;
  private sharedOhlcvKey = "";

  private getSharedOhlcv(): { open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] } {
    const last = this.data.at(-1);
    const key = `${this.data.length}|${last?.time ?? 0}|${last?.close ?? 0}`;
    if (this.sharedOhlcv && this.sharedOhlcvKey === key) return this.sharedOhlcv;
    const n = this.data.length;
    const open: number[] = [];
    open.length = n;
    const high: number[] = [];
    high.length = n;
    const low: number[] = [];
    low.length = n;
    const close: number[] = [];
    close.length = n;
    const volume: number[] = [];
    volume.length = n;
    for (let i = 0; i < n; i++) {
      const c = this.data[i]!;
      open[i] = c.open;
      high[i] = c.high;
      low[i] = c.low;
      close[i] = c.close;
      volume[i] = c.volume;
    }
    this.sharedOhlcv = { open, high, low, close, volume };
    this.sharedOhlcvKey = key;
    return this.sharedOhlcv;
  }

  /** Debug: count of click events received by this chart instance. */
  clickCount = 0;
  /** Debug: most recent click coordinates and wall-clock time. */
  lastClick: { x: number; y: number; t: number } | null = null;

  constructor(private readonly container: HTMLElement, options: EzyChartOptions = {}) {
    this.opts = options;
    this.type = options.chartType ?? "candles";
    this.theme = options.theme ?? DARK_THEME;
    this.showVolume = options.showVolume ?? true;
    this.boxSize = options.boxSize ?? null;

    this.chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: this.theme.background },
        textColor: this.theme.textColor,
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 11,
        panes: { separatorColor: this.theme.paneSeparator, enableResize: true },
        // The library's own attribution logo is off because EzyView meets the
        // licence's linking requirement itself: the TradingView notice and a
        // link to tradingview.com are in Settings -> Diagnostics and in the
        // NOTICE file shipped with the source. The licence allows the logo to
        // be disabled once that requirement is fulfilled.
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: options.showGrid === false ? "transparent" : this.theme.grid },
        horzLines: { color: options.showGrid === false ? "transparent" : this.theme.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: this.theme.crosshair, labelBackgroundColor: this.theme.accent },
        horzLine: { color: this.theme.crosshair, labelBackgroundColor: this.theme.accent },
      },
      rightPriceScale: { borderColor: this.theme.grid, scaleMargins: { top: 0.1, bottom: 0.16 } },
      timeScale: { borderColor: this.theme.grid, timeVisible: true, secondsVisible: false },
      localization: { priceFormatter: formatPrice },
    });

    this.chart.panes()[0]!.attachPrimitive(this.drawings);
    this.chart.panes()[0]!.attachPrimitive(this.bgBands);
    this.chart.panes()[0]!.attachPrimitive(this.sessionBands);
    this.chart.panes()[0]!.attachPrimitive(this.fundamentalLines);
    this.chart.panes()[0]!.attachPrimitive(this.volumeProfile);
    this.volumeProfile.setEnabled(options.showVolumeProfile ?? false);
    this.volumeProfile.setColors(this.theme.upColor, this.theme.downColor);
    this.createMainSeries();
    if (this.showVolume) this.ensureVolume();

    this.chart.subscribeCrosshairMove((param) => {
      const time = param.time === undefined ? null : Number(param.time);
      this.opts.onCrosshairTime?.(time);
      if (this.opts.onCrosshairMove) {
        const y = param.point?.y;
        const price = y === undefined || !this.mainSeries ? null : this.mainSeries.coordinateToPrice(y);
        this.opts.onCrosshairMove(time, price === null ? null : Number(price));
      }
    });

    this.chart.subscribeClick((param) => {
      const point = param.point;
      if (!point) {
        this.clickCount += 1;
        this.lastClick = { x: -1, y: -1, t: Date.now() };
        return;
      }
      const result = this.screenToTimePrice(point.x, point.y);
      this.opts.onClick?.({
        time: result.time,
        price: result.price,
        x: point.x,
        y: point.y,
      });
    });
  }

  // --- data -----------------------------------------------------------------

  setData(candles: Candle[]): void {
    const firstLoad = this.data.length === 0;
    this.data = candles;
    this.mainSeries?.setData(this.seriesData());
    this.volumeSeries?.setData(toVolumeData(this.layerData));
    this.volumeProfile.setCandles(candles);
    // Refresh indicator series in place — rebuilding panes per tick is too costly.
    for (const inst of this.currentInstances) this.renderIndicator(inst, "refresh");
    for (const plot of this.currentPlots) this.renderPlot(plot, "refresh");
    this.syncScriptLayers();
    this.drawings.setDrawings(this.drawingsLayer);
    if (firstLoad) this.frameBars();
  }

  /**
   * Price-only types print a few dozen bars at most, which the default bar
   * spacing would crowd against the right edge, so they fill the width.
   */
  private frameBars(): void {
    if (isTimeBased(this.type)) this.chart.timeScale().resetTimeScale();
    else this.chart.timeScale().fitContent();
  }

  candles(): readonly Candle[] {
    return this.data;
  }

  /**
   * Snapshot of the chart's own panes: lightweight-charts composites every
   * layer it owns into one canvas (`IChartApi.takeScreenshot`,
   * node_modules/lightweight-charts/dist/typings.d.ts:1767).
   *
   * The export bridge does NOT use this by default — it composites the whole
   * host container instead (chartImage.ts) for parity with journal capture,
   * which also picks up canvases drawn outside lightweight-charts. This is
   * the single-canvas alternative when only the engine's own layers matter.
   */
  takeScreenshot(): HTMLCanvasElement | null {
    try {
      return this.chart.takeScreenshot();
    } catch {
      // No canvas or no backing store yet: an empty snapshot, never a throw.
      return null;
    }
  }

  /** Candles for time-aligned layers; none while a price-only type is shown. */
  private get layerData(): Candle[] {
    return isTimeBased(this.type) ? this.data : [];
  }

  // --- presentation ---------------------------------------------------------

  setChartType(type: ChartType): void {
    if (type === this.type) return;
    const axisChanged = isTimeBased(type) !== isTimeBased(this.type) || !isTimeBased(type);
    this.type = type;
    // The marker plugin is bound to the series instance about to be removed.
    this.resetMarkers();
    if (this.mainSeries) this.chart.removeSeries(this.mainSeries);
    this.createMainSeries();
    if (axisChanged) {
      // Price-only types have their own bar count; show or hide the
      // time-aligned layers, then frame the new bars.
      this.volumeSeries?.setData(toVolumeData(this.layerData));
      this.reconcileLayers();
      this.frameBars();
    }
    this.drawings.setDrawings(this.drawingsLayer);
  }

  setShowVolumeProfile(show: boolean): void {
    this.volumeProfile.setEnabled(show);
  }

  /** Box (Renko, P&F) or reversal (Kagi) size; `null` or a non-positive value means automatic. */
  setBoxSize(size: number | null): void {
    const next = size !== null && size > 0 ? size : null;
    if (next === this.boxSize) return;
    this.boxSize = next;
    if (!isTimeBased(this.type)) {
      this.mainSeries?.setData(this.seriesData());
      this.frameBars();
    }
  }

  /** The box size in use: the user's, or the ATR-based default for the loaded candles. */
  effectiveBoxSize(): number {
    return this.boxSize ?? autoBoxSize(this.data);
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
    this.volumeProfile.setColors(theme.upColor, theme.downColor);
    // The watermark tints with the theme's text colour.
    if (this.watermark && this.watermarkText) {
      this.watermark.applyOptions({
        lines: [{ text: this.watermarkText, color: translucent(theme.textColor, 0.12) }],
      });
    }
    // Kagi colors its line per point, so the data carries the theme.
    if (this.type === "kagi") this.mainSeries?.setData(this.seriesData());
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

  /** Crosshair interaction style: free, snapped to bar OHLC, or hidden. */
  setCrosshairMode(mode: CrosshairModeName): void {
    this.chart.applyOptions({ crosshair: { mode: crosshairModeOf(mode) } });
  }

  /**
   * Right price-scale rendering: linear, log or percentage.
   *
   * Log/percentage on data that never goes positive can make LWC's autoscale
   * non-finite; if the chart refuses the option, fall back to linear rather
   * than leave the axis broken.
   */
  setPriceScaleMode(mode: PriceScaleModeName): void {
    try {
      this.chart.priceScale("right").applyOptions({ mode: priceScaleModeOf(mode) });
    } catch {
      this.chart.priceScale("right").applyOptions({ mode: PriceScaleMode.Normal });
    }
  }

  /** Flip the right price scale upside-down. */
  setInvertScale(invert: boolean): void {
    this.chart.priceScale("right").applyOptions({ invertScale: invert });
  }

  /**
   * Pin the time axis and crosshair label to an IANA zone; null restores the
   * Lightweight Charts defaults. `applyOptions` ignores `undefined`, so the
   * helper always returns explicit formatters (see `timezoneFormatters`).
   */
  setTimezone(tz: string | null): void {
    const fmt = timezoneFormatters(tz);
    this.chart.applyOptions({
      localization: { timeFormatter: fmt.timeFormatter },
      timeScale: { tickMarkFormatter: fmt.tickMarkFormatter },
    });
  }

  /**
   * Draw (or replace) the symbol watermark behind the candles; null removes it.
   * The text rides a pane primitive, so it never intercepts pointer events.
   */
  setWatermark(text: string | null): void {
    const pane = this.chart.panes()[0];
    if (!pane) return;
    this.watermarkText = text;
    if (!text) {
      if (this.watermark) {
        this.watermark.detach();
        this.watermark = null;
      }
      return;
    }
    const lines = [{ text, color: translucent(this.theme.textColor, 0.12) }];
    if (this.watermark) this.watermark.applyOptions({ lines });
    else this.watermark = createTextWatermark(pane, { lines, horzAlign: "center", vertAlign: "center" });
  }

  /**
   * Draw (or replace) earnings markers and macro-event vertical lines.
   *
   * Kept in a layer of its own so a refresh never disturbs script markers;
   * empty overlays clear the fundamentals state and leave the script layer
   * alone. Lines are a pane primitive, so they survive series rebuilds and
   * never enter the drawings/undo stack.
   */
  setFundamentalEvents(overlays: FundamentalEventOverlay): void {
    this.fundamentalMarkerLayer = toFundamentalMarkers(overlays.markers);
    this.fundamentalLines.setLines(toFundamentalLines(overlays));
    this.applyMarkers();
  }

  /**
   * Shade the bars outside a trading session.
   *
   * `sessionId` is one of `MARKET_SESSIONS`; an unknown id (or an empty list)
   * clears the shading, since there is nothing to assert about a symbol whose
   * session has not been declared. The times are the loaded bars, so the flags
   * line up with what is actually on screen.
   */
  setSessionShading(times: readonly number[], sessionId: string | null, color: string): void {
    if (!sessionId || times.length === 0) {
      this.sessionBands.setBands([], []);
      return;
    }
    const breaks = sessionBreaks(times, sessionId);
    this.sessionBands.setBands(breaks.length > 0 ? [{ color, flags: breaks }] : [], times as UTCTimestamp[]);
  }

  /**
   * Move the crosshair to a time/price on this chart — the read side of
   * crosshair sync. LWC's own API; no-op until a main series exists.
   */
  showCrosshairAt(price: number, time: number): void {
    if (!this.mainSeries) return;
    this.chart.setCrosshairPosition(price, time as UTCTimestamp, this.mainSeries);
  }

  /** Clear a sync-imposed crosshair position (pointer left the source chart). */
  clearCrosshairPosition(): void {
    this.chart.clearCrosshairPosition();
  }

  /**
   * Draw the open position's levels on the price scale.
   *
   * Price lines rather than a series: an entry/stop/target is a constant level,
   * and giving each one a series would drag the price scale around with it.
   */
  setTradingLines(lines: TradingLine[]): void {
    this.tradingLines = lines;
    this.applyTradingLines();
  }

  private applyTradingLines(): void {
    // Price lines belong to the series they were made from, which a chart-type
    // switch or an unmount has already discarded.
    const series = this.mainSeries as unknown as ISeriesApi<SeriesType, Time> | null;
    for (const line of this.priceLineApi) series?.removePriceLine(line);
    this.priceLineApi = [];
    if (!series) return;
    for (const line of this.tradingLines) {
      this.priceLineApi.push(
        series.createPriceLine({
          price: line.price,
          color: line.color,
          lineWidth: 1,
          lineStyle: line.dashed ? LineStyle.Dashed : LineStyle.Solid,
          axisLabelVisible: true,
          title: line.title,
        }),
      );
    }
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
    this.reconcileLayers();
  }

  private currentInstances: IndicatorInstance[] = [];
  /** Cached indicator results, keyed by instance. */
  private indicatorCache = new Map<string, { key: string; values: SeriesResult }>();

  /**
   * Replace every Pine output on the chart.
   *
   * Called as one job with the indicator pass because pane indices shift on
   * removal — two independent reconcilers would fight over the same panes.
   */
  setScriptPlots(plots: readonly ScriptPlotSpec[], bands: readonly { color: string; values: SeriesValue[] }[] = []): void {
    this.currentPlots = [...plots];
    this.currentBands = [...bands];
    this.reconcileLayers();
  }

  private currentPlots: ScriptPlotSpec[] = [];
  private currentBands: { color: string; values: SeriesValue[] }[] = [];

  /**
   * Tear down every overlay layer and rebuild indicators then script plots.
   *
   * Full teardown is deliberate: pane indices shift on removal, so patching in
   * place is where off-by-one pane bugs come from.
   */
  private reconcileLayers(): void {
    for (const series of this.seriesByUid.values()) {
      for (const s of series) this.chart.removeSeries(s);
    }
    for (const series of this.plotSeriesByUid.values()) {
      for (const s of series) this.chart.removeSeries(s);
    }
    this.seriesByUid.clear();
    this.plotSeriesByUid.clear();
    this.levelLines.length = 0;

    const panes = this.chart.panes();
    for (let i = panes.length - 1; i >= 1; i--) this.chart.removePane(i);

    if (isTimeBased(this.type)) {
      for (const inst of this.currentInstances) this.renderIndicator(inst, "create");
      for (const plot of this.currentPlots) this.renderPlot(plot, "create");
    }
    this.syncScriptLayers();

    this.drawings.setDrawings(this.drawingsLayer);
  }

  /** Push `bgcolor()` bands and `plotshape()` markers onto the live data. */
  private syncScriptLayers(): void {
    const data = this.layerData;
    this.bgBands.setBands(
      this.currentBands.map((b) => ({ color: b.color, flags: this.litFlags(b.values) })),
      data.map((c) => c.time as UTCTimestamp),
    );
    this.markerLayer = this.buildMarkers();

    // In replay mode, do not pass future fundamental markers ahead of visible candles
    const maxTime = data.length > 0 ? Number(data[data.length - 1]!.time) : Infinity;
    const visibleFundamentals = Number.isFinite(maxTime)
      ? this.fundamentalMarkerLayer.filter((m) => Number(m.time) <= maxTime)
      : this.fundamentalMarkerLayer;

    this.applyMarkers(visibleFundamentals);
  }

  /** A band is lit wherever its value is a present, non-`na` number. */
  private litFlags(values: SeriesValue[]): boolean[] {
    return Array.from({ length: this.layerData.length }, (_, i) => typeof values[i] === "number");
  }

  /** Markers for every shape-style plot, ordered the way the chart requires. */
  private buildMarkers(): SeriesMarker<Time>[] {
    const out: SeriesMarker<Time>[] = [];
    const data = this.layerData;
    for (const plot of this.currentPlots) {
      if (!MARKER_STYLES.has(plot.style)) continue;
      for (let i = 0; i < data.length; i++) {
        const value = plot.values[i];
        if (typeof value !== "number") continue;
        // `location.top`/`bottom` pin the value far off-scale on purpose.
        out.push({
          time: data[i]!.time as UTCTimestamp,
          position: value < -1e15 ? "belowBar" : "aboveBar",
          shape: plot.style === "triangle" ? "arrowUp" : plot.style === "cross" ? "square" : "circle",
          color: plot.color,
        });
      }
    }
    return [...out].sort((a, b) => Number(a.time) - Number(b.time));
  }

  /**
   * Push the composited script + fundamental markers onto the main series,
   * creating the plugin on first use so an empty chart costs nothing.
   */
  private applyMarkers(fundamentals = this.fundamentalMarkerLayer): void {
    const series = this.mainSeries;
    if (!series) return;
    const merged = mergeMarkerLayers(this.markerLayer, fundamentals);
    if (this.markerApi === null) {
      if (merged.length === 0) return;
      this.markerApi = createSeriesMarkers(
        series as unknown as ISeriesApi<SeriesType, Time>,
        [...merged],
      );
      return;
    }
    this.markerApi.setMarkers([...merged]);
  }

  /** The plugin is bound to one series instance; unbind before rebuilding it. */
  private resetMarkers(): void {
    this.markerApi?.detach();
    this.markerApi = null;
  }

  private renderPlot(plot: ScriptPlotSpec, mode: "create" | "refresh"): void {
    // Shapes ride on the candle series rather than getting one of their own.
    if (MARKER_STYLES.has(plot.style)) return;

    if (mode === "refresh") {
      const series = this.plotSeriesByUid.get(plot.uid)?.[0];
      if (!series) return;
      series.setData(
        plot.style === "histogram"
          ? toValueData(this.data, plot.values, plot.color, true)
          : toValueData(this.data, plot.values),
      );
      return;
    }

    const overlay = plot.overlay;
    const paneIndex = overlay ? 0 : this.chart.addPane().paneIndex();
    const created: ISeriesApi<never>[] = [];

    if (plot.style === "histogram") {
      const series = this.chart.addSeries(
        HistogramSeries,
        { priceLineVisible: false, lastValueVisible: false, priceFormat: { type: "price", precision: 4, minMove: 0.0001 } },
        paneIndex,
      );
      series.setData(toValueData(this.data, plot.values, plot.color, true));
      created.push(series as ISeriesApi<never>);
    } else {
      const series = this.chart.addSeries(
        LineSeries,
        {
          color: plot.color,
          lineWidth: toLineWidth(plot.linewidth),
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          ...(overlay ? {} : { priceScaleId: "" }),
        },
        paneIndex,
      );
      series.setData(toValueData(this.data, plot.values));
      created.push(series as ISeriesApi<never>);
    }

    this.plotSeriesByUid.set(plot.uid, created);
    if (!overlay) this.chart.panes()[paneIndex]?.setHeight(PANE_HEIGHT);
  }

  /**
   * The indicator's values, recomputed only when they can have changed.
   *
   * The live tick calls `setData` every second, and a full recompute over
   * the whole history is O(n) per indicator - Ichimoku alone runs six
   * O(n * period) helpers. The result is cached against the bar count, the
   * last bar's time and the parameters, so a tick that only moves the last
   * bar still recomputes (the values did change) but a re-render with the
   * same data does not.
   */
  private indicatorValues(inst: IndicatorInstance): SeriesResult {
    const last = this.data.at(-1);
    const key = `${inst.uid}|${this.data.length}|${last?.time ?? 0}|${last?.close ?? 0}|${JSON.stringify(inst.params)}`;
    const cached = this.indicatorCache.get(inst.uid);
    if (cached && cached.key === key) return cached.values;
    const values = inst.def.compute(
      this.getSharedOhlcv(),
      inst.params as Record<string, number | boolean>,
    );
    this.indicatorCache.set(inst.uid, { key, values });
    return values;
  }

  private renderIndicator(inst: IndicatorInstance, mode: "create" | "refresh"): void {
    const color = colorAt(inst.colorIndex);
    const values = this.indicatorValues(inst);

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

  /** Highlight one drawing's anchors (null clears the highlight). */
  setSelection(id: string | null): void {
    this.drawings.setSelection(id);
  }

  /**
   * Enable or disable drag-to-scroll and drag-to-scale on the chart. Drawing
   * drags turn this off so grabbing a drawing never pans the chart.
   */
  setPanEnabled(enabled: boolean): void {
    this.chart.applyOptions({ handleScroll: enabled, handleScale: enabled });
  }

  /** Project a drawing's anchors into pixels for hit-testing. */
  projectDrawing(drawing: Drawing): (ScreenPoint | null)[] {
    return this.drawings.project(drawing);
  }

  /**
   * Convert a pixel position to a (time, price) pair, validating finiteness and
   * plot-area bounds. Returns `{ ok:false, time:null, price:null, reason }` when
   * the click cannot be placed (outside the plot area, non-finite conversion,
   * or NaN/Infinity input). Increments the debug click counter on every call.
   */
  screenToTimePrice(x: number, y: number): { ok: boolean; time: number | null; price: number | null; reason: string | null } {
    this.clickCount += 1;
    this.lastClick = { x, y, t: Date.now() };

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { ok: false, time: null, price: null, reason: "non-finite" };
    }

    const time = this.coordinateToTime(x);
    const price = this.coordinateToPrice(y);
    if (time === null || price === null) {
      return { ok: false, time: null, price: null, reason: "outside chart" };
    }
    if (!Number.isFinite(time) || !Number.isFinite(price)) {
      return { ok: false, time: null, price: null, reason: "non-finite" };
    }
    return { ok: true, time, price, reason: null };
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

  /** Scroll the view so the rightmost candle is visible at the right edge. */
  scrollToRealTime(): void {
    try {
      this.chart.timeScale().scrollToPosition(3, false);
    } catch {
      // Safe no-op if timeScale is unattached
    }
  }

  /** Show `[from, to]` (epoch seconds); times outside the data leave blank space. */
  setVisibleTimeRange(from: number, to: number): void {
    this.chart.timeScale().setVisibleRange({ from: from as UTCTimestamp, to: to as UTCTimestamp });
  }

  /** Centre the view on `time`, keeping the current zoom. */
  scrollToTime(time: number): void {
    const range = this.chart.timeScale().getVisibleRange();
    if (!range) {
      this.fitContent();
      return;
    }
    const half = (Number(range.to) - Number(range.from)) / 2;
    this.setVisibleTimeRange(time - half, time + half);
  }

  /** Re-fit the price scale to the visible bars (TradingView's "Auto"). */
  autoScalePrice(): void {
    this.chart.priceScale("right").applyOptions({ autoScale: true });
  }

  /** Default zoom and scroll plus an auto-fitted price scale. */
  resetView(): void {
    this.frameBars();
    this.autoScalePrice();
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
      case "renko":
      case "pnf":
        // Bricks and columns have no wicks: high/low equal the body.
        this.mainSeries = this.chart.addSeries(CandlestickSeries, { ...base, borderVisible: true, wickVisible: false }) as ISeriesApi<never>;
        break;
      case "kagi":
        // A step line draws the shoulder across, then the next line vertically.
        this.mainSeries = this.chart.addSeries(LineSeries, {
          ...base,
          lineWidth: 2,
          lineType: LineType.WithSteps,
        }) as ISeriesApi<never>;
        break;
      default:
        this.mainSeries = this.chart.addSeries(CandlestickSeries, { ...base, borderVisible: true, wickVisible: true }) as ISeriesApi<never>;
    }
    this.applyCandleColors();
    this.mainSeries.setData(this.seriesData());
    // Chart-type switches rebuild the series, which drops any markers on it.
    this.applyMarkers();
    this.applyTradingLines();
  }

  private applyCandleColors(): void {
    if (!this.mainSeries) return;
    if (!CANDLE_TYPES.has(this.type)) return;
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
      wickVisible: this.type !== "renko" && this.type !== "pnf",
    });
  }

  /** Main-series points for the current type, theme and candles. */
  private seriesData(): never[] {
    const c = this.seriesCache;
    if (c && c.data === this.data && c.type === this.type && c.theme === this.theme && c.box === this.boxSize) {
      return c.points;
    }
    const points = this.buildSeriesData();
    this.seriesCache = { data: this.data, type: this.type, theme: this.theme, box: this.boxSize, points };
    return points;
  }

  private buildSeriesData(): never[] {
    const candles = this.data;
    switch (this.type) {
      case "heikin":
        return toSeriesData("candles", heikinAshi(candles));
      case "renko":
        return toBoxData(renko(candles, this.effectiveBoxSize()));
      case "pnf":
        return toBoxData(pointAndFigure(candles, this.effectiveBoxSize()));
      case "kagi": {
        // Reverse on one box (by default one average true range), as Renko and P&F box on it.
        const lines = kagi(candles, this.effectiveBoxSize());
        const first = lines[0];
        if (!first) return [];
        const times = sequentialTimes([first.time, ...lines.map((l) => l.time)]);
        const color = (yang: boolean) => (yang ? this.theme.upColor : this.theme.downColor);
        return [
          { time: times[0] as UTCTimestamp, value: first.start, color: color(first.yang) },
          ...lines.map((l, i) => ({ time: times[i + 1] as UTCTimestamp, value: l.end, color: color(l.yang) })),
        ] as never[];
      }
      default:
        return toSeriesData(this.type, candles);
    }
  }

  private ensureVolume(): void {
    if (this.volumeSeries) return;
    this.volumeSeries = this.chart.addSeries(HistogramSeries, {
      // Own overlay scale: sharing the price scale would drag it down to 0 and
      // the 0.82 top margin below would squash the candles into a flat line.
      priceScaleId: "",
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: "volume" },
    });
    this.volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    this.volumeSeries.setData(toVolumeData(this.layerData));
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

/** Bricks or columns as wickless candles at strictly increasing times. */
function toBoxData(boxes: PriceBox[]): never[] {
  const times = sequentialTimes(boxes.map((b) => b.time));
  return boxes.map((b, i) => ({
    time: times[i] as UTCTimestamp,
    open: b.open,
    high: Math.max(b.open, b.close),
    low: Math.min(b.open, b.close),
    close: b.close,
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
