/**
 * Live alert evaluation. Nothing fed quotes into the store's `applyCandle`
 * before Phase 9, so price alerts never fired at runtime. This polls the
 * active feed (demo or MT5, via `quoteOf`) for symbols that still have a live
 * alert, evaluates each quote as an in-progress bar, and raises a native
 * notification for every alert that just fired.
 *
 * Limit: quotes arrive every few seconds, so bar-count conditions
 * (moving_up/down, channel exits) count polls, not chart bars.
 */
import type { PriceAlert, Quote } from "@ezyview/data-adapters";
import { quoteOf } from "./data";
import { notifyNative } from "./shell";
import { useWorkspace } from "./store";

/** Alerts that can still fire: armed ones, and triggered ones that re-arm per bar. */
export function liveAlerts(alerts: readonly PriceAlert[]): PriceAlert[] {
  return alerts.filter((a) => a.state === "armed" || a.frequency !== "once");
}

export const alertSymbols = (alerts: readonly PriceAlert[]): string[] => [...new Set(liveAlerts(alerts).map((a) => a.symbol))];

/** A flat bar at the quote's last price, enough for crossing/threshold conditions. */
export function candleFromQuote(q: Quote) {
  return { time: q.time, open: q.last, high: q.last, low: q.last, close: q.last, volume: 0 };
}

let busy = false;

async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const symbols = alertSymbols(useWorkspace.getState().alerts);
    const quotes = await Promise.all(symbols.map((s) => quoteOf(s).catch(() => null)));
    for (const [i, symbol] of symbols.entries()) {
      const quote = quotes[i];
      if (!quote) continue;
      const fired = useWorkspace.getState().applyCandle(symbol, candleFromQuote(quote), false);
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
  const timer = setInterval(() => void tick(), intervalMs);
  return () => clearInterval(timer);
}
