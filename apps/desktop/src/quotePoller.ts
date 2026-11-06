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
import { resolveSource, retainTicker, quoteOf } from "./data";
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
  /** When `lastQuote` last arrived (ms), for stale-price checks. */
  lastAt: number;
}

const pollers = new Map<string, Poller>();
/** Live demo tickers move only while referenced; the poller holds the lease. */
const tickerReleases = new Map<string, () => void>();
/**
 * Demo anchor per poller key: the synthetic history's last close is a
 * resolution-specific random walk, so the first live tick is offset onto it
 * once here instead of once per chart, header and watchlist row. A history
 * reload re-registers the base and the next tick recomputes the offset.
 */
const demoAnchors = new Map<string, { base: number; offset: number | null }>();
/** Live pushes that arrived with no subscriber yet; seed late panels. */
const pushedQuotes = new Map<string, { quote: Quote; at: number }>();
const PUSHED_TTL_MS = 60_000;

/** A chart registers its loaded history's last close; demo ticks anchor to it. */
export function setDemoAnchorBase(symbol: string, baseClose: number, source?: DataSourceChoice): void {
  demoAnchors.set(keyOf(symbol, source), { base: baseClose, offset: null });
}

function anchoredQuote(key: string, quote: Quote | null): Quote | null {
  if (!quote) return quote;
  const poller = pollers.get(key);
  if (resolveSource(poller?.source) !== "demo") return quote;
  const anchor = demoAnchors.get(key);
  if (!anchor) return quote;
  anchor.offset ??= anchor.base - quote.last;
  const offset = anchor.offset;
  if (offset === 0) return quote;
  return { ...quote, last: quote.last + offset };
}
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

function deliver(poller: Poller, quote: Quote | null, force: boolean): void {
  poller.lastQuote = quote;
  const now = Date.now();
  if (quote) poller.lastAt = now;
  for (const subscriber of poller.subscribers) {
    // Each panel keeps its own cadence even though one request served them all.
    // A pushed live tick jumps the queue: it is the price the chart just
    // folded in, so the header and watchlist must show it, not last poll's.
    if (!force && now - subscriber.lastDelivered < subscriber.intervalMs - 5) continue;
    subscriber.lastDelivered = now;
    subscriber.listener(quote);
  }
}

async function poll(poller: Poller): Promise<void> {
  if (poller.inFlight || poller.subscribers.size === 0) return;
  poller.inFlight = true;
  try {
    const quote = await quoteOf(poller.symbol, poller.source);
    deliver(poller, anchoredQuote(poller.key, quote), false);
  } catch {
    // `quoteOf` resolves failures to null; this is only for a listener throwing.
  } finally {
    poller.inFlight = false;
  }
}

/**
 * Feed one externally received quote into the shared stream: a WebSocket tick
 * the chart just folded into its bars, so panels on the same symbol read the
 * same price instead of waiting for their next poll. Unknown keys are kept
 * briefly so a panel that opens a moment later still seeds from it.
 */
export function pushQuote(symbol: string, quote: Quote, source?: DataSourceChoice): void {
  const key = keyOf(symbol, source);
  const now = Date.now();
  for (const [k, pushed] of pushedQuotes) {
    if (now - pushed.at > PUSHED_TTL_MS) pushedQuotes.delete(k);
  }
  pushedQuotes.set(key, { quote, at: now });
  const poller = pollers.get(key);
  if (poller) deliver(poller, anchoredQuote(key, quote), true);
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
      lastAt: 0,
    };
    pollers.set(key, poller);
    // Keep the demo feed moving while any panel polls this symbol, and stop it
    // with the last subscriber instead of leaving a 1 Hz timer behind.
    tickerReleases.set(
      key,
      (() => {
        const release = retainTicker(symbol);
        return () => {
          release();
          tickerReleases.delete(key);
        };
      })(),
    );
  }

  const subscriber: Subscriber = { listener, intervalMs, lastDelivered: 0 };
  poller.subscribers.add(subscriber);

  // A new panel shows the last known price immediately instead of an empty cell.
  if (!poller.lastQuote) {
    const pushed = pushedQuotes.get(key);
    if (pushed && Date.now() - pushed.at <= PUSHED_TTL_MS) poller.lastQuote = pushed.quote;
  }
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
    tickerReleases.get(key)?.();
    pollers.delete(key);
  };
}

/**
 * Seconds since a price last arrived for this symbol, or null when nobody is
 * watching it (so there is no evidence either way). Order checks use it to
 * refuse a trade on a frozen price.
 */
export function quoteAgeSec(symbol: string, source?: DataSourceChoice): number | null {
  const poller = pollers.get(keyOf(symbol, source));
  if (!poller || poller.lastAt === 0) return null;
  return (Date.now() - poller.lastAt) / 1000;
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

/** Test hook: drop every subscription, timer and ticker lease. */
export function resetQuotePoller(): void {
  for (const poller of pollers.values()) stopTimer(poller);
  pollers.clear();
  for (const release of tickerReleases.values()) release();
  tickerReleases.clear();
  demoAnchors.clear();
  pushedQuotes.clear();
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
