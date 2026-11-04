import { describe, expect, it, vi } from "vitest";
import type { Candle } from "@ezyview/data-adapters";
import {
  EzyChart,
  type IndicatorInstance,
  type ScriptPlotSpec,
} from "./host.js";
import { DARK_THEME, LIGHT_THEME } from "./theme.js";
import type { IndicatorDef } from "@ezyview/indicators";

const candle = (time: number, close: number): Candle => ({
  time,
  open: close - 1,
  high: close + 1,
  low: close - 2,
  close,
  volume: 100,
});
const candles = (n: number, start = 1_700_000_000): Candle[] =>
  Array.from({ length: n }, (_, i) => candle(start + i * 86400, 100 + i));

type AnyRecord = Record<string, any>;
const proto = EzyChart.prototype as unknown as AnyRecord;

function fakeChart() {
  const pane = { attachPrimitive: vi.fn(), setHeight: vi.fn(), paneIndex: () => 0 };
  const panesArr = [pane, { ...pane, paneIndex: () => 1 }];
  const addSeries = vi.fn(() => ({
    setData: vi.fn(),
    update: vi.fn(),
    applyOptions: vi.fn(),
    createPriceLine: vi.fn(() => ({ applyOptions: vi.fn() })),
    removePriceLine: vi.fn(),
    coordinateToPrice: vi.fn(() => 1.5),
    priceToCoordinate: vi.fn(() => 60),
  }));
  const priceScaleRight = { applyOptions: vi.fn() };
  return {
    panes: vi.fn(() => panesArr),
    addPane: vi.fn(() => ({ paneIndex: () => 2, setHeight: vi.fn() })),
    removePane: vi.fn(),
    addSeries,
    removeSeries: vi.fn(),
    priceScale: vi.fn(() => priceScaleRight),
    applyOptions: vi.fn(),
    setCrosshairPosition: vi.fn(),
    clearCrosshairPosition: vi.fn(),
    timeScale: vi.fn(() => ({
      resetTimeScale: vi.fn(),
      fitContent: vi.fn(),
      applyOptions: vi.fn(),
      coordinateToTime: vi.fn(() => 1_700_000_000),
      timeToCoordinate: vi.fn(() => 10),
      scrollToRealTime: vi.fn(),
      setVisibleRange: vi.fn(),
    })),
    subscribeCrosshairMove: vi.fn(),
    subscribeClick: vi.fn(),
    remove: vi.fn(),
    takeScreenshot: vi.fn(() => ({ width: 1, height: 1 })),
  };
}

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
    fundamentalMarkerLayer: [],
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

const fakeDef = (id: string, pane: IndicatorDef["pane"], values: (number | null)[] = []): IndicatorDef => ({
  id,
  name: id,
  pane,
  family: "trend",
  defaultColorIndex: 0,
  params: [],
  compute: () => ({ id, name: id, values }),
});
const inst = (uid: string, def: IndicatorDef): IndicatorInstance => ({ uid, def, params: {}, colorIndex: 0 });

describe("setCrosshairMode / setPriceScaleMode / setInvertScale", () => {
  it("setCrosshairMode maps to the crosshair applyOptions", () => {
    const chart = fakeChart();
    const self = stubHost({ chart });
    (EzyChart.prototype.setCrosshairMode as (m: string) => void).call(self, "magnet");
    expect(chart.applyOptions).toHaveBeenCalledWith({ crosshair: { mode: expect.any(Number) } });
  });

  it("setPriceScaleMode applies to the right scale and falls back to normal on refusal", () => {
    const applyOptions = vi.fn();
    const chart = fakeChart();
    chart.priceScale = vi.fn(() => ({ applyOptions }));
    const self = stubHost({ chart });
    (EzyChart.prototype.setPriceScaleMode as (m: string) => void).call(self, "log");
    expect(applyOptions).toHaveBeenCalledWith({ mode: expect.any(Number) });

    const flaky = { applyOptions: vi.fn().mockImplementationOnce(() => { throw new Error("bad scale"); }) };
    chart.priceScale = vi.fn(() => flaky);
    const self2 = stubHost({ chart });
    expect(() => (EzyChart.prototype.setPriceScaleMode as (m: string) => void).call(self2, "log")).not.toThrow();
    expect(flaky.applyOptions).toHaveBeenCalledTimes(2);
    expect(flaky.applyOptions).toHaveBeenLastCalledWith({ mode: 0 });
  });

  it("setInvertScale flips the right scale", () => {
    const applyOptions = vi.fn();
    const chart = fakeChart();
    chart.priceScale = vi.fn(() => ({ applyOptions }));
    const self = stubHost({ chart });
    (EzyChart.prototype.setInvertScale as (v: boolean) => void).call(self, true);
    expect(applyOptions).toHaveBeenCalledWith({ invertScale: true });
  });
});

