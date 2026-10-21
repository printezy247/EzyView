import { describe, expect, it } from "vitest";
import { exportLayoutJson, parseLayoutJson } from "./layoutShare";
import type { ChartState, Layout } from "./layout";

const FALLBACK: ChartState = {
  symbol: "BTCUSDT",
  resolution: "1D",
  chartType: "candles",
  showVolume: true,
  showGrid: true,
  theme: "dark",
  indicators: [],
  drawings: [],
};
const noDefs = () => null;

const LAYOUT: Layout = {
  id: "abc",
  name: "Swing",
  color: "#ff9800",
  grid: "2h",
  createdAt: 1_700_000_000_000,
  charts: [
    { ...FALLBACK, symbol: "ETHUSDT", resolution: "4h" },
    { ...FALLBACK, symbol: "SOLUSDT", resolution: "15m", chartType: "line" },
  ],
  activeChart: 1,
};

describe("layout share file", () => {
  it("round-trips symbol, resolution, grid and focus", () => {
    const back = parseLayoutJson(exportLayoutJson(LAYOUT), FALLBACK, noDefs);
    expect(back.name).toBe("Swing");
    expect(back.grid).toBe("2h");
    expect(back.activeChart).toBe(1);
    expect(back.charts.map((c) => [c.symbol, c.resolution, c.chartType])).toEqual([
      ["ETHUSDT", "4h", "candles"],
      ["SOLUSDT", "15m", "line"],
    ]);
  });

  it("drops indicators whose definition is unknown", () => {
    const withInd: Layout = {
      ...LAYOUT,
      charts: [{ ...FALLBACK, indicators: [{ uid: "u", def: { id: "nope" } } as never] }],
      grid: "1",
      activeChart: 0,
    };
    expect(parseLayoutJson(exportLayoutJson(withInd), FALLBACK, noDefs).charts[0]!.indicators).toEqual([]);
  });

  it.each([
    ["garbage", "not json"],
    ["wrong format", JSON.stringify({ format: "other", version: 1, layout: LAYOUT })],
    ["wrong version", JSON.stringify({ format: "ezyview-layout", version: 2, layout: LAYOUT })],
    ["no layout", JSON.stringify({ format: "ezyview-layout", version: 1 })],
    ["no charts", JSON.stringify({ format: "ezyview-layout", version: 1, layout: { id: "x", charts: [] } })],
    ["null", "null"],
  ])("rejects %s with the opaque message", (_label, text) => {
    expect(() => parseLayoutJson(text, FALLBACK, noDefs)).toThrow("Not an EzyView layout");
  });
});
