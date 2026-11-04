import { describe, expect, it, vi } from "vitest";
import type { Candle } from "@ezyview/data-adapters";
import type { SeriesMarker, Time } from "lightweight-charts";
import {
  EzyChart,
  isTimeBased,
  mergeMarkerLayers,
  toFundamentalLines,
  toFundamentalMarkers,
  type FundamentalEventOverlay,
  type IndicatorInstance,
  type IndicatorInstance as Indicator,
  type ScriptPlotSpec,
} from "./host.js";
import { DARK_THEME } from "./theme.js";
import type { IndicatorDef } from "@ezyview/indicators";

const candle = (time: number, close: number, volume = 100): Candle => ({
  time,
  open: close - 1,
  high: close + 1,
  low: close - 2,
  close,
  volume,
});
const candles = (n: number, start = 1_700_000_000): Candle[] =>
  Array.from({ length: n }, (_, i) => candle(start + i * 86400, 100 + i));

type AnyRecord = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * A chart double for `Object.create(EzyChart.prototype)` stubs: every call is
 * recorded, never reaches lightweight-charts.
 */
function fakeChart() {
  const pane = { attachPrimitive: vi.fn(), setHeight: vi.fn(), paneIndex: () => 0 };
  const panes = [pane, { ...pane, paneIndex: () => 1 }];
  const series = () => ({
    setData: vi.fn(),
    update: vi.fn(),
    applyOptions: vi.fn(),
    createPriceLine: vi.fn(() => ({ applyOptions: vi.fn() })),
    removePriceLine: vi.fn(),
    coordinateToPrice: vi.fn(() => 1.5),
    priceToCoordinate: vi.fn(() => 60),
  });
  return {
    panes: vi.fn(() => panes),
    addPane: vi.fn(() => ({ paneIndex: () => panes.length, setHeight: vi.fn() })),
    removePane: vi.fn(),
    addSeries: vi.fn(() => series()),
    removeSeries: vi.fn(),
    priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
    applyOptions: vi.fn(),
    timeScale: vi.fn(() => ({
      resetTimeScale: vi.fn(),
      fitContent: vi.fn(),
      applyOptions: vi.fn(),
      coordinateToTime: vi.fn(() => 1_700_000_000),
      timeToCoordinate: vi.fn(() => 10),
      scrollToRealTime: vi.fn(),
      scrollToPosition: vi.fn(),
      setVisibleRange: vi.fn(),
    })),
    subscribeCrosshairMove: vi.fn(),
    subscribeClick: vi.fn(),
    takeScreenshot: vi.fn(() => ({})),
    options: vi.fn(() => ({})),
  };
}

/** An instance with the prototype chain intact but none of the constructor. */
function stubHost(overrides: AnyRecord = {}): AnyRecord {
  const self = Object.create(EzyChart.prototype) as AnyRecord;
  const base: AnyRecord = {
    chart: fakeChart(),
    type: "candles",
    theme: DARK_THEME,
    showVolume: false,
    showVertGrid: true,
    showHorzGrid: true,
    gridVertColor: null,
    gridHorzColor: null,
    crosshairColor: null,
    crosshairStyle: "dashed",
    showLastPrice: true,
    boxSize: null,
    opts: {},
    data: candles(30),
    drawingsLayer: [],
    mainSeries: null,
    volumeSeries: null,
    levelLines: [],
    seriesByUid: new Map(),
    plotSeriesByUid: new Map(),
    indicatorCache: new Map(),
    currentInstances: [],
    currentPlots: [],
    currentBands: [],
    markerLayer: [],
    fundamentalEventRows: [],
    eventStrip: { setMarkers: vi.fn(), chipAt: vi.fn(() => null) },
    lastEventOid: null,
    markerApi: null,
    tradingLines: [],
    priceLineApi: [],
    watermark: null,
    watermarkText: null,
    compareInputs: [],
    compareSeries: new Map(),
    sharedOhlcv: null,
    sharedOhlcvKey: "",
    seriesCache: null,
    drawings: { setDrawings: vi.fn(), setSelection: vi.fn(), setImages: vi.fn(), setPreview: vi.fn(), setHovered: vi.fn() },
    bgBands: { setBands: vi.fn() },
    sessionBands: { setBands: vi.fn() },
    volumeProfile: { setEnabled: vi.fn(), setColors: vi.fn(), setCandles: vi.fn() },
    fundamentalLines: { setLines: vi.fn() },
  };
  Object.assign(self, base, overrides);
  return self;
}

