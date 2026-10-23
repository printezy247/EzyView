import { describe, expect, it, beforeEach } from "vitest";
import { precisionForSymbol } from "./pricePrecision";
import { useWorkspace } from "./store";

describe("precisionForSymbol", () => {
  beforeEach(() => {
    useWorkspace.setState({ watchlist: [] });
  });

  it("formats FX pairs with their own decimals, not the magnitude guess", () => {
    expect(precisionForSymbol("FX:EURUSD", 1.085)).toBe(5);
    expect(precisionForSymbol("EURUSD", 1.085)).toBe(5);
    expect(precisionForSymbol("USDJPY", 150.252)).toBe(3);
  });

  it("keeps metals and crypto at their traded precision", () => {
    expect(precisionForSymbol("OANDA:XAUUSD", 4128.5)).toBe(2);
    expect(precisionForSymbol("BINANCE:BTCUSDT", 65000)).toBe(2);
    expect(precisionForSymbol("BINANCE:ETHUSDT", 3200.55)).toBe(2);
  });

  it("prefers the precision the adapter reported for the symbol", () => {
    useWorkspace.setState({
      watchlist: [
        {
          symbol: "BINANCE:BTCUSDT",
          ticker: "BTCUSDT",
          description: "Bitcoin",
          assetClass: "crypto",
          precision: 1,
          price: 65000,
          changePct: 1,
        },
      ],
    });
    expect(precisionForSymbol("BINANCE:BTCUSDT", 65000)).toBe(1);
  });

  it("falls back to the magnitude guess for an unknown symbol", () => {
    expect(precisionForSymbol(null, 0.00012345)).toBe(8);
    expect(precisionForSymbol("SOMETHING:ODD", 42)).toBe(3);
    expect(precisionForSymbol(undefined, null)).toBe(2);
  });
});
