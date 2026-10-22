import { describe, expect, it } from "vitest";
import { effectiveSource, isDataSourceChoice, isLiveSourceChoice, orderWarning, sourceLabel, sourceOptions } from "./chartSource";

describe("effectiveSource", () => {
  it("auto follows the global feed switch", () => {
    expect(effectiveSource("auto", "mt5")).toBe("mt5");
    expect(effectiveSource("auto", "ezyview")).toBe("demo");
    expect(effectiveSource(undefined, "ezyview")).toBe("demo");
  });
  it("an explicit choice wins over the global switch", () => {
    expect(effectiveSource("binance", "mt5")).toBe("binance");
    expect(effectiveSource("mt5", "ezyview")).toBe("mt5");
    expect(effectiveSource("demo", "mt5")).toBe("demo");
  });
});

describe("isDataSourceChoice", () => {
  it("accepts only known ids", () => {
    expect(isDataSourceChoice("kraken")).toBe(true);
    expect(isDataSourceChoice("nope")).toBe(false);
    expect(isDataSourceChoice(3)).toBe(false);
  });
});

describe("orderWarning", () => {
  it("warns only when MT5 takes the order but the chart price is elsewhere", () => {
    expect(orderWarning("binance", true)).toBe("Chart price is from Binance; MT5 fills at the broker price");
    expect(orderWarning("demo", true)).toBe("Chart price is from EzyView demo; MT5 fills at the broker price");
    expect(orderWarning("mt5", true)).toBeNull();
    expect(orderWarning("binance", false)).toBeNull();
  });
});

const supports = (id: string, symbol: string) =>
  id === "binance" ? symbol.endsWith("USDT") : id === "twelvedata" ? symbol.endsWith("USD") : false;

describe("sourceOptions", () => {
  it("always lists auto, demo and MT5, and only live sources that support the symbol", () => {
    const ids = sourceOptions("BTCUSDT", { supports, hasTwelveKey: true }).map((o) => o.id);
    expect(ids).toEqual(["auto", "demo", "mt5", "binance"]);
  });
  it("greys out Twelve Data with a hint when no key", () => {
    const td = sourceOptions("XAUUSD", { supports, hasTwelveKey: false }).find((o) => o.id === "twelvedata")!;
    expect(td.disabled).toBe(true);
    expect(td.hint).toBe("Add a key in API keys");
    const ok = sourceOptions("XAUUSD", { supports, hasTwelveKey: true }).find((o) => o.id === "twelvedata")!;
    expect(ok.disabled).toBeFalsy();
  });
  it("labels", () => {
    expect(sourceLabel("twelvedata")).toBe("Twelve Data");
    expect(sourceLabel("mt5")).toBe("Broker MT5");
  });
});

describe("isLiveSourceChoice", () => {
  it("is true only for the three live sources", () => {
    expect(["binance", "kraken", "twelvedata"].every((id) => isLiveSourceChoice(id as never))).toBe(true);
    expect(["auto", "demo", "mt5"].some((id) => isLiveSourceChoice(id as never))).toBe(false);
  });
});
