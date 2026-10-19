import { describe, expect, it } from "vitest";
import { DemoMarketAdapter } from "./demo.js";
import { createRegistry, registerMarket, resolveProvider } from "./registry.js";

const adapter = new DemoMarketAdapter();

describe("DemoMarketAdapter", () => {
  it("pings", async () => {
    await expect(adapter.ping()).resolves.toBe(true);
  });

  it("returns the demo symbol universe", async () => {
    const all = await adapter.searchSymbols("");
    expect(all.length).toBeGreaterThanOrEqual(8);

    const crypto = await adapter.searchSymbols("", "crypto");
    expect(crypto.every((s) => s.assetClass === "crypto")).toBe(true);

    const btc = await adapter.searchSymbols("btc");
    expect(btc[0]?.symbol).toBe("DEMO:BTCUSDT");
  });

  it("resolves a symbol by id or ticker", async () => {
    await expect(adapter.getSymbol("DEMO:BTCUSDT")).resolves.toMatchObject({ ticker: "BTCUSDT" });
    await expect(adapter.getSymbol("XAUUSD")).resolves.toMatchObject({ assetClass: "forex" });
    await expect(adapter.getSymbol("NOPE")).resolves.toBeNull();
  });

  it("accepts an exchange-prefixed alias for the default workspace symbol", async () => {
    // The workspace seeds charts with BINANCE:BTCUSDT, an instrument this feed
    // does not list. It has to resolve by ticker instead of returning no bars,
    // which would leave the chart blank forever.
    await expect(adapter.getSymbol("BINANCE:BTCUSDT")).resolves.toMatchObject({ ticker: "BTCUSDT" });
    const bars = await adapter.getHistory({ symbol: "BINANCE:BTCUSDT", resolution: "1m", from: 0, to: 0, limit: 10 });
    expect(bars).toHaveLength(10);
  });

  it("produces deterministic, oldest-first OHLCV", async () => {
    const req = { symbol: "DEMO:BTCUSDT", resolution: "5m" as const, from: 1_700_000_000, to: 1_700_100_000, limit: 120 };
    const a = await adapter.getHistory(req);
    const b = await adapter.getHistory(req);

    expect(a).toHaveLength(120);
    expect(a).toEqual(b);

    for (let i = 1; i < a.length; i++) {
      expect(a[i]!.time).toBeGreaterThan(a[i - 1]!.time);
    }

    for (const c of a) {
      expect(c.high).toBeGreaterThanOrEqual(c.low);
      expect(c.high).toBeGreaterThanOrEqual(c.open);
      expect(c.high).toBeGreaterThanOrEqual(c.close);
      expect(c.low).toBeLessThanOrEqual(c.open);
      expect(c.low).toBeLessThanOrEqual(c.close);
      expect(c.volume).toBeGreaterThan(0);
    }
  });

  it("never returns candles outside the requested window", async () => {
    const from = 1_700_000_000;
    const to = 1_700_036_000;
    const candles = await adapter.getHistory({ symbol: "DEMO:EURUSD", resolution: "1h", from, to, limit: 10_000 });
    expect(candles.length).toBeGreaterThan(0);
    for (const c of candles) {
      expect(c.time).toBeGreaterThanOrEqual(from);
      expect(c.time).toBeLessThan(to + 3600);
    }
  });

  it("streams live quotes until unsubscribed", async () => {
    const seen: number[] = [];
    const unsub = await adapter.subscribe(["DEMO:BTCUSDT"], (q) => seen.push(q.last));
    await new Promise((r) => setTimeout(r, 1200));
    await unsub();
    expect(seen.length).toBeGreaterThan(0);
  });
});

describe("registry", () => {
  it("registers and resolves a provider prefix", () => {
    const registry = createRegistry();
    registerMarket(registry, adapter);

    const resolved = resolveProvider(registry, "DEMO:BTCUSDT");
    expect(resolved?.adapter.id).toBe("demo");
    expect(resolved?.local).toBe("BTCUSDT");

    expect(() => registerMarket(registry, adapter)).toThrow(/already registered/);
  });
});
