import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetQuotePoller, subscribeQuote } from "./quotePoller";

const quote = (last: number) => ({
  symbol: "OANDA:XAUUSD",
  last,
  time: 1_700_000_000,
  changePercent: 0,
});

const quoteOf = vi.fn(async () => quote(4100));

vi.mock("./data", () => ({
  quoteOf: (...args: unknown[]) => quoteOf(...(args as [])),
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