describe("setTimezone", () => {
  it("installs explicit formatters on localization and the time scale", () => {
    const chart = fakeChart();
    const self = stubHost({ chart });
    (EzyChart.prototype.setTimezone as (tz: string | null) => void).call(self, "Europe/London");
    const call = chart.applyOptions.mock.calls[0]![0] as {
      localization: { timeFormatter: unknown };
      timeScale: { tickMarkFormatter: unknown };
    };
    expect(typeof call.localization.timeFormatter).toBe("function");
    expect(typeof call.timeScale.tickMarkFormatter).toBe("function");
  });
});

describe("setWatermark", () => {
  it("updates the existing watermark in place", () => {
    const applyOptions = vi.fn();
    const self = stubHost({ watermark: { applyOptions, detach: vi.fn() }, watermarkText: "OLD" });
    (EzyChart.prototype.setWatermark as (t: string | null) => void).call(self, "NEW");
    expect(applyOptions).toHaveBeenCalledWith({
      lines: [{ text: "NEW", color: expect.any(String) }],
    });
    expect(self["watermarkText"]).toBe("NEW");
  });

  it("detaches the watermark when cleared", () => {
    const detach = vi.fn();
    const self = stubHost({ watermark: { applyOptions: vi.fn(), detach }, watermarkText: "X" });
    (EzyChart.prototype.setWatermark as (t: string | null) => void).call(self, null);
    expect(detach).toHaveBeenCalledTimes(1);
    expect(self["watermark"]).toBeNull();
    expect(self["watermarkText"]).toBeNull();
  });

  it("is a no-op when the pane is missing", () => {
    const chart = fakeChart();
    chart.panes = vi.fn(() => []);
    const self = stubHost({ chart });
    expect(() => (EzyChart.prototype.setWatermark as (t: string | null) => void).call(self, "X")).not.toThrow();
  });
});

describe("setFundamentalEvents", () => {
  it("stores the marker layer and pushes the lines primitive", () => {
    const setLines = vi.fn();
    const applyMarkers = vi.fn();
    const fundamentalLines = { setLines };
    const self = stubHost({ fundamentalLines });
    self["applyMarkers"] = applyMarkers;
    (EzyChart.prototype.setFundamentalEvents as (o: unknown) => void).call(self, {
      markers: [{ time: 1000, kind: "earnings" }],
      lines: [1000],
    });
    expect((self["fundamentalMarkerLayer"] as unknown[]).length).toBe(1);
    expect(setLines).toHaveBeenCalledWith([{ time: 1000, color: expect.any(String) }]);
    expect(applyMarkers).toHaveBeenCalledTimes(1);
  });
});

describe("setSessionShading", () => {
  it("clears the bands when the session is unknown or the list is empty", () => {
    const setBands = vi.fn();
    const self = stubHost({ sessionBands: { setBands } });
    (EzyChart.prototype.setSessionShading as (t: number[], s: string | null, c: string) => void).call(self, [], "newyork", "#fff");
    expect(setBands).toHaveBeenCalledWith([], []);
    (EzyChart.prototype.setSessionShading as (t: number[], s: string | null, c: string) => void).call(self, [1000], "nope", "#fff");
    expect(setBands).toHaveBeenCalledWith([], [1000]);
  });

  it("passes flags for known sessions", () => {
    const setBands = vi.fn();
    const self = stubHost({ sessionBands: { setBands } });
    (EzyChart.prototype.setSessionShading as (t: number[], s: string | null, c: string) => void).call(self, [1_700_000_000], "newyork", "#fff");
    const call = setBands.mock.calls[0]!;
    expect(call[0]).toHaveLength(1);
    expect(call[0][0]).toEqual({ color: "#fff", flags: [expect.any(Boolean)] });
    expect(call[1]).toEqual([1_700_000_000]);
  });
});