const fakeDef = (id: string, pane: IndicatorDef["pane"], compute?: IndicatorDef["compute"]): IndicatorDef => ({
  id,
  name: id,
  pane,
  family: "trend",
  defaultColorIndex: 0,
  params: [],
  compute: compute ?? (() => ({ id, name: id, values: [] })),
});
const inst = (uid: string, def: IndicatorDef, params: IndicatorInstance["params"] = {}): Indicator => ({
  uid,
  def,
  params,
  colorIndex: 0,
});

/** Call a private method on a prototype stub with a typed receiver. */
const protoCall = (name: string, thisArg: unknown, ...args: unknown[]) =>
  (EzyChart.prototype as unknown as AnyRecord)[name]!.apply(thisArg as Record<string, unknown>, args);

describe("isTimeBased", () => {
  it("classifies price-only types separately", () => {
    expect(isTimeBased("candles")).toBe(true);
    expect(isTimeBased("line")).toBe(true);
    expect(isTimeBased("heikin")).toBe(true);
    expect(isTimeBased("renko")).toBe(false);
    expect(isTimeBased("kagi")).toBe(false);
    expect(isTimeBased("pnf")).toBe(false);
    expect(isTimeBased("linebreak")).toBe(false);
    expect(isTimeBased("rangebars")).toBe(false);
    expect(isTimeBased("column")).toBe(true);
    expect(isTimeBased("highlow")).toBe(true);
  });
});

describe("toFundamentalMarkers", () => {
  it("earnings get circles, events impact-coloured squares, sorted by time", () => {
    const out = toFundamentalMarkers([
      { time: 2000, kind: "event", impact: "low", title: "L" },
      { time: 1000, kind: "earnings", title: "E" },
      { time: 1500, kind: "event", title: "M" },
    ]);
    expect(out.map((m) => m.time)).toEqual([1000, 1500, 2000]);
    expect(out[0]).toMatchObject({ shape: "circle", position: "aboveBar" });
    expect(out[1]).toMatchObject({ shape: "square" });
    // Missing impact defaults to high.
    expect(out[1]!.color).toBe("#f23645");
    expect(out[2]!.color).toBe("#787b86");
  });
});

describe("toFundamentalLines", () => {
  it("colours each line by the event at the same time and sorts", () => {
    const overlays: FundamentalEventOverlay = {
      lines: [3000, 1000, 2000],
      markers: [
        { time: 1000, kind: "event", impact: "low", title: "L" },
        { time: 3000, kind: "event", title: "H" },
      ],
    };
    expect(toFundamentalLines(overlays)).toEqual([
      { time: 1000, color: "#787b86" },
      { time: 2000, color: "#f23645" },
      { time: 3000, color: "#f23645" },
    ]);
  });
  it("ignores earnings markers for line colour", () => {
    const overlays: FundamentalEventOverlay = {
      lines: [1000],
      markers: [{ time: 1000, kind: "earnings", title: "E" }],
    };
    expect(toFundamentalLines(overlays)[0]).toEqual({ time: 1000, color: "#f23645" });
  });
});

describe("mergeMarkerLayers", () => {
  const m = (time: number, color: string): SeriesMarker<Time> =>
    ({ time: time as Time, position: "aboveBar", shape: "circle", color });
  it("merges ascending and keeps script markers first on equal times", () => {
    const out = mergeMarkerLayers([m(1000, "a"), m(3000, "c")], [m(1000, "b"), m(2000, "d")]);
    expect(out.map((x) => x.color)).toEqual(["a", "b", "d", "c"]);
  });
  it("handles empty inputs", () => {
    const script = [m(1000, "a")];
    expect(mergeMarkerLayers(script, [])).toEqual(script);
    expect(mergeMarkerLayers([], [m(1000, "b")])).toHaveLength(1);
  });
});

