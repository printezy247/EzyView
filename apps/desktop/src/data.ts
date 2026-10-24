import { createLiveSources, DemoMarketAdapter } from "@ezyview/data-adapters";
import type { Candle, LiveSource, LiveSourceId, Quote, Resolution, SymbolInfo, UnsubscribeFn } from "@ezyview/data-adapters";
import { CircuitBreaker, CircuitOpenError } from "./netRetry";
import { readApiKey, useApiKeys } from "./apiKeys";
import { effectiveSource, isLiveSourceChoice } from "./chartSource";
import type { DataSourceChoice, EffectiveSource } from "./chartSource";
import { getMt5, useMt5 } from "./mt5";

/** Single shared demo adapter. The broker feed is reached via `quoteOf`/`loadHistory`. */
export const market = new DemoMarketAdapter();

/** Bar interval in epoch seconds, used to pick the history window. */
export const RESOLUTION_SECONDS: Record<Resolution, number> = {
  "1t": 60,
  "1s": 1,
  "5s": 5,
  "15s": 15,
  "30s": 30,
  "1m": 60,
  "3m": 180,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "2h": 7200,
  "4h": 14400,
  "6h": 21600,
  "8h": 28800,
  "12h": 43200,
  "1D": 86400,
  "1W": 604800,
  "1M": 2592000,
};

/** Intervals offered in the P1 interval picker. */
export const PICKER_RESOLUTIONS: Resolution[] = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"];

/** Every chartable interval, grouped the way the interval menu lists them. */
export const RESOLUTION_GROUPS: { label: string; items: Resolution[] }[] = [
  { label: "Minutes", items: ["1m", "3m", "5m", "15m", "30m"] },
  { label: "Hours", items: ["1h", "2h", "4h", "6h", "12h"] },
  { label: "Days", items: ["1D", "1W", "1M"] },
];

const UNIT_NAME: Record<string, string> = { m: "minute", h: "hour", D: "day", W: "week", M: "month" };