describe("crosshair sync primitives", () => {
  it("showCrosshairAt no-ops without a main series", () => {
    const chart = fakeChart();
    const self = stubHost({ chart, mainSeries: null });
    (EzyChart.prototype.showCrosshairAt as (p: number, t: number) => void).call(self, 1.5, 100);
    expect(chart.setCrosshairPosition).not.toHaveBeenCalled();
  });

  it("showCrosshairAt sets the position on the main series", () => {
    const chart = fakeChart();
    const mainSeries = { setData: vi.fn() };
    const self = stubHost({ chart, mainSeries });
    (EzyChart.prototype.showCrosshairAt as (p: number, t: number) => void).call(self, 1.5, 100);
    expect(chart.setCrosshairPosition).toHaveBeenCalledWith(1.5, 100, mainSeries);
  });

  it("clearCrosshairPosition delegates to the chart", () => {
    const chart = fakeChart();
    const self = stubHost({ chart });
    (EzyChart.prototype.clearCrosshairPosition as () => void).call(self);
    expect(chart.clearCrosshairPosition).toHaveBeenCalledTimes(1);
  });
});

describe("setLastPriceVisible", () => {
  it("does nothing when the value is unchanged", () => {
    const series = { applyOptions: vi.fn() };
    const self = stubHost({ mainSeries: series, showLastPrice: true });
    (EzyChart.prototype.setLastPriceVisible as (v: boolean) => void).call(self, true);
    expect(series.applyOptions).not.toHaveBeenCalled();
  });

  it("applies to the series when changed", () => {
    const series = { applyOptions: vi.fn() };
    const self = stubHost({ mainSeries: series, showLastPrice: true });
    (EzyChart.prototype.setLastPriceVisible as (v: boolean) => void).call(self, false);
    expect(series.applyOptions).toHaveBeenCalledWith({ priceLineVisible: false, lastValueVisible: false });
  });
});

describe("setScriptPlots", () => {
  it("replaces plots and bands wholesale and reconciles", () => {
    const reconcileLayers = vi.fn();
    const self = stubHost({ currentPlots: [{ uid: "old" }], currentBands: [] });
    self["reconcileLayers"] = reconcileLayers;
    (EzyChart.prototype.setScriptPlots as (p: unknown[], b: unknown[]) => void).call(self, [{ uid: "new" }], [{ color: "#fff", values: [1] }]);
    expect(self["currentPlots"]).toEqual([{ uid: "new" }]);
    expect(self["currentBands"]).toEqual([{ color: "#fff", values: [1] }]);
    expect(reconcileLayers).toHaveBeenCalledTimes(1);
  });
});

describe("renderPlot (create)", () => {
  it("shape-style plots ride the candle series instead of getting one", () => {
    const chart = fakeChart();
    const self = stubHost({ chart, data: candles(5) });
    (EzyChart.prototype as unknown as AnyRecord)["renderPlot"].call(
      self,
      { uid: "p1", title: "s", style: "circle", values: [1, 2, 3, 4, 5], color: "#fff", linewidth: 1, overlay: true },
      "create",
    );
    expect(chart.addSeries).not.toHaveBeenCalled();
  });

  it("line plots on the main pane reuse pane 0, histograms get pane slots", () => {
    const chart = fakeChart();
    const self = stubHost({ chart, data: candles(5) });
    (EzyChart.prototype as unknown as AnyRecord)["renderPlot"].call(
      self,
      { uid: "line1", title: "l", style: "line", values: [1, 2, null, 4, 5], color: "#fff", linewidth: 2, overlay: true },
      "create",
    );
    expect(chart.addSeries).toHaveBeenCalledTimes(1);
    expect(chart.addPane).not.toHaveBeenCalled();

    const histogram: ScriptPlotSpec = {
      uid: "hist1",
      title: "h",
      style: "histogram",
      values: [1, 2, 3, 4, 5],
      color: "#abc",
      linewidth: 1,
      overlay: false,
    };
    (EzyChart.prototype as unknown as AnyRecord)["renderPlot"].call(self, histogram, "create");
    expect(chart.addPane).toHaveBeenCalledTimes(1);
    expect(chart.addSeries).toHaveBeenCalledTimes(2);
  });

  it("refresh mode setData on the existing series", () => {
    const setData = vi.fn();
    const self = stubHost({
      data: candles(5),
      plotSeriesByUid: new Map([["p1", [{ setData }]]]),
    });
    (EzyChart.prototype as unknown as AnyRecord)["renderPlot"].call(
      self,
      { uid: "p1", title: "l", style: "line", values: [1, 2, 3, 4, 5], color: "#fff", linewidth: 1, overlay: true },
      "refresh",
    );
    expect(setData).toHaveBeenCalledTimes(1);
  });
});

