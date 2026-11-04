import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pushQuote, resetQuotePoller, setDemoAnchorBase, subscribeQuote } from "./quotePoller";

const quote = (last: number) => ({
  symbol: "OANDA:XAUUSD",
  last,
  time: 1_700_000_000,
  changePercent: 0,
});

const quoteOf = vi.fn(async () => quote(4100));

vi.mock("./data", () => ({
  quoteOf: (...args: unknown[]) => quoteOf(...(args as [])),
  resolveSource: (choice: unknown) => (choice as string | undefined) ?? "demo",
  retainTicker: () => () => {},
  releaseTicker: () => {},
}));

describe("subscribeQuote", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    quoteOf.mockClear();
    resetQuotePoller();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shares one request between two subscribers of the same symbol", async () => {
    subscribeQuote("OANDA:XAUUSD", () => {}, { intervalMs: 1000 });
    subscribeQuote("OANDA:XAUUSD", () => {}, { intervalMs: 1000 });

    await vi.advanceTimersByTimeAsync(0);
    expect(quoteOf).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(quoteOf).toHaveBeenCalledTimes(2);
  });

  it("polls at the fastest subscriber cadence but delivers each at its own", async () => {
    const fast = vi.fn();
    const slow = vi.fn();
    subscribeQuote("OANDA:XAUUSD", fast, { intervalMs: 500 });
    subscribeQuote("OANDA:XAUUSD", slow, { intervalMs: 2000 });

    await vi.advanceTimersByTimeAsync(0);
    expect(fast).toHaveBeenCalled();
    expect(slow).toHaveBeenCalled();

    fast.mockClear();
    slow.mockClear();
    await vi.advanceTimersByTimeAsync(1000);
    // Two shared requests in one second, delivered to the fast panel only.
    expect(quoteOf).toHaveBeenCalledTimes(3);
    expect(fast).toHaveBeenCalledTimes(2);
    expect(slow).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(slow).toHaveBeenCalledTimes(1);
  });

  it("stops polling when the last subscriber leaves", async () => {
    const stop = subscribeQuote("OANDA:XAUUSD", () => {}, { intervalMs: 500 });
    await vi.advanceTimersByTimeAsync(0);
    stop();
    quoteOf.mockClear();

    await vi.advanceTimersByTimeAsync(5000);
    expect(quoteOf).not.toHaveBeenCalled();
  });

  it("shows the cached price to a panel that opens later", async () => {
    subscribeQuote("OANDA:XAUUSD", () => {}, { intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);

    const listener = vi.fn();
    subscribeQuote("OANDA:XAUUSD", listener, { intervalMs: 1000 });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ last: 4100 }));
  });
});

describe("pushQuote", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    quoteOf.mockClear();
    resetQuotePoller();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("delivers a pushed live tick to subscribers immediately, ahead of cadence", async () => {
    const listener = vi.fn();
    subscribeQuote("BINANCE:BTCUSDT", listener, { source: "binance", intervalMs: 5000 });
    await vi.advanceTimersByTimeAsync(0);
    listener.mockClear();
    quoteOf.mockClear();

    // A WebSocket tick arrives 100 ms after the last poll: the panel hears it
    // now instead of at its next 5 s boundary.
    await vi.advanceTimersByTimeAsync(100);
    pushQuote("BINANCE:BTCUSDT", { ...quote(97500), symbol: "BINANCE:BTCUSDT" }, "binance");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ last: 97500 }));
    expect(quoteOf).not.toHaveBeenCalled();
  });

  it("seeds a panel that subscribes after the push", () => {
    pushQuote("BINANCE:BTCUSDT", { ...quote(97500), symbol: "BINANCE:BTCUSDT" }, "binance");
    const listener = vi.fn();
    subscribeQuote("BINANCE:BTCUSDT", listener, { source: "binance", intervalMs: 1000 });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ last: 97500 }));
  });

  it("anchors demo ticks to the registered history close once", async () => {
    // History says the last close is 4200; the demo ticker starts at 4100.
    setDemoAnchorBase("OANDA:XAUUSD", 4200);
    const listener = vi.fn();
    subscribeQuote("OANDA:XAUUSD", listener, { intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    // One offset (+100) for every consumer, not one per chart.
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ last: 4200 }));

    listener.mockClear();
    pushQuote("OANDA:XAUUSD", quote(4105));
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ last: 4205 }));
  });

  it("re-anchors when the history reloads with a new close", async () => {
    setDemoAnchorBase("OANDA:XAUUSD", 4200);
    const listener = vi.fn();
    subscribeQuote("OANDA:XAUUSD", listener, { intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ last: 4200 }));

    setDemoAnchorBase("OANDA:XAUUSD", 4300);
    listener.mockClear();
    await vi.advanceTimersByTimeAsync(1000);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ last: 4300 }));
  });
});
