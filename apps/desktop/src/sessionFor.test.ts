import { describe, expect, it } from "vitest";

import { sessionForSymbol } from "./sessionFor";

/**
 * A symbol maps to a session for the chart's break shading. The mapping is a
 * deliberate guess from the ticker's suffix — the app has no exchange calendar —
 * so it is tested for the cases it claims and for the honest `null` it returns
 * when it does not know.
 */

describe("sessionForSymbol", () => {
  it("sends crypto anywhere to the round-the-clock session", () => {
    expect(sessionForSymbol("BINANCE:BTCUSDT")).toBe("crypto");
    expect(sessionForSymbol("COINBASE:ETHUSD")).toBe("crypto");
    expect(sessionForSymbol("BTC/USD")).toBe("crypto");
  });

  it("reads a 24-hour forex pair as never closing, via crypto", () => {
    // Spot FX trades through the week, so shading a weekend break would be wrong.
    expect(sessionForSymbol("OANDA:XAUUSD")).toBe("crypto");
    expect(sessionForSymbol("EUR/USD")).toBe("crypto");
  });

  it("sends a US-listed equity to New York", () => {
    expect(sessionForSymbol("NASDAQ:AAPL")).toBe("newyork");
    expect(sessionForSymbol("NYSE:JPM")).toBe("newyork");
  });

  it("sends a European or Asian listing to its own session", () => {
    expect(sessionForSymbol("LSE:VOD")).toBe("london");
    expect(sessionForSymbol("TSE:7203")).toBe("tokyo");
  });

  it("returns null when it does not recognise the venue, rather than guessing", () => {
    expect(sessionForSymbol("WEIRD:THING")).toBeNull();
    expect(sessionForSymbol("")).toBeNull();
  });

  it("is case-insensitive about the venue prefix", () => {
    expect(sessionForSymbol("nasdaq:aapl")).toBe("newyork");
    expect(sessionForSymbol("Lse:vod")).toBe("london");
  });
});