describe("renderIndicator (create)", () => {
  it("separate-pane indicators add a pane and the RSI guides", () => {
    const chart = fakeChart();
    const addSeries = vi.fn(() => ({
      setData: vi.fn(),
      applyOptions: vi.fn(),
      createPriceLine: vi.fn(() => ({ applyOptions: vi.fn() })),
    }));
    chart.addSeries = addSeries as never;
    const self = stubHost({ chart, data: candles(30) });
    const series = (EzyChart.prototype as unknown as AnyRecord)["renderIndicator"];
    series.call(self, inst("rsi1", fakeDef("rsi", "separate", Array.from({ length: 30 }, () => 50))), "create");
    expect(chart.addPane).toHaveBeenCalledTimes(1);
    expect((self["levelLines"] as unknown[]).length).toBe(3);
    expect((self["seriesByUid"] as Map<string, unknown[]>).get("rsi1")).toHaveLength(1);
  });

  it("overlay indicators share the main pane and skip the level lines", () => {
    const chart = fakeChart();
    const self = stubHost({ chart, data: candles(30) });
    (EzyChart.prototype as unknown as AnyRecord)["renderIndicator"].call(
      self,
      inst("ema1", fakeDef("ema", "overlay", Array.from({ length: 30 }, () => 101))),
      "create",
    );
    expect(chart.addPane).not.toHaveBeenCalled();
    expect((self["levelLines"] as unknown[]).length).toBe(0);
  });

  it("hist plots become histogram series", () => {
    const chart = fakeChart();
    const addSeries = vi.fn(() => ({
      setData: vi.fn(),
      applyOptions: vi.fn(),
      createPriceLine: vi.fn(() => ({ applyOptions: vi.fn() })),
    }));
    chart.addSeries = addSeries as never;
    const def = fakeDef("macd", "separate", Array.from({ length: 30 }, () => 1));
    def.compute = () => ({ id: "macd", name: "macd", values: Array.from({ length: 30 }, () => 1), plots: { hist: Array.from({ length: 30 }, () => 0.5) } });
    const self = stubHost({ chart, data: candles(30) });
    (EzyChart.prototype as unknown as AnyRecord)["renderIndicator"].call(self, inst("macd1", def), "create");
    // One line series + one histogram series.
    expect(addSeries).toHaveBeenCalledTimes(2);
    expect((self["seriesByUid"] as Map<string, unknown[]>).get("macd1")).toHaveLength(2);
  });

  it("refresh mode pushes setData into the existing series", () => {
    const setData = vi.fn();
    const def = fakeDef("ema", "overlay", Array.from({ length: 30 }, () => 101));
    const self = stubHost({
      data: candles(30),
      seriesByUid: new Map([["ema1", [{ setData }]]]),
    });
    (EzyChart.prototype as unknown as AnyRecord)["renderIndicator"].call(self, inst("ema1", def), "refresh");
    expect(setData).toHaveBeenCalledTimes(1);
  });
});

describe("setTheme", () => {
  it("applies layout/grid/crosshair options and recolours levels", () => {
    const chart = fakeChart();
    const applyOptions = vi.fn();
    const levelLine = { applyOptions };
    const self = stubHost({ chart, levelLines: [levelLine], type: "candles" });
    self["applyCandleColors"] = vi.fn();
    (EzyChart.prototype.setTheme as (t: unknown) => void).call(self, LIGHT_THEME);
    expect(chart.applyOptions).toHaveBeenCalled();
    expect(applyOptions).toHaveBeenCalledWith({ color: LIGHT_THEME.paneSeparator });
    expect(self["applyCandleColors"]).toHaveBeenCalled();
  });
});

describe("setShowVolume", () => {
  it("toggles off by removing the series", () => {
    const removeSeries = vi.fn();
    const chart = fakeChart();
    chart.removeSeries = removeSeries;
    const self = stubHost({ chart, showVolume: true, volumeSeries: { setData: vi.fn() } });
    (EzyChart.prototype.setShowVolume as (v: boolean) => void).call(self, false);
    expect(removeSeries).toHaveBeenCalledTimes(1);
    expect(self["volumeSeries"]).toBeNull();
  });

  it("no-ops when the value is unchanged", () => {
    const chart = fakeChart();
    const self = stubHost({ chart, showVolume: false });
    (EzyChart.prototype.setShowVolume as (v: boolean) => void).call(self, false);
    expect(chart.removeSeries).not.toHaveBeenCalled();
  });
});

