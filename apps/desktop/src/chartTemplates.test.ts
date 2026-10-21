import { describe, expect, it } from "vitest";
import type { IndicatorDef } from "@ezyview/indicators";
import type { ChartState } from "./layout";
import { applyTemplate, restoreTemplates, templateFromChart } from "./chartTemplates";

const def = (id: string) => ({ id }) as unknown as IndicatorDef;
const chart = {
  symbol: "OANDA:XAUUSD",
  resolution: "1h",
  chartType: "heikin",
  showVolume: false,
  showGrid: false,
  theme: "tokyo",
  priceScale: "log",
  indicators: [
    { uid: "u1", def: def("rsi"), params: { length: 7 }, colorIndex: 2 },
    { uid: "u2", def: def("ema"), params: { length: 50 }, colorIndex: 0, hidden: true },
  ],
  drawings: [{ id: "d1" }],
} as unknown as ChartState;
const resolve = (id: string) => (id === "rsi" || id === "ema" ? def(id) : null);

describe("chart templates", () => {
  it("captures style and indicators by id, not symbol or drawings", () => {
    const t = templateFromChart(chart, "  My look  ", "t1");
    expect(t).toMatchObject({ id: "t1", name: "My look", chartType: "heikin", showVolume: false, theme: "tokyo", priceScale: "log" });
    expect(t.indicators).toEqual([
      { defId: "rsi", params: { length: 7 }, colorIndex: 2 },
      { defId: "ema", params: { length: 50 }, colorIndex: 0, hidden: true },
    ]);
    expect(JSON.stringify(t)).not.toContain("OANDA");
  });

  it("applies onto another chart keeping its symbol, interval and drawings", () => {
    const target = { ...chart, symbol: "BINANCE:BTCUSDT", resolution: "5m", indicators: [], drawings: [{ id: "keep" }], theme: "dark" } as unknown as ChartState;
    let n = 0;
    const out = applyTemplate(target, templateFromChart(chart, "x", "t"), resolve, () => `new${++n}`);
    expect(out.symbol).toBe("BINANCE:BTCUSDT");
    expect(out.resolution).toBe("5m");
    expect(out.drawings).toEqual([{ id: "keep" }]);
    expect(out.theme).toBe("tokyo");
    expect(out.chartType).toBe("heikin");
    expect(out.indicators.map((i) => [i.uid, i.def.id, i.hidden])).toEqual([
      ["new1", "rsi", undefined],
      ["new2", "ema", true],
    ]);
  });

  it("drops indicators whose definition no longer exists", () => {
    const t = templateFromChart(chart, "x", "t");
    const out = applyTemplate(chart, t, (id) => (id === "rsi" ? def("rsi") : null), () => "u");
    expect(out.indicators.map((i) => i.def.id)).toEqual(["rsi"]);
  });

  it("restores saved templates, dropping malformed rows and capping the list", () => {
    const good = templateFromChart(chart, "ok", "g");
    expect(restoreTemplates([good, null, { id: 1 }, { id: "x", name: "no style" }])).toEqual([good]);
    expect(restoreTemplates("junk")).toEqual([]);
    const many = Array.from({ length: 80 }, (_, i) => templateFromChart(chart, `n${i}`, `id${i}`));
    expect(restoreTemplates(many)).toHaveLength(50);
  });

  it("names an unnamed template and trims long names", () => {
    expect(templateFromChart(chart, "   ", "t").name).toBe("Template");
    expect(templateFromChart(chart, "x".repeat(100), "t").name).toHaveLength(40);
  });
});