describe("indicatorValues caching", () => {
  it("computes once per (closed bar, params) and reuses the cache", () => {
    const compute = vi.fn(() => ({ id: "x", name: "x", values: [1, 2, 3] }));
    const self = stubHost();
    const instance = inst("u1", fakeDef("x", "separate", compute), { length: 7 });
    const valuesA = protoCall("indicatorValues", self, instance);
    const valuesB = protoCall("indicatorValues", self, instance);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(valuesA).toBe(valuesB);
  });

  it("recomputes when params change", () => {
    const compute = vi.fn(() => ({ id: "x", name: "x", values: [1] }));
    const self = stubHost();
    const def = fakeDef("x", "separate", compute);
    const a = inst("u1", def, { length: 7 });
    const b = inst("u1", def, { length: 9 });
    protoCall("indicatorValues", self, a);
    protoCall("indicatorValues", self, b);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("recomputes when a new closed bar lands", () => {
    const compute = vi.fn(() => ({ id: "x", name: "x", values: [1] }));
    const self = stubHost({ data: candles(30) });
    const def = fakeDef("x", "separate", compute);
    const instance = inst("u1", def, {});
    const proto = EzyChart.prototype as AnyRecord;
    proto["indicatorValues"].call(self, instance);
    // A tick moves the forming bar only: same closed key, no recompute.
    self["data"] = [...(self["data"] as Candle[]).slice(0, -1), candle(self["data"][(self["data"] as Candle[]).length - 1]!.time, 999)];
    proto["indicatorValues"].call(self, instance);
    expect(compute).toHaveBeenCalledTimes(1);
    // A new bar opens: the closed window grew, recompute.
    const base = self["data"] as Candle[];
    self["data"] = [...base, candle(base[base.length - 1]!.time + 86400, 200)];
    proto["indicatorValues"].call(self, instance);
    expect(compute).toHaveBeenCalledTimes(2);
  });
});

describe("setIndicators", () => {
  it("drops cached entries for instances that are gone", () => {
    const self = stubHost({ currentInstances: [] });
    (self["indicatorCache"] as Map<string, unknown>).set("u-old", { key: "k", values: {} });
    (self["indicatorCache"] as Map<string, unknown>).set("u-keep", { key: "k", values: {} });
    self["reconcileLayers"] = vi.fn();
    (EzyChart.prototype.setIndicators as (this: unknown, instances: IndicatorInstance[]) => void).call(self, [
      inst("u-keep", fakeDef("x", "separate")),
    ]);
    expect([...(self["indicatorCache"] as Map<string, unknown>).keys()]).toEqual(["u-keep"]);
    expect(self["reconcileLayers"]).toHaveBeenCalledTimes(1);
  });
});

describe("reconcileLayers", () => {
  it("removes every overlay series and pane, then rebuilds", () => {
    const removeSeries = vi.fn();
    const removePane = vi.fn();
    const chart = fakeChart();
    chart.removeSeries = removeSeries;
    chart.removePane = removePane;
    const seriesA = { setData: vi.fn() };
    const seriesB = { setData: vi.fn() };
    const plotSeries = { setData: vi.fn() };
    const self = stubHost({
      chart,
      seriesByUid: new Map([["ind1", [seriesA, seriesB]]]),
      plotSeriesByUid: new Map([["plot1", [plotSeries]]]),
      levelLines: [{ applyOptions: vi.fn() }],
      currentInstances: ["ind1"],
      currentPlots: ["plot1"],
      drawingsLayer: [{ id: "d1" }],
    });
    self["renderIndicator"] = vi.fn();
    self["renderPlot"] = vi.fn();
    self["syncScriptLayers"] = vi.fn();
    protoCall("reconcileLayers", self);
    expect(removeSeries).toHaveBeenCalledTimes(3);
    expect(removePane).toHaveBeenCalledTimes(1);
    expect((self["levelLines"] as unknown[]).length).toBe(0);
    expect(self["renderIndicator"]).toHaveBeenCalledWith("ind1", "create");
    expect(self["renderPlot"]).toHaveBeenCalledWith("plot1", "create");
    expect(self["syncScriptLayers"]).toHaveBeenCalledTimes(1);
    expect(self["drawings"].setDrawings).toHaveBeenCalledWith([{ id: "d1" }]);
  });

  it("skips indicator and plot creation on price-only types", () => {
    const self = stubHost({
      type: "renko",
      currentInstances: ["ind1"],
      currentPlots: ["plot1"],
    });
    self["renderIndicator"] = vi.fn();
    self["renderPlot"] = vi.fn();
    self["syncScriptLayers"] = vi.fn();
    protoCall("reconcileLayers", self);
    expect(self["renderIndicator"]).not.toHaveBeenCalled();
    expect(self["renderPlot"]).not.toHaveBeenCalled();
    expect(self["syncScriptLayers"]).toHaveBeenCalledTimes(1);
  });
});

describe("syncScriptLayers", () => {
  it("maps bgcolor() values to lit flags and drops future fundamentals", () => {
    const data = candles(4);
    const bgBands = { setBands: vi.fn() };
    const setMarkers = vi.fn();
    const applyMarkers = vi.fn();
    const self = stubHost({
      data,
      bgBands,
      eventStrip: { setMarkers, chipAt: vi.fn(() => null) },
      currentBands: [{ color: "#f00", values: [1, null, 5] }],
      currentPlots: [
        { uid: "p1", title: "Shape", style: "circle", values: [10, null, 20, 30], color: "#0f0", linewidth: 1, overlay: true } as ScriptPlotSpec,
      ],
      fundamentalEventRows: [
        { time: data[0]!.time, kind: "event", title: "past" },
        { time: data[data.length - 1]!.time + 10_000, kind: "event", title: "future" },
      ],
    });
    self["applyMarkers"] = applyMarkers;
    protoCall("syncScriptLayers", self);
    expect(bgBands.setBands).toHaveBeenCalledTimes(1);
    expect(bgBands.setBands.mock.calls[0]![0]).toEqual([{ color: "#f00", flags: [true, false, true, false] }]);
    // Script markers still go above the bars; one future event stays off the strip.
    expect(applyMarkers).toHaveBeenCalledTimes(1);
    expect(applyMarkers).toHaveBeenCalledWith();
    expect(self["markerLayer"]).toHaveLength(3);
    expect(setMarkers).toHaveBeenCalledTimes(1);
    expect(setMarkers.mock.calls[0]![0].map((m: { title: string }) => m.title)).toEqual(["past"]);
  });
});

describe("updateLastBar", () => {
  it("updates in place on a forming-bar tick and reports handled", () => {
    const update = vi.fn();
    const rebuildCompare = vi.fn();
    const setCandles = vi.fn();
    const self = stubHost({ type: "candles" });
    self["mainSeries"] = { update, setData: vi.fn() };
    self["volumeSeries"] = null;
    self["rebuildCompare"] = rebuildCompare;
    self["volumeProfile"] = { setCandles };
    const last = (self["data"] as Candle[])[(self["data"] as Candle[]).length - 1]!;
    const tick = { ...last, close: last.close + 5 };
    const ok = (EzyChart.prototype.updateLastBar as (this: unknown, c: Candle) => boolean).call(self, tick);
    expect(ok).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(rebuildCompare).toHaveBeenCalledTimes(1);
    expect(setCandles).toHaveBeenCalledTimes(1);
    expect((self["data"] as Candle[]).at(-1)!.close).toBe(last.close + 5);
  });

  it("returns false on a new bar or on price-only types", () => {
    const update = vi.fn();
    const self = stubHost({ type: "candles" });
    self["mainSeries"] = { update, setData: vi.fn() };
    const last = (self["data"] as Candle[])[(self["data"] as Candle[]).length - 1]!;
    const nextBar = { ...last, time: last.time + 86400 };
    const ok = (EzyChart.prototype.updateLastBar as (this: unknown, c: Candle) => boolean).call(self, nextBar);
    expect(ok).toBe(false);
    expect(update).not.toHaveBeenCalled();

    const renko = stubHost({ type: "renko" });
    renko["mainSeries"] = { update, setData: vi.fn() };
    const renkoLast = (renko["data"] as Candle[])[(renko["data"] as Candle[]).length - 1]!;
    const okRenko = (EzyChart.prototype.updateLastBar as (this: unknown, c: Candle) => boolean).call(renko, renkoLast);
    expect(okRenko).toBe(false);
  });
});

describe("setCompare", () => {
  const input = (id: string, color = "#fff") => ({
    id,
    symbol: `SYM:${id}`,
    color,
    mode: "percent" as const,
    data: candles(10, 1_700_000_000),
  });

  it("creates series once, updates options on re-set, removes stale ones", () => {
    const addSeries = vi.fn((_type: unknown, _opts: unknown) => ({
      setData: vi.fn(),
      applyOptions: vi.fn(),
    }));
    const removeSeries = vi.fn();
    const priceScaleApply = vi.fn();
    const chart = fakeChart();
    chart.addSeries = addSeries as never;
    chart.removeSeries = removeSeries;
    chart.priceScale = vi.fn(() => ({ applyOptions: priceScaleApply }));
    const self = stubHost({ chart });
    self["rebuildCompare"] = vi.fn();
    const setCompare = EzyChart.prototype.setCompare as (this: unknown, series: unknown[]) => void;
    setCompare.call(self, [input("a"), input("b")]);
    expect(addSeries).toHaveBeenCalledTimes(2);
    expect(priceScaleApply).toHaveBeenCalled();
    const firstApi = addSeries.mock.results[0]!.value;
    setCompare.call(self, [input("a", "#000")]);
    expect(addSeries).toHaveBeenCalledTimes(2);
    expect(firstApi.applyOptions).toHaveBeenCalledWith(expect.objectContaining({ color: "#000" }));
    expect(removeSeries).toHaveBeenCalledTimes(1);
    expect(self["compareSeries"].size).toBe(1);
  });

  it("skips the compare price scale when no overlay remains", () => {
    const addSeries = vi.fn(() => ({ setData: vi.fn(), applyOptions: vi.fn() }));
    const chart = fakeChart();
    chart.addSeries = addSeries as never;
    const priceScaleApply = vi.fn();
    chart.priceScale = vi.fn(() => ({ applyOptions: priceScaleApply }));
    const self = stubHost({ chart });
    self["rebuildCompare"] = vi.fn();
    (EzyChart.prototype.setCompare as (this: unknown, series: unknown[]) => void).call(self, [input("a")]);
    (EzyChart.prototype.setCompare as (this: unknown, series: unknown[]) => void).call(self, []);
    expect(priceScaleApply).toHaveBeenCalledTimes(1);
  });
});

describe("setData", () => {
  it("pushes data to the main series, refreshes indicators, keeps first-load framing", () => {
    const mainSetData = vi.fn();
    const refreshIndicator = vi.fn();
    const refreshPlot = vi.fn();
    const syncScriptLayers = vi.fn();
    const rebuildCompare = vi.fn();
    const frameBars = vi.fn();
    const self = stubHost({ data: [] });
    self["mainSeries"] = { setData: mainSetData };
    self["renderIndicator"] = refreshIndicator;
    self["renderPlot"] = refreshPlot;
    self["syncScriptLayers"] = syncScriptLayers;
    self["rebuildCompare"] = rebuildCompare;
    self["frameBars"] = frameBars;
    const next = candles(12);
    (EzyChart.prototype.setData as (this: unknown, c: Candle[]) => void).call(self, next);
    expect(mainSetData).toHaveBeenCalledTimes(1);
    expect(refreshIndicator).not.toHaveBeenCalled();
    expect(frameBars).toHaveBeenCalledTimes(1);
    expect(self["data"]).toBe(next);
    expect((self["volumeProfile"] as { setCandles: ReturnType<typeof vi.fn> }).setCandles).toHaveBeenCalledWith(next);
  });
});

describe("setChartType", () => {
  it("is a no-op for the current type", () => {
    const self = stubHost({ type: "candles" });
    self["createMainSeries"] = vi.fn();
    (EzyChart.prototype.setChartType as (this: unknown, t: string) => void).call(self, "candles");
    expect(self["createMainSeries"]).not.toHaveBeenCalled();
  });

  it("rebuilds the main series and reconciles layers when the axis class changes", () => {
    const resetMarkers = vi.fn();
    const createMainSeries = vi.fn();
    const reconcileLayers = vi.fn();
    const frameBars = vi.fn();
    const chart = fakeChart();
    const removeSeries = vi.fn();
    chart.removeSeries = removeSeries;
    const self = stubHost({ chart, type: "candles", mainSeries: { setData: vi.fn() } });
    self["resetMarkers"] = resetMarkers;
    self["createMainSeries"] = createMainSeries;
    self["reconcileLayers"] = reconcileLayers;
    self["frameBars"] = frameBars;
    (EzyChart.prototype.setChartType as (this: unknown, t: string) => void).call(self, "renko");
    expect(self["type"]).toBe("renko");
    expect(resetMarkers).toHaveBeenCalledTimes(1);
    expect(removeSeries).toHaveBeenCalledTimes(1);
    expect(createMainSeries).toHaveBeenCalledTimes(1);
    expect(reconcileLayers).toHaveBeenCalledTimes(1);
    expect(frameBars).toHaveBeenCalledTimes(1);
  });
});

describe("setVisibleTimeRange / scrollToTime / fitContent / frameBars", () => {
  it("setVisibleTimeRange converts seconds to UTCTimestamps", () => {
    const applyOptions = vi.fn();
    const setVisibleRange = vi.fn();
    const timeScale = { applyOptions, setVisibleRange, scrollToPosition: vi.fn() };
    const chart = fakeChart();
    chart.timeScale = vi.fn(() => timeScale) as never;
    const self = stubHost({ chart });
    (EzyChart.prototype.setVisibleTimeRange as (this: unknown, a: number, b: number) => void).call(self, 100, 200);
    expect(setVisibleRange).toHaveBeenCalledTimes(1);
    const range = setVisibleRange.mock.calls[0]![0] as { from: number; to: number };
    expect(Number(range.from)).toBe(100);
    expect(Number(range.to)).toBe(200);
  });

  it("frameBars calls resetTimeScale for time-based types and fitContent otherwise", () => {
    const resetTimeScale = vi.fn();
    const fitContent = vi.fn();
    const chart = fakeChart();
    chart.timeScale = vi.fn(() => ({ resetTimeScale, fitContent })) as never;
    const timeBased = stubHost({ chart, type: "candles" });
    protoCall("frameBars", timeBased);
    expect(resetTimeScale).toHaveBeenCalledTimes(1);
    expect(fitContent).not.toHaveBeenCalled();
    const priceOnly = stubHost({ chart, type: "renko" });
    protoCall("frameBars", priceOnly);
    expect(fitContent).toHaveBeenCalledTimes(1);
  });
});

describe("setTradingLines", () => {
  it("recreates price lines from scratch on every call", () => {
    const removePriceLine = vi.fn();
    const createPriceLine = vi.fn((_opts: unknown) => ({ applyOptions: vi.fn() }));
    const series = { removePriceLine, createPriceLine };
    const self = stubHost({ mainSeries: series, priceLineApi: [{ applyOptions: vi.fn() }] });
    (EzyChart.prototype.setTradingLines as (this: unknown, lines: unknown[]) => void).call(self, [
      { price: 101, color: "#f00", title: "SL", dashed: true },
      { price: 110, color: "#0f0", title: "TP", dashed: false },
    ]);
    expect(removePriceLine).toHaveBeenCalledTimes(1);
    expect(createPriceLine).toHaveBeenCalledTimes(2);
    expect((self["priceLineApi"] as unknown[]).length).toBe(2);
    (EzyChart.prototype.setTradingLines as (this: unknown, lines: unknown[]) => void).call(self, []);
    expect((self["priceLineApi"] as unknown[]).length).toBe(0);
  });
});