describe("setBoxSize / effectiveBoxSize", () => {
  it("normalizes non-positive sizes to automatic and no-ops on repeat", () => {
    const setData = vi.fn();
    const chart = fakeChart();
    const frameBars = vi.fn();
    const self = stubHost({ chart, type: "renko", boxSize: 10, mainSeries: { setData } });
    self["frameBars"] = frameBars;
    (EzyChart.prototype.setBoxSize as (v: number | null) => void).call(self, 10);
    expect(frameBars).not.toHaveBeenCalled();
    (EzyChart.prototype.setBoxSize as (v: number | null) => void).call(self, -5);
    expect(self["boxSize"]).toBeNull();
    expect(setData).toHaveBeenCalledTimes(1);
  });

  it("effectiveBoxSize falls back to the ATR default", () => {
    const self = stubHost({ boxSize: null, data: candles(30) });
    const size = (EzyChart.prototype.effectiveBoxSize as () => number).call(self);
    expect(Number.isFinite(size)).toBe(true);
    expect(size).toBeGreaterThan(0);
    const custom = stubHost({ boxSize: 2.5 });
    expect((EzyChart.prototype.effectiveBoxSize as () => number).call(custom)).toBe(2.5);
  });
});

describe("setGrid / setShowGrid", () => {
  it("setGrid normalizes falsy colours to null and applies theme-derived colours", () => {
    const chart = fakeChart();
    const self = stubHost({ chart });
    (EzyChart.prototype.setGrid as (o: Record<string, unknown>) => void).call(self, { vert: false, vertColor: "" });
    expect(self["showVertGrid"]).toBe(false);
    expect(self["gridVertColor"]).toBeNull();
    expect(chart.applyOptions).toHaveBeenCalled();
  });

  it("setShowGrid delegates to setGrid on both axes", () => {
    const chart = fakeChart();
    const self = stubHost({ chart });
    (EzyChart.prototype.setShowGrid as (v: boolean) => void).call(self, false);
    expect(self["showVertGrid"]).toBe(false);
    expect(self["showHorzGrid"]).toBe(false);
  });
});

describe("destroy / takeScreenshot / candles / sharedOhlcv", () => {
  it("destroy clears engine state and removes the chart", () => {
    const chart = fakeChart();
    const self = stubHost({ chart });
    (self["indicatorCache"] as Map<string, unknown>).set("x", { key: "k", values: {} });
    (EzyChart.prototype.destroy as () => void).call(self);
    expect(chart.remove).toHaveBeenCalledTimes(1);
    expect((self["indicatorCache"] as Map<string, unknown>).size).toBe(0);
    expect(self["sharedOhlcv"]).toBeNull();
  });

  it("takeScreenshot returns null when the chart throws", () => {
    const chart = fakeChart();
    chart.takeScreenshot = vi.fn(() => {
      throw new Error("no canvas");
    }) as never;
    const self = stubHost({ chart });
    expect((EzyChart.prototype.takeScreenshot as () => unknown).call(self)).toBeNull();
  });

  it("candles() exposes the loaded history", () => {
    const self = stubHost();
    expect((EzyChart.prototype.candles as () => readonly Candle[]).call(self)).toBe(self["data"]);
  });

  it("getSharedOhlcv memoizes against the last bar", () => {
    const self = stubHost();
    const a = (proto["getSharedOhlcv"] as (this: unknown) => unknown).call(self) as { open: number[] };
    const b = (proto["getSharedOhlcv"] as (this: unknown) => unknown).call(self);
    expect(b).toBe(a);
    expect(a.open).toHaveLength((self["data"] as Candle[]).length);
  });
});

describe("seriesData caching", () => {
  it("reuses the cached points when nothing relevant changed", () => {
    const self = stubHost();
    const first = (proto["seriesData"] as (this: unknown) => unknown[]).call(self);
    const second = (proto["seriesData"] as (this: unknown) => unknown[]).call(self);
    expect(second).toBe(first);
    expect(first).toHaveLength((self["data"] as Candle[]).length);
  });
});

describe("coordinate wrappers", () => {
  it("coordinateToPrice/timeToCoordinate return Numbers or null", () => {
    const chart = fakeChart();
    const mainSeries = { coordinateToPrice: vi.fn(() => "1.5"), priceToCoordinate: vi.fn(() => "60"), setData: vi.fn() };
    const self = stubHost({ chart, mainSeries });
    expect((EzyChart.prototype.coordinateToPrice as (y: number) => number | null).call(self, 10)).toBe(1.5);
    expect((EzyChart.prototype.coordinateToTime as (x: number) => number | null).call(self, 10)).toBe(1_700_000_000);
    mainSeries.coordinateToPrice = vi.fn(() => null) as never;
    expect((EzyChart.prototype.coordinateToPrice as (y: number) => number | null).call(self, 10)).toBeNull();
  });
});
