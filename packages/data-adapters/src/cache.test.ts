import { describe, expect, it, vi } from "vitest";
import { CandleCache, historyKey } from "./cache.js";
import type { Candle } from "./types.js";

const candle = (time: number): Candle => ({ time: time as Candle["time"], open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 });

describe("CandleCache", () => {
  it("returns cached candles within TTL and refetches after expiry", async () => {
    let now = 0;
    const cache = new CandleCache({ ttlMs: 1000, now: () => now });
    const fetch = vi.fn(async () => [candle(1)]);
    await expect(cache.getOrFetch("k", fetch)).resolves.toHaveLength(1);
    await expect(cache.getOrFetch("k", fetch)).resolves.toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    now = 1500;
    await expect(cache.getOrFetch("k", fetch)).resolves.toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("dedupes concurrent fetches for the same key", async () => {
    const cache = new CandleCache();
    let resolve!: (v: Candle[]) => void;
    const gate = new Promise<Candle[]>((r) => (resolve = r));
    const fetch = vi.fn(() => gate);
    const a = cache.getOrFetch("k", fetch);
    const b = cache.getOrFetch("k", fetch);
    resolve([candle(2)]);
    await expect(a).resolves.toHaveLength(1);
    await expect(b).resolves.toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("builds stable history keys", () => {
    expect(historyKey("binance", "BTCUSDT", "1h", 500)).toBe("binance:BTCUSDT:1h:500");
  });
});