/** Long name for an interval, e.g. "15m" → "15 minutes", "1D" → "1 day". */
export function resolutionName(r: Resolution): string {
  const n = Number.parseInt(r, 10);
  const unit = UNIT_NAME[r.slice(String(n).length)] ?? r;
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

export const DEFAULT_SYMBOL = "OANDA:XAUUSD";

/** Display ticker: the part after the exchange prefix, e.g. "BTCUSDT". */
export const tickerOf = (symbol: string): string => symbol.split(":").pop() ?? symbol;

/**
 * Decimals that keep a price readable.
 *
 * Synchronous on purpose: taking precision from the price in hand avoids an
 * async symbol lookup whose result would arrive after the first render.
 */
export function precisionFor(price: number | null): number {
  if (price === null || !Number.isFinite(price) || price <= 0) return 2;
  if (price >= 1000) return 2;
  if (price >= 1) return 3;
  if (price >= 0.01) return 5;
  return 8;
}

/** True while the chart/ticket are reading the broker's feed. */
export const brokerFeed = (): boolean => useMt5.getState().source === "mt5";

/** The source a chart really reads from: its own choice, or the global feed switch for `auto`. */
export const resolveSource = (choice?: DataSourceChoice): EffectiveSource => effectiveSource(choice, useMt5.getState().source);

let liveSources: Record<LiveSourceId, LiveSource> | null = null;

/**
 * Binance / Kraken / Twelve Data, created once.
 *
 * The Twelve Data key comes from the keyring-backed `useApiKeys` store, with a
 * direct keyring read as the fallback while that store is still loading.
 * Detached chart windows never run the key loader, so unless their webview can
 * reach the keyring they see no key and Twelve Data stays unavailable there.
 */
export function getLiveSources(): Record<LiveSourceId, LiveSource> {
  liveSources ??= createLiveSources({
    getKey: async (name) => {
      if (name !== "twelvedata") return null;
      return useApiKeys.getState().keys.twelvedata || (await readApiKey(name));
    },
  });
  return liveSources;
}

/**
 * Subscribe to pushed quotes (WebSocket, with the adapter's own polling
 * fallback) for a live source. Resolves to null for sources that have no push
 * feed (demo, MT5), so the caller keeps polling `quoteOf`.
 */
export async function subscribeLive(
  symbol: string,
  source: EffectiveSource,
  onQuote: (quote: Quote) => void,
): Promise<UnsubscribeFn | null> {
  if (!isLiveSourceChoice(source)) return null;
  return getLiveSources()[source].subscribe([symbol], onQuote);
}

/** Map common EzyView tickers to Binance public market data symbols (PAXGUSDT = 1 troy oz spot Gold). */
const PUBLIC_PAIR_MAP: Record<string, string> = {
  XAUUSD: "PAXGUSDT",
  BTCUSDT: "BTCUSDT",
  ETHUSDT: "ETHUSDT",
  SOLUSDT: "SOLUSDT",
  EURUSD: "EURUSDT",
  GBPUSD: "GBPUSDT",
};

const BINANCE_INTERVAL_MAP: Partial<Record<Resolution, string>> = {
  "1s": "1s",
  "1m": "1m",
  "3m": "3m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "2h": "2h",
  "4h": "4h",
  "6h": "6h",
  "8h": "8h",
  "12h": "12h",
  "1D": "1d",
  "1W": "1w",
  "1M": "1M",
};

const isTestEnv = (): boolean =>
  typeof process !== "undefined" && Boolean(process.env?.VITEST || process.env?.NODE_ENV === "test");

const liveQuoteCache = new Map<string, { quote: Quote; fetchedAt: number }>();
const livePublicTickers = new Set<string>();

/**
 * One circuit breaker for the public Binance feed. When it is down we stop
 * paying its multi-second timeout on every quote poll and fall straight back
 * to the demo adapter until the cooldown elapses and one probe succeeds.
 */
const publicBreaker = new CircuitBreaker({ threshold: 3, cooldownMs: 15_000 });

/** True when `symbol` has received a real live market quote from the public feed. */
export function isLivePublicSymbol(symbol: string): boolean {
  return livePublicTickers.has(tickerOf(symbol).toUpperCase());
}

async function fetchPublicQuote(symbol: string): Promise<Quote | null> {
  if (isTestEnv() || typeof fetch !== "function") return null;
  // Fast-fail while the public feed is known down.
  try {
    publicBreaker.before();
  } catch (err) {
    if (err instanceof CircuitOpenError) return null;
    throw err;
  }
  const ticker = tickerOf(symbol).toUpperCase();
  const pair = PUBLIC_PAIR_MAP[ticker];
  if (!pair) return null;

  const nowMs = Date.now();
  const cached = liveQuoteCache.get(ticker);
  if (cached && nowMs - cached.fetchedAt < 1500) {
    return { ...cached.quote, symbol };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3500);
  try {
    const res = await fetch(`https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${pair}`, {
      signal: ctrl.signal,
    });
    if (!res.ok) {
      publicBreaker.recordFailure();
      return null;
    }
    publicBreaker.recordSuccess();
    const data = (await res.json()) as {
      lastPrice?: string;
      priceChange?: string;
      priceChangePercent?: string;
      closeTime?: number;
    };
    const last = Number(data.lastPrice);
    if (!Number.isFinite(last) || last <= 0) return null;
    const change = Number(data.priceChange ?? 0);
    const changePercent = Number(data.priceChangePercent ?? 0);
    const quote: Quote = {
      symbol,
      last,
      change: Number.isFinite(change) ? change : 0,
      changePercent: Number.isFinite(changePercent) ? changePercent : 0,
      time: Math.floor((data.closeTime ?? nowMs) / 1000),
    };
    liveQuoteCache.set(ticker, { quote, fetchedAt: nowMs });
    livePublicTickers.add(ticker);
    return quote;
  } catch {
    publicBreaker.recordFailure();
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPublicHistory(symbol: string, resolution: Resolution, limit: number): Promise<Candle[] | null> {
  if (isTestEnv() || typeof fetch !== "function") return null;
  try {
    publicBreaker.before();
  } catch (err) {
    if (err instanceof CircuitOpenError) return null;
    throw err;
  }
  const ticker = tickerOf(symbol).toUpperCase();
  const pair = PUBLIC_PAIR_MAP[ticker];
  const interval = BINANCE_INTERVAL_MAP[resolution] ?? "15m";
  if (!pair) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4500);
  try {
    const clamped = Math.max(10, Math.min(1000, limit));
    const res = await fetch(
      `https://data-api.binance.vision/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${clamped}`,
      { signal: ctrl.signal },
    );
    if (!res.ok) {
      publicBreaker.recordFailure();
      return null;
    }
    publicBreaker.recordSuccess();
    const raw = (await res.json()) as unknown[];
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const candles: Candle[] = [];
    for (const row of raw) {
      if (!Array.isArray(row) || row.length < 6) continue;
      const time = Math.floor(Number(row[0]) / 1000);
      const open = Number(row[1]);
      const high = Number(row[2]);
      const low = Number(row[3]);
      const close = Number(row[4]);
      const volume = Number(row[5]);
      if (
        Number.isFinite(time) &&
        Number.isFinite(open) &&
        Number.isFinite(high) &&
        Number.isFinite(low) &&
        Number.isFinite(close)
      ) {
        candles.push({ time, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 });
      }
    }
    if (candles.length === 0) return null;
    livePublicTickers.add(ticker);
    const newest = candles[candles.length - 1]!;
    const first = candles[0]!;
    if (!liveQuoteCache.has(ticker)) {
      liveQuoteCache.set(ticker, {
        fetchedAt: Date.now(),
        quote: {
          symbol,
          last: newest.close,
          change: newest.close - first.open,
          changePercent: first.open > 0 ? ((newest.close - first.open) / first.open) * 100 : 0,
          time: Math.floor(Date.now() / 1000),
        },
      });
    }
    return candles;
  } catch {
    publicBreaker.recordFailure();
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function searchSymbols(query: string): Promise<SymbolInfo[]> {
  if (brokerFeed()) return getMt5().data.searchSymbols(query);
  return market.searchSymbols(query);
}

/** Symbol search against one specific feed, regardless of the global switch. */
export async function searchSymbolsForSource(query: string, source: EffectiveSource): Promise<SymbolInfo[]> {
  if (source === "mt5") return getMt5().data.searchSymbols(query);
  if (isLiveSourceChoice(source)) return getLiveSources()[source].searchSymbols(query);
  return market.searchSymbols(query);
}

/** One quote, from whichever feed the chart is on. */
/**
 * Demo ticker leases.
 *
 * The demo feed only moves while it is subscribed to, and each subscription is
 * a 1 Hz timer — so a ticker lives exactly as long as something references the
 * symbol: the symbol's quote poller holds one lease, a chart/panel subscribes
 * to the poller, and the last unsubscribe releases the lease. Symbols nobody
 * references never open a timer, and leavers stop theirs instead of leaking
 * one per symbol ever quoted.
 */
const tickerRefs = new Map<string, number>();
/** Unsubscribers for those ticks, so a ticker can be stopped again. */
const unsubscribes = new Map<string, () => void>();
/** Symbols with a subscription that is live or still connecting: the cap counts these, synchronously. */
const tickerSlots = new Set<string>();
/** Hard cap on demo subscriptions; a quote still resolves, it just stops ticking. */
export const MAX_DEMO_TICKERS = 24;

/** How many demo symbols hold a live subscription right now (test hook). */
export function demoTickerCount(): number {
  return unsubscribes.size;
}

function stopTicker(symbol: string): void {
  const unsubscribe = unsubscribes.get(symbol);
  unsubscribes.delete(symbol);
  tickerSlots.delete(symbol);
  try {
    unsubscribe?.();
  } catch {
    // ignore — already stopped
  }
}

function startTicker(symbol: string): void {
  if (tickerSlots.has(symbol) || tickerSlots.size >= MAX_DEMO_TICKERS) return;
  // Reserve the slot synchronously so a burst of retentions cannot race past
  // the cap before any subscribe settles.
  tickerSlots.add(symbol);
  void market
    .subscribe([symbol], () => {})
    .then((unsubscribe) => {
      // The lease may have been released while subscribing.
      if (!tickerRefs.has(symbol)) {
        tickerSlots.delete(symbol);
        unsubscribe();
        return;
      }
      unsubscribes.set(symbol, unsubscribe);
    })
    .catch(() => {
      tickerSlots.delete(symbol);
      tickerRefs.delete(symbol);
    });
}

/** Hold a demo ticker for `symbol`; returns its release function. */
export function retainTicker(symbol: string): () => void {
  tickerRefs.set(symbol, (tickerRefs.get(symbol) ?? 0) + 1);
  startTicker(symbol);
  return () => releaseTicker(symbol);
}

/** Drop one reference; the ticker stops with the last one. */
export function releaseTicker(symbol: string): void {
  const count = (tickerRefs.get(symbol) ?? 0) - 1;
  if (count <= 0) {
    tickerRefs.delete(symbol);
    stopTicker(symbol);
  } else {
    tickerRefs.set(symbol, count);
  }
}

/** Force-stop a demo ticker, ignoring references (watchlist row removal). */
export function stopTicking(symbol: string): void {
  tickerRefs.delete(symbol);
  stopTicker(symbol);
}

const inFlightQuotes = new Map<string, Promise<Quote | null>>();
const inFlightHistory = new Map<string, Promise<Candle[]>>();

export async function quoteOf(symbol: string, source?: DataSourceChoice): Promise<Quote | null> {
  const feed = resolveSource(source);
  const flightKey = `${feed}:${symbol}`;
  const existing = inFlightQuotes.get(flightKey);
  if (existing) return existing;

  const promise = (async () => {
    try {
      if (isLiveSourceChoice(feed)) return await getLiveSources()[feed].getQuote(symbol);
      if (feed === "mt5") return await getMt5().data.getQuote(symbol);
      const live = await fetchPublicQuote(symbol);
      if (live) return live;
      return await market.getQuote(symbol);
    } catch {
      // A provider outage is a stale price, not an unhandled rejection in
      // every panel that polls it.
      return null;
    } finally {
      inFlightQuotes.delete(flightKey);
    }
  })();

  inFlightQuotes.set(flightKey, promise);
  return promise;
}

/**
 * `quoteOf` with `() => null` on failure. Panels that only want a price use
 * this: a provider outage must not escalate to an unhandled rejection in the
 * caller's event chain.
 */
export async function safeQuote(symbol: string, source?: DataSourceChoice): Promise<Quote | null> {
  try {
    return await quoteOf(symbol, source);
  } catch {
    return null;
  }
}

/**
 * A short-lived cache of resolved histories.
 *
 * The chart and the replay bar both ask for the same series, and switching
 * away and back used to re-download it. A bar only changes when it closes,
 * so a short TTL is safe.
 */
const historyCache = new Map<string, { at: number; candles: Candle[] }>();
const HISTORY_TTL_MS = 15_000;

export async function loadHistory(
  symbol: string,
  resolution: Resolution,
  limit = 500,
  source?: DataSourceChoice,
): Promise<Candle[]> {
  const feed = resolveSource(source);
  const key = `${feed}:${symbol}:${resolution}:${limit}`;
  const existing = inFlightHistory.get(key);
  if (existing) return existing;
  const cached = historyCache.get(key);
  if (cached && Date.now() - cached.at < HISTORY_TTL_MS) return cached.candles;

  const promise = (async () => {
    try {
      const step = RESOLUTION_SECONDS[resolution];
      const now = Math.floor(Date.now() / 1000);
      // Snap the window to the bar grid so the newest candle is always complete.
      const to = Math.floor(now / step) * step;
      const request = { symbol, resolution, from: to - step * limit, to, limit };
      if (isLiveSourceChoice(feed)) return await getLiveSources()[feed].getHistory(request);
      if (feed === "mt5") return await getMt5().data.getHistory(request);
      const live = await fetchPublicHistory(symbol, resolution, limit);
      if (live && live.length > 0) {
        historyCache.set(key, { at: Date.now(), candles: live });
        return live;
      }
      const demo = await market.getHistory(request);
      historyCache.set(key, { at: Date.now(), candles: demo });
      return demo;
    } finally {
      inFlightHistory.delete(key);
    }
  })();

  inFlightHistory.set(key, promise);
  return promise;
}

/** `loadHistory` with `[]` on failure, for the same reason as `safeQuote`. */
export async function safeHistory(
  symbol: string,
  resolution: Resolution,
  limit = 500,
  source?: DataSourceChoice,
): Promise<Candle[]> {
  try {
    return await loadHistory(symbol, resolution, limit, source);
  } catch {
    return [];
  }
}
