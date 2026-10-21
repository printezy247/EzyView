import { describe, expect, it } from "vitest";
import type { Candle } from "@ezyview/data-adapters";
import { candlesToCsv, candlesToJson } from "./chartDataExport";

const BARS: Candle[] = [
  { time: 1_700_000_000, open: 1, high: 2.5, low: 0.5, close: 1.5, volume: 10 },
  { time: 1_700_086_400, open: 1.5, high: 3, low: 1, close: 2, volume: 0 },
];

describe("candlesToCsv", () => {
  it("writes the pinned header and CRLF rows with ISO UTC times", () => {
    expect(candlesToCsv(BARS)).toBe(
      [
        "time,open,high,low,close,volume",
        "2023-11-14T22:13:20.000Z,1,2.5,0.5,1.5,10",
        "2023-11-15T22:13:20.000Z,1.5,3,1,2,0",
      ].join("\r\n"),
    );
  });

  it("returns the header alone for no bars", () => {
    expect(candlesToCsv([])).toBe("time,open,high,low,close,volume");
  });
});

describe("candlesToJson", () => {
  it("round-trips bars under the format tag", () => {
    const parsed = JSON.parse(candlesToJson(BARS, { symbol: "BTCUSDT", resolution: "1D" }));
    expect(parsed).toEqual({ format: "ezyview-chart", version: 1, symbol: "BTCUSDT", resolution: "1D", bars: BARS });
  });
});
