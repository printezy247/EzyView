import { describe, expect, it } from "vitest";
import { parseCrosshairMessage } from "./crosshairBus";

describe("parseCrosshairMessage", () => {
  it("accepts a position and a clear from another window", () => {
    expect(parseCrosshairMessage({ from: "b", symbol: "OANDA:XAUUSD", time: 10, price: 2650.5 }, "a")).toEqual({
      symbol: "OANDA:XAUUSD",
      time: 10,
      price: 2650.5,
    });
    expect(parseCrosshairMessage({ from: "b", symbol: "X", time: null, price: null }, "a")).toEqual({
      symbol: "X",
      time: null,
      price: null,
    });
  });

  it("ignores our own echo and malformed payloads", () => {
    for (const bad of [
      { from: "a", symbol: "X", time: 1, price: 1 },
      null,
      "x",
      { from: "b", symbol: "", time: 1, price: 1 },
      { from: "b", symbol: "X", time: Number.NaN, price: 1 },
      { from: "b", symbol: "X", time: 1, price: null },
      { from: "b", symbol: "X".repeat(65), time: 1, price: 1 },
    ]) {
      expect(parseCrosshairMessage(bad, "a")).toBeNull();
    }
  });
});
