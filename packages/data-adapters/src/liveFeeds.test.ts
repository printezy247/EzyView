import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLiveSources, LIVE_SOURCE_IDS } from "./liveFeeds.js";
import type { LiveSourceDeps } from "./liveFeeds.js";
import type { Quote } from "./types.js";

class FakeWS {
  static all: FakeWS[] = [];
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    FakeWS.all.push(this);
  }
  send(s: string) {
    this.sent.push(s);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.();
  }
  msg(o: unknown) {
    this.onmessage?.({ data: JSON.stringify(o) });
  }
  drop() {
    this.onclose?.();
  }
}

const json = (body: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);

function setup(routes: (url: string) => unknown, extra: Partial<LiveSourceDeps> = {}) {
  const urls: string[] = [];
  const fetchFn = vi.fn((url: string) => {
    urls.push(String(url));
    const r = routes(String(url));
    return r === undefined ? json({}, false) : json(r);
  });
  const sources = createLiveSources({
    fetch: fetchFn as unknown as typeof fetch,
    WebSocket: FakeWS as unknown as typeof WebSocket,
    getKey: async () => "SECRETKEY",
    now: () => 1_700_000_000_000,
    ...extra,
  });
  return { sources, urls, fetchFn };
}

beforeEach(() => {
  FakeWS.all = [];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const req = (symbol: string, resolution: "1m" | "1h" | "1D" | "5s" = "1m", extra = {}) => ({
  symbol,
  resolution,
  from: 0,
  to: 2_000_000_000,
  ...extra,
});

describe("LIVE_SOURCE_IDS", () => {
  it("lists the three sources", () => {
    expect([...LIVE_SOURCE_IDS]).toEqual(["binance", "kraken", "twelvedata"]);
    const { sources } = setup(() => undefined);
    expect(sources.binance.needsKey).toBe(false);
    expect(sources.twelvedata.needsKey).toBe(true);
  });
});

describe("binance", () => {
  it("supports USDT tickers by the part after the last colon", () => {
    const { sources } = setup(() => undefined);
    expect(sources.binance.supports("BINANCE:BTCUSDT")).toBe(true);
    expect(sources.binance.supports("OANDA:XAUUSD")).toBe(false);
    expect(sources.binance.supports("EURUSD")).toBe(false);
  });

  it("maps klines to ascending epoch-second candles and uses the data-api host", async () => {
    const { sources, urls } = setup(() => [
      [1700000000000, "1", "2", "0.5", "1.5", "10", 0],
      [1700000060000, "1.5", "2.5", "1", "2", "5", 0],
      [1700000120000, "bad", "2", "1", "2", "5", 0],
    ]);
    const c = await sources.binance.getHistory(req("BINANCE:BTCUSDT"));
    expect(c).toEqual([
      { time: 1700000000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
      { time: 1700000060, open: 1.5, high: 2.5, low: 1, close: 2, volume: 5 },
    ]);
    expect(urls[0]).toMatch(/^https:\/\/data-api\.binance\.vision\/api\/v3\/klines\?symbol=BTCUSDT&interval=1m/);
    expect(urls[0]).toContain("limit=1000");
  });

  it("caps limit at 1000, maps 1D to 1d, rejects unsupported resolutions", async () => {
    const { sources, urls } = setup(() => []);
    await sources.binance.getHistory(req("BTCUSDT", "1D", { limit: 5000 }));
    expect(urls[0]).toContain("interval=1d");
    expect(urls[0]).toContain("limit=1000");
    expect(await sources.binance.getHistory(req("BTCUSDT", "5s"))).toEqual([]);
    expect(urls).toHaveLength(1);
  });

  it("getQuote reads 24h ticker; returns null on bad data or http error", async () => {
    const { sources } = setup(() => ({ lastPrice: "100.5", priceChange: "-2", priceChangePercent: "-1.9" }));
    const q = await sources.binance.getQuote("BINANCE:BTCUSDT");
    expect(q).toMatchObject({ symbol: "BINANCE:BTCUSDT", last: 100.5, change: -2, changePercent: -1.9, time: 1_700_000_000 });
    const bad = setup(() => ({ lastPrice: "0" }));
    expect(await bad.sources.binance.getQuote("BTCUSDT")).toBeNull();
    const err = setup(() => undefined);
    expect(await err.sources.binance.getQuote("BTCUSDT")).toBeNull();
    expect(await err.sources.binance.getHistory(req("BTCUSDT"))).toEqual([]);
  });

  it("never throws when fetch rejects", async () => {
    const { sources } = setup(() => undefined, {
      fetch: (() => Promise.reject(new Error("boom"))) as unknown as typeof fetch,
    });
    expect(await sources.binance.getQuote("BTCUSDT")).toBeNull();
    expect(await sources.binance.getHistory(req("BTCUSDT"))).toEqual([]);
  });

  it("aborts a hanging fetch after ~4 s", async () => {
    const hang = ((_u: string, init: RequestInit) =>
      new Promise((_r, rej) => init.signal?.addEventListener("abort", () => rej(new Error("aborted"))))) as unknown as typeof fetch;
    const { sources } = setup(() => undefined, { fetch: hang });
    const p = sources.binance.getQuote("BTCUSDT");
    await vi.advanceTimersByTimeAsync(4100);
    expect(await p).toBeNull();
  });

  it("streams trade prices over the websocket and unsubscribe closes it", async () => {
    const { sources } = setup(() => undefined);
    const got: Quote[] = [];
    const stop = await sources.binance.subscribe(["BINANCE:BTCUSDT"], (q) => got.push(q));
    const ws = FakeWS.all[0]!;
    expect(ws.url).toBe("wss://stream.binance.vision/ws/btcusdt@trade");
    ws.open();
    ws.msg({ e: "trade", p: "123.4" });
    ws.msg({ e: "trade", p: "nope" });
    expect(got).toEqual([{ symbol: "BINANCE:BTCUSDT", last: 123.4, time: 1_700_000_000 }]);
    stop();
    expect(ws.closed).toBe(true);
  });

  it("reconnects with backoff, then falls back to 1 s polling after 3 failures", async () => {
    const { sources, urls } = setup(() => ({ lastPrice: "50" }));
    const got: Quote[] = [];
    const stop = await sources.binance.subscribe(["BTCUSDT"], (q) => got.push(q));
    FakeWS.all[0]!.drop();
    expect(FakeWS.all).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWS.all).toHaveLength(2);
    FakeWS.all[1]!.drop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(FakeWS.all).toHaveLength(3);
    FakeWS.all[2]!.drop(); // third failure -> polling
    await vi.advanceTimersByTimeAsync(0);
    expect(got.length).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(got.length).toBe(3);
    expect(urls.every((u) => u.includes("/ticker/24hr"))).toBe(true);
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(got.length).toBe(3);
  });

  it("polls when no WebSocket exists", async () => {
    const { sources } = setup(() => ({ lastPrice: "7" }), { WebSocket: undefined });
    // globalThis.WebSocket may exist in the test env; hide it
    const g = globalThis as { WebSocket?: unknown };
    const saved = g.WebSocket;
    g.WebSocket = undefined;
    try {
      const got: Quote[] = [];
      const stop = await sources.binance.subscribe(["BTCUSDT"], (q) => got.push(q));
      await vi.advanceTimersByTimeAsync(1500);
      expect(got.length).toBeGreaterThanOrEqual(2);
      stop();
    } finally {
      g.WebSocket = saved;
    }
  });
});

describe("kraken", () => {
  it("supports crypto quotes, not forex", () => {
    const { sources } = setup(() => undefined);
    expect(sources.kraken.supports("KRAKEN:BTCUSD")).toBe(true);
    expect(sources.kraken.supports("ETHEUR")).toBe(true);
    expect(sources.kraken.supports("FX:EURUSD")).toBe(false);
    expect(sources.kraken.supports("XAUUSD")).toBe(false);
  });

  it("OHLC maps BTC to XBT, keeps in-progress bar, only listed resolutions", async () => {
    const { sources, urls } = setup(() => ({
      error: [],
      result: {
        XXBTZUSD: [
          [1700000000, "1", "2", "0.5", "1.5", "1.2", "3", 4],
          [1700000060, "1.5", "2", "1", "1.8", "1.4", "2", 3],
        ],
        last: 1700000000,
      },
    }));
    const c = await sources.kraken.getHistory(req("BTCUSD", "1h"));
    expect(c).toHaveLength(2);
    expect(c[0]).toEqual({ time: 1700000000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 3 });
    expect(urls[0]).toMatch(/^https:\/\/api\.kraken\.com\/0\/public\/OHLC\?pair=XBTUSD&interval=60/);
    expect(await sources.kraken.getHistory(req("BTCUSD", "5s"))).toEqual([]);
  });

  it("returns [] on kraken error array", async () => {
    const { sources } = setup(() => ({ error: ["EQuery:Unknown asset pair"], result: {} }));
    expect(await sources.kraken.getHistory(req("BTCUSD"))).toEqual([]);
    expect(await sources.kraken.getQuote("BTCUSD")).toBeNull();
  });

  it("getQuote reads Ticker c/o", async () => {
    const { sources, urls } = setup(() => ({ error: [], result: { XXBTZUSD: { c: ["110", "1"], o: "100", b: ["109"], a: ["111"], v: ["5", "9"] } } }));
    const q = await sources.kraken.getQuote("KRAKEN:BTCUSD");
    expect(q).toMatchObject({ last: 110, change: 10, changePercent: 10, bid: 109, ask: 111, volume24h: 9 });
    expect(urls[0]).toBe("https://api.kraken.com/0/public/Ticker?pair=XBTUSD");
  });

  it("subscribes on ws v2 with BTC/USD and emits last", async () => {
    const { sources } = setup(() => undefined);
    const got: Quote[] = [];
    const stop = await sources.kraken.subscribe(["BTCUSD"], (q) => got.push(q));
    const ws = FakeWS.all[0]!;
    expect(ws.url).toBe("wss://ws.kraken.com/v2");
    ws.open();
    expect(JSON.parse(ws.sent[0]!)).toEqual({ method: "subscribe", params: { channel: "ticker", symbol: ["BTC/USD"] } });
    ws.msg({ channel: "ticker", type: "update", data: [{ symbol: "BTC/USD", last: 64000.5 }] });
    ws.msg({ channel: "heartbeat" });
    expect(got.map((q) => q.last)).toEqual([64000.5]);
    stop();
    expect(ws.closed).toBe(true);
  });
});

describe("twelvedata", () => {
  it("supports forex and metals only", () => {
    const { sources } = setup(() => undefined);
    expect(sources.twelvedata.supports("FX:EURUSD")).toBe(true);
    expect(sources.twelvedata.supports("OANDA:XAUUSD")).toBe(true);
    expect(sources.twelvedata.supports("BTCUSDT")).toBe(false);
    expect(sources.twelvedata.supports("AAPL")).toBe(false);
  });

  it("without a key: [] / null / no-op, no requests, no sockets", async () => {
    const { sources, fetchFn } = setup(() => undefined, { getKey: async () => null });
    expect(await sources.twelvedata.getHistory(req("XAUUSD"))).toEqual([]);
    expect(await sources.twelvedata.getQuote("XAUUSD")).toBeNull();
    const stop = await sources.twelvedata.subscribe(["XAUUSD"], () => undefined);
    expect(() => stop()).not.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(FakeWS.all).toHaveLength(0);
  });

  it("getKey that throws is treated as no key", async () => {
    const { sources } = setup(() => undefined, { getKey: async () => Promise.reject(new Error("keyring")) });
    expect(await sources.twelvedata.getQuote("XAUUSD")).toBeNull();
  });

  it("time_series: asc UTC candles, XAU/USD, interval map, outputsize <= 500", async () => {
    const { sources, urls } = setup(() => ({
      status: "ok",
      values: [
        { datetime: "2023-11-14 22:13:20", open: "1", high: "2", low: "0.5", close: "1.5" },
        { datetime: "2023-11-14 22:28:20", open: "1.5", high: "2", low: "1", close: "1.7", volume: "9" },
      ],
    }));
    const c = await sources.twelvedata.getHistory(req("OANDA:XAUUSD", "1m", { limit: 9999 }));
    expect(c).toEqual([
      { time: 1700000000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 0 },
      { time: 1700000900, open: 1.5, high: 2, low: 1, close: 1.7, volume: 9 },
    ]);
    expect(urls[0]).toMatch(/^https:\/\/api\.twelvedata\.com\/time_series\?symbol=XAU\/USD&interval=1min&outputsize=500&order=asc&timezone=UTC&apikey=SECRETKEY$/);
    await sources.twelvedata.getHistory(req("EURUSD", "1D"));
    expect(urls[1]).toContain("interval=1day");
    expect(await sources.twelvedata.getHistory(req("EURUSD", "5s"))).toEqual([]);
  });

  it("parses date-only daily bars as UTC midnight", async () => {
    const { sources } = setup(() => ({ values: [{ datetime: "2023-11-14", open: "1", high: "1", low: "1", close: "1" }] }));
    const c = await sources.twelvedata.getHistory(req("EURUSD", "1D"));
    expect(c[0]!.time).toBe(Date.UTC(2023, 10, 14) / 1000);
  });

  it("status error => [] / null", async () => {
    const { sources } = setup(() => ({ status: "error", code: 429, message: "limit" }));
    expect(await sources.twelvedata.getHistory(req("EURUSD"))).toEqual([]);
    expect(await sources.twelvedata.getQuote("EURUSD")).toBeNull();
  });

  it("getQuote via /price", async () => {
    const { sources, urls } = setup(() => ({ price: "2650.12" }));
    const q = await sources.twelvedata.getQuote("OANDA:XAUUSD");
    expect(q).toMatchObject({ symbol: "OANDA:XAUUSD", last: 2650.12 });
    expect(urls[0]).toBe("https://api.twelvedata.com/price?symbol=XAU/USD&apikey=SECRETKEY");
  });

  it("streams price events and sends the subscribe frame", async () => {
    const { sources } = setup(() => undefined);
    const got: Quote[] = [];
    const stop = await sources.twelvedata.subscribe(["OANDA:XAUUSD"], (q) => got.push(q));
    const ws = FakeWS.all[0]!;
    expect(ws.url).toBe("wss://ws.twelvedata.com/v1/quotes/price?apikey=SECRETKEY");
    ws.open();
    expect(JSON.parse(ws.sent[0]!)).toEqual({ action: "subscribe", params: { symbols: "XAU/USD" } });
    ws.msg({ event: "subscribe-status", status: "ok", success: [{ symbol: "XAU/USD" }], fails: null });
    ws.msg({ event: "price", symbol: "XAU/USD", price: 2651.5, timestamp: 1700000000 });
    expect(got.map((q) => q.last)).toEqual([2651.5]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(ws.sent.some((s) => s.includes("heartbeat"))).toBe(true);
    stop();
    expect(ws.closed).toBe(true);
  });

  it("plan error falls back to REST polling no faster than every 8 s", async () => {
    const { sources, urls } = setup(() => ({ price: "10" }));
    const got: Quote[] = [];
    const stop = await sources.twelvedata.subscribe(["EURUSD"], (q) => got.push(q));
    const ws = FakeWS.all[0]!;
    ws.open();
    ws.msg({ event: "subscribe-status", status: "error", fails: [{ symbol: "EUR/USD" }] });
    await vi.advanceTimersByTimeAsync(0);
    expect(got).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(7900);
    expect(got).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(got).toHaveLength(2);
    expect(urls.every((u) => u.startsWith("https://api.twelvedata.com/price"))).toBe(true);
    stop();
  });

  it("socket close falls back to polling too", async () => {
    const { sources } = setup(() => ({ price: "10" }));
    const got: Quote[] = [];
    const stop = await sources.twelvedata.subscribe(["EURUSD"], (q) => got.push(q));
    FakeWS.all[0]!.drop();
    await vi.advanceTimersByTimeAsync(0);
    expect(got).toHaveLength(1);
    stop();
  });

  it("never leaks the key in thrown or returned values", async () => {
    const { sources } = setup(() => undefined, {
      fetch: ((u: string) => Promise.reject(new Error(`failed ${u}`))) as unknown as typeof fetch,
    });
    const q = await sources.twelvedata.getQuote("EURUSD");
    expect(JSON.stringify(q)).not.toContain("SECRETKEY");
  });
});

describe("search / symbol info", () => {
  it("searchSymbols filters a small static list; getSymbol only for supported", async () => {
    const { sources } = setup(() => undefined);
    const r = await sources.binance.searchSymbols("eth");
    expect(r.map((s) => s.ticker)).toEqual(["ETHUSDT"]);
    expect(r[0]!.provider).toBe("binance");
    expect(await sources.binance.searchSymbols("eth", "forex")).toEqual([]);
    expect(await sources.twelvedata.getSymbol("FX:EURUSD")).toMatchObject({ ticker: "EURUSD", assetClass: "forex" });
    expect(await sources.twelvedata.getSymbol("BTCUSDT")).toBeNull();
  });
});
