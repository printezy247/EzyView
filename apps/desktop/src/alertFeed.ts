/**
 * Live alert evaluation. Nothing fed quotes into the store's `applyCandle`
 * before Phase 9, so price alerts never fired at runtime. This polls the
 * active feed (demo or MT5, via `quoteOf`) for symbols that still have a live
 * alert, evaluates each quote against 1-minute bar buckets, and raises a native
 * notification (and optional sound chime) for every alert that just fired.
 */
import type { PriceAlert, Quote } from "@ezyview/data-adapters";
import { quoteOf } from "./data";
import { notifyNative } from "./shell";
import { useWorkspace } from "./store";

const BAR_BUCKET_SECONDS = 60;
const QUOTE_TIMEOUT_MS = 5000;

/** Alerts that can still fire: armed ones, and triggered ones that re-arm per bar. */
export function liveAlerts(alerts: readonly PriceAlert[]): PriceAlert[] {
  return alerts.filter((a) => a.state === "armed" || a.frequency !== "once");
}

export const alertSymbols = (alerts: readonly PriceAlert[]): string[] => [...new Set(liveAlerts(alerts).map((a) => a.symbol))];

/** Bucket a unix-seconds timestamp to the start of its bar period. */
export function barBucketTime(time: number, stepSeconds = BAR_BUCKET_SECONDS): number {
  if (!Number.isFinite(time) || stepSeconds <= 0) return time;
  return Math.floor(time / stepSeconds) * stepSeconds;
}

/** A flat bar at the quote's last price, enough for crossing/threshold conditions. */
export function candleFromQuote(q: Quote) {
  return { time: q.time, open: q.last, high: q.last, low: q.last, close: q.last, volume: 0 };
}

/** Race a promise against a timeout so a hung feed never wedges the loop. */
export function withTimeout<T>(promise: Promise<T>, ms = QUOTE_TIMEOUT_MS): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

let busy = false;
const lastBucketBySymbol = new Map<string, number>();

export function resetAlertFeedState(): void {
  busy = false;
  lastBucketBySymbol.clear();
}

export async function tickAlertFeed(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const symbols = alertSymbols(useWorkspace.getState().alerts);
    const quotes = await Promise.all(symbols.map((s) => withTimeout(quoteOf(s), QUOTE_TIMEOUT_MS)));
    for (const [i, symbol] of symbols.entries()) {
      const quote = quotes[i];
      if (!quote) continue;
      const bucket = barBucketTime(quote.time);
      const prevBucket = lastBucketBySymbol.get(symbol);
      const barClosed = prevBucket !== undefined && bucket > prevBucket;
      lastBucketBySymbol.set(symbol, bucket);
      const candle = { ...candleFromQuote(quote), time: bucket };
      const fired = useWorkspace.getState().applyCandle(symbol, candle, barClosed);
      for (const id of fired) {
        const alert = useWorkspace.getState().alerts.find((a) => a.id === id);
        if (alert) void notifyNative("EzyView alert", alert.message || `${alert.symbol} alert triggered`);
      }
    }
  } finally {
    busy = false;
  }
}

export function startAlertFeed(intervalMs = 5000): () => void {
  const timer = setInterval(() => void tickAlertFeed().catch(() => undefined), intervalMs);
  return () => clearInterval(timer);
}
