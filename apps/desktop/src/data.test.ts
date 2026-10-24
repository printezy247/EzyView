import { afterEach, describe, expect, it } from "vitest";
import { MAX_DEMO_TICKERS, demoTickerCount, releaseTicker, retainTicker, stopTicking, safeQuote } from "./data";

/** Wait two macrotasks so the microtasks around `market.subscribe(...)` have settled. */
const flushSubscribes = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("demo ticker leases", () => {
  afterEach(() => {
    for (let i = 1; i <= MAX_DEMO_TICKERS + 2; i++) stopTicking(`LEASETEST:S${i}`);
  });

  it("starts a ticker for the first lease and stops it at the last release", async () => {
    const release = retainTicker("LEASETEST:S1");
    await flushSubscribes();
    expect(demoTickerCount()).toBeGreaterThanOrEqual(1);

    release();
    await flushSubscribes();
    expect(demoTickerCount()).toBe(0);
  });

  it("keeps the ticker while another lease still holds it", async () => {
    const first = retainTicker("LEASETEST:S2");
    const second = retainTicker("LEASETEST:S2");
    await flushSubscribes();

    second();
    await flushSubscribes();
    expect(demoTickerCount()).toBeGreaterThanOrEqual(1);

    first();
    await flushSubscribes();
    expect(demoTickerCount()).toBe(0);
  });

  it("caps live demo subscriptions at MAX_DEMO_TICKERS and survives releases", async () => {
    for (let i = 1; i <= MAX_DEMO_TICKERS + 2; i++) retainTicker(`LEASETEST:S${i}`);
    await flushSubscribes();
    expect(demoTickerCount()).toBeLessThanOrEqual(MAX_DEMO_TICKERS);

    for (let i = 1; i <= MAX_DEMO_TICKERS + 2; i++) releaseTicker(`LEASETEST:S${i}`);
    await flushSubscribes();
    expect(demoTickerCount()).toBe(0);
  });

  it("force-stops a ticker even with a lease outstanding", async () => {
    retainTicker("LEASETEST:S3");
    await flushSubscribes();

    stopTicking("LEASETEST:S3");
    await flushSubscribes();
    expect(demoTickerCount()).toBe(0);
  });

  it("release without retain is a no-op", () => {
    expect(() => releaseTicker("LEASETEST:S4")).not.toThrow();
  });
});

describe("safeQuote", () => {
  it("resolves a demo quote and resolves null instead of rejecting on failure", async () => {
    expect(await safeQuote("DEMO:BTCUSDT")).toMatchObject({ last: expect.any(Number) });
    expect(await safeQuote("DEMO:NOPE_NOPE")).toBe(null);
  });
});
