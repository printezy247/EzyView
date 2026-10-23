/**
 * One quote poller per symbol and source.
 *
 * The chart legend, quote header, order ticket, tape, trade page and watchlist
 * each used to run their own interval for the same symbol: a 9-cell grid asked
 * the provider nine times a tick. Subscribers now share a single timer at the
 * fastest cadence anyone asked for, and each listener is still delivered at its
 * own cadence. Timers stop with the last subscriber, and pause while the window
 * is hidden.
 */
import { useEffect, useState } from "react";
import type { Quote } from "@ezyview/data-adapters";
import { quoteOf } from "./data";
import type { DataSourceChoice } from "./chartSource";

export const MIN_INTERVAL_MS = 250;

type Listener = (quote: Quote | null) => void;

interface Subscriber {
  listener: Listener;
  intervalMs: number;
  lastDelivered: number;
}

interface Poller {
  key: string;
  symbol: string;
  source?: DataSourceChoice;
  subscribers: Set<Subscriber>;
  timer: ReturnType<typeof setInterval> | null;
  timerMs: number;
  inFlight: boolean;
  lastQuote: Quote | null;
}

const pollers = new Map<string, Poller>();
let hidden = typeof document !== "undefined" && document.hidden;

const keyOf = (symbol: string, source?: DataSourceChoice): string => `${source ?? "auto"}:${symbol}`;

const cadenceOf = (poller: Poller): number =>
  Math.max(MIN_INTERVAL_MS, Math.min(...[...poller.subscribers].map((s) => s.intervalMs)));

function stopTimer(poller: Poller): void {
  if (poller.timer !== null) clearInterval(poller.timer);
  poller.timer = null;
}

function schedule(poller: Poller): void {
  const ms = cadenceOf(poller);
  if (poller.timer !== null && poller.timerMs === ms) return;
  stopTimer(poller);
  poller.timerMs = ms;
  poller.timer = setInterval(() => void poll(poller), ms);
}

async function poll(poller: Poller): Promise<void> {
  if (poller.inFlight || poller.subscribers.size === 0) return;
  poller.inFlight = true;
  try {
    const quote = await quoteOf(poller.symbol, poller.source);
    poller.lastQuote = quote;
    const now = Date.now();
    for (const subscriber of poller.subscribers) {
      // Each panel keeps its own cadence even though one request served them all.
      if (now - subscriber.lastDelivered < subscriber.intervalMs - 5) continue;
      subscriber.lastDelivered = now;
      subscriber.listener(quote);
    }
  } catch {
    // `quoteOf` resolves failures to null; this is only for a listener throwing.
  } finally {
    poller.inFlight = false;
  }
}

/** Subscribe to one symbol's quote. Returns the unsubscribe function. */
export function subscribeQuote(
  symbol: string,
  listener: Listener,
  options: { source?: DataSourceChoice; intervalMs?: number } = {},
): () => void {
  const intervalMs = Math.max(MIN_INTERVAL_MS, options.intervalMs ?? 1000);
  const key = keyOf(symbol, options.source);
  let poller = pollers.get(key);
  if (!poller) {
    poller = {
      key,
      symbol,
      source: options.source,
      subscribers: new Set(),
      timer: null,
      timerMs: 0,
      inFlight: false,
      lastQuote: null,
    };
    pollers.set(key, poller);
  }

  const subscriber: Subscriber = { listener, intervalMs, lastDelivered: 0 };
  poller.subscribers.add(subscriber);

  // A new panel shows the last known price immediately instead of an empty cell.
  if (poller.lastQuote) listener(poller.lastQuote);
  schedule(poller);
  if (!hidden) void poll(poller);

  return () => {
    poller!.subscribers.delete(subscriber);
    if (poller!.subscribers.size > 0) {
      schedule(poller!);
      return;
    }
    stopTimer(poller!);
    pollers.delete(key);
  };
}

/** Ask every subscriber of a symbol to refresh now (the retry button). */
export function refreshQuote(symbol: string, source?: DataSourceChoice): void {
  const poller = pollers.get(keyOf(symbol, source));
  if (poller) void poll(poller);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    hidden = document.hidden;
    for (const poller of pollers.values()) {
      if (hidden) {
        stopTimer(poller);
      } else {
        schedule(poller);
        void poll(poller);
      }
    }
  });
}

/** Test hook: drop every subscription and timer. */
export function resetQuotePoller(): void {
  for (const poller of pollers.values()) stopTimer(poller);
  pollers.clear();
}

export interface QuoteState {
  quote: Quote | null;
  status: "loading" | "ready" | "failed";
  refresh: () => void;
}

/**
 * React binding over `subscribeQuote`.
 *
 * `status` distinguishes "no quote yet" from "the provider answered with
 * nothing" so a panel can offer Retry instead of an endless spinner.
 */
export function useQuote(
  symbol: string,
  options: { source?: DataSourceChoice; intervalMs?: number; enabled?: boolean } = {},
): QuoteState {
  const { source, intervalMs = 1000, enabled = true } = options;
  const [quote, setQuote] = useState<Quote | null>(null);
  const [status, setStatus] = useState<QuoteState["status"]>("loading");
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    setQuote(null);
    setStatus("loading");
    if (!enabled) return;
    return subscribeQuote(
      symbol,
      (next) => {
        setQuote(next);
        setStatus(next ? "ready" : "failed");
      },
      { source, intervalMs },
    );
  }, [symbol, source, intervalMs, enabled, generation]);

  return {
    quote,
    status,
    refresh: () => {
      refreshQuote(symbol, source);
      setGeneration((n) => n + 1);
    },
  };
}
