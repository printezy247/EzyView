import { describe, expect, it } from "vitest";
import {
  filterSymbols,
  normalizeSymbolForSource,
  normalizeTimeframe,
  parseCommand,
  resolvePair,
  stepTimeframe,
  symbolsForSource,
  TIMEFRAMES,
} from "./ChartCommandInput";

describe("parseCommand", () => {
  it("returns null for non-slash input", () => {
    expect(parseCommand("AAPL")).toBeNull();
    expect(parseCommand("  ")).toBeNull();
    expect(parseCommand("")).toBeNull();
  });
  it("parses a command with no args", () => {
    expect(parseCommand("/layout")).toEqual({ name: "layout", args: "" });
  });
  it("parses a command with args", () => {
    expect(parseCommand("/tf 1h")).toEqual({ name: "tf", args: "1h" });
    expect(parseCommand("  /sym aapl  ")).toEqual({ name: "sym", args: "aapl" });
    expect(parseCommand("/pair eur/usd")).toEqual({ name: "pair", args: "eur/usd" });
    expect(parseCommand("/layout swing")).toEqual({ name: "layout", args: "swing" });
  });
});

describe("source scoping", () => {
  const pool = ["OANDA:EURUSD", "BINANCE:BTCUSDT", "KRAKEN:ETHUSD", "NASDAQ:AAPL", "EURUSD"];

  it("keeps only MT5 bare names for the broker feed", () => {
    expect(symbolsForSource(pool, "mt5")).toEqual(["EURUSD"]);
  });
  it("keeps only the matching venue prefix for crypto feeds", () => {
    expect(symbolsForSource(pool, "binance")).toEqual(["BINANCE:BTCUSDT"]);
    expect(symbolsForSource(pool, "kraken")).toEqual(["KRAKEN:ETHUSD"]);
  });
  it("keeps decorated symbols for demo charts", () => {
    expect(symbolsForSource(pool, "demo")).toEqual(["OANDA:EURUSD", "BINANCE:BTCUSDT", "KRAKEN:ETHUSD", "NASDAQ:AAPL"]);
  });
});

describe("normalizeSymbolForSource", () => {
  it("strips the venue for MT5", () => {
    expect(normalizeSymbolForSource("OANDA:EURUSD", "mt5")).toBe("EURUSD");
    expect(normalizeSymbolForSource("eurusd", "mt5")).toBe("EURUSD");
  });
  it("adds the venue for crypto feeds", () => {
    expect(normalizeSymbolForSource("btcusdt", "binance")).toBe("BINANCE:BTCUSDT");
    expect(normalizeSymbolForSource("BINANCE:BTCUSDT", "binance")).toBe("BINANCE:BTCUSDT");
  });
  it("turns a bare forex pair into an OANDA symbol on a demo chart", () => {
    expect(normalizeSymbolForSource("eurusd", "demo")).toBe("OANDA:EURUSD");
    expect(normalizeSymbolForSource("NASDAQ:AAPL", "demo")).toBe("NASDAQ:AAPL");
  });
});

describe("resolvePair", () => {
  it("accepts slash, colon and dash forms", () => {
    expect(resolvePair("EUR/USD", "mt5")).toBe("EURUSD");
    expect(resolvePair("EUR-USD", "binance")).toBe("BINANCE:EURUSD");
    expect(resolvePair("EUR:USD", "twelvedata")).toBe("EUR/USD");
  });
  it("accepts a six-letter pair and rejects nonsense", () => {
    expect(resolvePair("gbpusd", "demo")).toBe("OANDA:GBPUSD");
    expect(resolvePair("nope", "mt5")).toBeNull();
  });
});

describe("timeframe helpers", () => {
  it("normalizes case and common numeric aliases", () => {
    expect(normalizeTimeframe("1d")).toBe("1D");
    expect(normalizeTimeframe("60")).toBe("1h");
    expect(normalizeTimeframe("240")).toBe("4h");
    expect(normalizeTimeframe("3h")).toBeNull();
  });
  it("steps through the picker and clamps at both ends", () => {
    expect(stepTimeframe("1m", -1)).toBe("1m");
    expect(stepTimeframe("1m", 1)).toBe("5m");
    expect(stepTimeframe("1M", 1)).toBe("1M");
    expect(stepTimeframe("bogus", 1)).toBeNull();
  });
});

describe("filterSymbols", () => {
  it("returns all when query empty", () => {
    expect(filterSymbols(["AAPL", "MSFT"], "")).toEqual(["AAPL", "MSFT"]);
    expect(filterSymbols(["AAPL", "MSFT"], "   ")).toEqual(["AAPL", "MSFT"]);
  });
  it("filters case-insensitively", () => {
    expect(filterSymbols(["AAPL", "MSFT", "amzn"], "a")).toEqual(["AAPL", "amzn"]);
  });
});

describe("TIMEFRAMES", () => {
  it("contains the canonical list", () => {
    expect(TIMEFRAMES).toContain("1m");
    expect(TIMEFRAMES).toContain("1M");
  });
});