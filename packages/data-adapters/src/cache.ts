import type { Candle } from "./types.js";

/**
 * Shared candle cache for all consumers (desktop, mcp-server, tests).
 *
 * A bar only changes when it closes, so a short TTL is safe and stops the
 * chart, the replay bar and the MCP snapshot from each re-downloading the
 * same series. In-flight requests are deduped by key: concurrent callers
 * share one promise instead of firing N identical fetches.
 */
export interface CandleCacheOptions {
  /** Milliseconds a resolved series stays fresh. Default 30_000. */
  ttlMs?: number;
  /** Injected clock for tests. */
  now?: () => number;
}

interface Entry {
  at: number;
  candles: Candle[];
}

export class CandleCache {
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly store = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<Candle[]>>();

  constructor(opts: CandleCacheOptions = {}) {
    this.ttlMs = Math.max(0, opts.ttlMs ?? 30_000);
    this.now = opts.now ?? (() => Date.now());
  }

  /** Cached candles when fresh, otherwise null. */
  get(key: string): Candle[] | null {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (this.now() - hit.at > this.ttlMs) {
      this.store.delete(key);
      return null;
    }
    return hit.candles;
  }

  set(key: string, candles: Candle[]): void {
    this.store.set(key, { at: this.now(), candles });
  }

  clear(): void {
    this.store.clear();
    this.inflight.clear();
  }

  /**
   * Return the cached series when fresh, otherwise run `fetch`, cache it and
   * share the one promise with concurrent callers for the same key.
   */
  async getOrFetch(key: string, fetch: () => Promise<Candle[]>): Promise<Candle[]> {
    const hit = this.get(key);
    if (hit) return hit;
    const running = this.inflight.get(key);
    if (running) return running;
    const promise = (async () => {
      try {
        const candles = await fetch();
        this.set(key, candles);
        return candles;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, promise);
    return promise;
  }
}

/** Default process-wide cache used by the desktop when no explicit cache is passed. */
export const sharedCandleCache = new CandleCache();

/** Cache key for a history request. */
export const historyKey = (source: string, symbol: string, interval: string, limit: number): string =>
  `${source}:${symbol}:${interval}:${limit}`;
