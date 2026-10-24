/**
 * Extra live price sources: Binance and Kraken (public, no key) and Twelve Data
 * (forex / gold, free API key). Each is a MarketDataAdapter with WebSocket
 * streaming and an automatic polling fallback. fetch / WebSocket / key lookup
 * are injected so tests run with fakes and no network.
 *
 * Rules: nothing here throws out of getQuote / getHistory (null / [] instead),
 * every number is checked with Number.isFinite and price > 0, every fetch is
 * aborted after FETCH_TIMEOUT_MS, and the Twelve Data key never appears in
 * errors or logs (all failures are swallowed without their message).
 */
import type {
  AssetClass,
  Candle,
  HistoricalRequest,
  MarketDataAdapter,
  Quote,
  Resolution,
  SubscribeHandler,
  SymbolInfo,
  UnsubscribeFn,
} from "./types.js";

export type LiveSourceId = "binance" | "kraken" | "twelvedata";

export interface LiveSource extends MarketDataAdapter {
  id: LiveSourceId;
  label: string;
  needsKey: boolean;
  supports(symbol: string): boolean;
}

export interface LiveSourceDeps {
  fetch?: typeof fetch;
  WebSocket?: typeof WebSocket;
  getKey?: (name: string) => Promise<string | null>;
  now?: () => number;
}

export const LIVE_SOURCE_IDS: readonly LiveSourceId[] = ["binance", "kraken", "twelvedata"];

const FETCH_TIMEOUT_MS = 4000;
const MAX_BACKOFF_MS = 30_000;
const POLL_MS = 1000;
const TWELVE_POLL_MS = 8000;
const TWELVE_HEARTBEAT_MS = 10_000;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** "BINANCE:BTCUSDT" -> "BTCUSDT" (text after the last colon, upper-cased). */
const tickerOf = (symbol: string): string => symbol.slice(symbol.lastIndexOf(":") + 1).trim().toUpperCase();

/** Parse a number or numeric string; null unless finite. */
const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const toPrice = (v: unknown): number | null => {
  const n = toNum(v);
  return n !== null && n > 0 ? n : null;
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Kraken's ticker fields wrap the value in a one-element array. */
const firstOf = (v: unknown): unknown => (Array.isArray(v) ? v[0] : undefined);

/** Build a candle only when every field is valid. */
function makeCandle(time: unknown, o: unknown, h: unknown, l: unknown, c: unknown, v: unknown): Candle | null {
  const t = toNum(time);
  const open = toPrice(o);
  const high = toPrice(h);
  const low = toPrice(l);
  const close = toPrice(c);
  if (t === null || open === null || high === null || low === null || close === null) return null;
  return { time: t, open, high, low, close, volume: toNum(v) ?? 0 };
}

const finishCandles = (list: Candle[], req: HistoricalRequest): Candle[] => {
  const out = list.filter((c) => c.time >= req.from && c.time <= req.to).sort((a, b) => a.time - b.time);
  return req.limit && req.limit > 0 && out.length > req.limit ? out.slice(out.length - req.limit) : out;
};

interface Ctx {
  getJson(url: string): Promise<unknown | null>;
  nowSec(): number;
  deps: LiveSourceDeps;
}

function makeCtx(deps: LiveSourceDeps): Ctx {
  const f: typeof fetch = deps.fetch ?? ((...a) => globalThis.fetch(...a));
  const now = deps.now ?? (() => Date.now());
  return {
    deps,
    nowSec: () => Math.floor(now() / 1000),
    async getJson(url) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await f(url, { signal: ac.signal });
        if (!res.ok) return null;
        return (await res.json()) as unknown;
      } catch {
        return null; // never surface the message: the URL may hold an API key
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// streaming with reconnect + polling fallback
// ---------------------------------------------------------------------------

interface StreamPlan {
  url: string;
  /** Send subscribe frames etc. */
  onOpen?: (ws: WebSocket) => void;
  /** Price from a raw frame; null = ignore frame; "fail" = give up this socket. */
  parse: (raw: string) => number | null | "fail";
  heartbeat?: { ms: number; msg: string };
  /** Consecutive failed sockets before switching to polling. */
  maxFails: number;
  pollMs: number;
}

function startStream(
  ctx: Ctx,
  plan: StreamPlan,
  symbol: string,
  getQuote: () => Promise<Quote | null>,
  emit: SubscribeHandler,
): UnsubscribeFn {
  const WS = ctx.deps.WebSocket ?? (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
  let closed = false;
  let fails = 0;
  let sock: WebSocket | null = null;
  let sockListeners: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let hbTimer: ReturnType<typeof setInterval> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const stopHb = () => {
    if (hbTimer) clearInterval(hbTimer);
    hbTimer = null;
  };

  const startPolling = () => {
    if (pollTimer || closed) return;
    let busy = false;
    const tick = async () => {
      if (busy || closed) return;
      busy = true;
      try {
        const q = await getQuote();
        if (q && !closed) emit(q);
      } catch {
        /* keep polling */
      } finally {
        busy = false;
      }
    };
    void tick();
    pollTimer = setInterval(() => void tick(), plan.pollMs);
  };

  /** Count a failure, then retry with backoff (1s, 2s, 4s ... max 30s) or poll. */
  const onFail = () => {
    if (closed) return;
    fails += 1;
    if (fails >= plan.maxFails || !WS) {
      startPolling();
      return;
    }
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (fails - 1));
    retryTimer = setTimeout(connect, delay);
  };

  function connect(): void {
    retryTimer = null;
    if (closed) return;
    if (!WS) {
      startPolling();
      return;
    }
    let ws: WebSocket;
    try {
      ws = new WS(plan.url);
    } catch {
      onFail();
      return;
    }
    sock = ws;
    let dead = false;
    const die = () => {
      if (dead) return;
      dead = true;
      stopHb();
      try {
        ws.close();
      } catch {
        /* already closed */
      }
      onFail();
    };
    // Listeners carry an AbortSignal so teardown removes every handler without
    // keeping a parallel list of function references.
    const listeners = new AbortController();
    ws.addEventListener(
      "open",
      () => {
        try {
          plan.onOpen?.(ws);
        } catch {
          die();
          return;
        }
        if (plan.heartbeat) {
          const { ms, msg } = plan.heartbeat;
          hbTimer = setInterval(() => {
            try {
              ws.send(msg);
            } catch {
              /* close handler will follow */
            }
          }, ms);
        }
      },
      { signal: listeners.signal },
    );
    ws.addEventListener(
      "message",
      (ev) => {
        if (dead) return;
        const data = (ev as MessageEvent).data;
        const r = plan.parse(typeof data === "string" ? data : String(data));
        if (r === "fail") return die();
        if (r === null) return;
        fails = 0;
        emit({ symbol, last: r, time: ctx.nowSec() });
      },
      { signal: listeners.signal },
    );
    ws.addEventListener("error", die, { signal: listeners.signal });
    ws.addEventListener("close", die, { signal: listeners.signal });
    sockListeners = listeners;
  }

  connect();

  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (pollTimer) clearInterval(pollTimer);
    stopHb();
    if (sock) {
      const s = sock;
      sock = null;
      sockListeners?.abort();
      sockListeners = null;
      try {
        s.close();
      } catch {
        /* ignore */
      }
    }
  };
}

// ---------------------------------------------------------------------------
// generic source builder
// ---------------------------------------------------------------------------

interface SourceConfig {
  id: LiveSourceId;
  label: string;
  needsKey: boolean;
  assetClass: AssetClass;
  pollMs: number;
  /** Ticker (no exchange prefix) -> true when this source can serve it. */
  supports(ticker: string): boolean;
  /** Sample tickers for searchSymbols. */
  catalog: { ticker: string; description: string }[];
  precision(ticker: string): number;
  ping(ctx: Ctx): Promise<boolean>;
  history(ctx: Ctx, ticker: string, req: HistoricalRequest): Promise<Candle[]>;
  quote(ctx: Ctx, ticker: string): Promise<Omit<Quote, "symbol"> | null>;
  /** null = cannot stream (no-op subscription). */
  plan(ctx: Ctx, ticker: string): Promise<StreamPlan | null>;
  /** Poll when there is no way to stream at all (e.g. key missing => no-op instead). */
}

function buildSource(cfg: SourceConfig, deps: LiveSourceDeps): LiveSource {
  const ctx = makeCtx(deps);

  const info = (ticker: string, symbol: string, description: string): SymbolInfo => {
    const precision = cfg.precision(ticker);
    return {
      symbol,
      ticker,
      description,
      provider: cfg.id,
      assetClass: cfg.assetClass,
      precision,
      tickSize: 10 ** -precision,
    };
  };

  const getQuote = async (symbol: string): Promise<Quote | null> => {
    try {
      const ticker = tickerOf(symbol);
      if (!cfg.supports(ticker)) return null;
      const q = await cfg.quote(ctx, ticker);
      return q ? { ...q, symbol } : null;
    } catch {
      return null;
    }
  };

  return {
    id: cfg.id,
    label: cfg.label,
    needsKey: cfg.needsKey,
    assetClasses: [cfg.assetClass],
    supports: (symbol) => cfg.supports(tickerOf(symbol)),

    async ping() {
      try {
        return await cfg.ping(ctx);
      } catch {
        return false;
      }
    },

    async searchSymbols(query, assetClass) {
      if (assetClass && assetClass !== cfg.assetClass) return [];
      const q = query.trim().toUpperCase().replace(/[/:]/g, "");
      return cfg.catalog
        .filter((c) => !q || c.ticker.includes(q) || c.description.toUpperCase().startsWith(q))
        .map((c) => info(c.ticker, c.ticker, c.description));
    },

    async getSymbol(symbol) {
      const ticker = tickerOf(symbol);
      return cfg.supports(ticker) ? info(ticker, symbol, ticker) : null;
    },

    async getHistory(req) {
      try {
        const ticker = tickerOf(req.symbol);
        if (!cfg.supports(ticker)) return [];
        return finishCandles(await cfg.history(ctx, ticker, req), req);
      } catch {
        return [];
      }
    },

    getQuote,

    async subscribe(symbols, onQuote) {
      const stops: UnsubscribeFn[] = [];
      let stopped = false;
      // Plans are independent requests; resolving them together avoids a
      // serial round-trip per symbol when a layout subscribes to a basket.
      const planned = await Promise.all(
        symbols.map(async (symbol) => {
          const ticker = tickerOf(symbol);
          if (!cfg.supports(ticker)) return null;
          try {
            const plan = await cfg.plan(ctx, ticker);
            return plan ? { symbol, plan } : null;
          } catch {
            return null;
          }
        }),
      );
      if (stopped) return () => {};
      for (const item of planned) {
        if (item) stops.push(startStream(ctx, item.plan, item.symbol, () => getQuote(item.symbol), onQuote));
      }
      return () => {
        stopped = true;
        for (const s of stops.splice(0)) s();
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Binance (public market data mirror, no key)
// ---------------------------------------------------------------------------

const BINANCE_REST = "https://data-api.binance.vision";
const BINANCE_WS = "wss://stream.binance.vision/ws";

const BINANCE_INTERVAL: Partial<Record<Resolution, string>> = {
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

const binanceConfig: SourceConfig = {
  id: "binance",
  label: "Binance",
  needsKey: false,
  assetClass: "crypto",
  pollMs: POLL_MS,
  supports: (t) => /^[A-Z0-9]{2,15}USDT$/.test(t),
  catalog: [
    { ticker: "BTCUSDT", description: "Bitcoin / TetherUS" },
    { ticker: "ETHUSDT", description: "Ethereum / TetherUS" },
    { ticker: "SOLUSDT", description: "Solana / TetherUS" },
    { ticker: "BNBUSDT", description: "BNB / TetherUS" },
    { ticker: "XRPUSDT", description: "XRP / TetherUS" },
    { ticker: "DOGEUSDT", description: "Dogecoin / TetherUS" },
  ],
  precision: () => 2,
  ping: async (ctx) => (await ctx.getJson(`${BINANCE_REST}/api/v3/ping`)) !== null,

  async history(ctx, ticker, req) {
    const interval = BINANCE_INTERVAL[req.resolution];
    if (!interval) return [];
    const limit = Math.max(1, Math.min(req.limit ?? 1000, 1000));
    // endTime + limit returns the latest `limit` bars up to `to` (what a chart wants).
    const url = `${BINANCE_REST}/api/v3/klines?symbol=${ticker}&interval=${interval}&endTime=${Math.floor(req.to * 1000)}&limit=${limit}`;
    const rows = await ctx.getJson(url);
    if (!Array.isArray(rows)) return [];
    const out: Candle[] = [];
    for (const r of rows) {
      if (!Array.isArray(r)) continue;
      const t = toNum(r[0]);
      const c = t === null ? null : makeCandle(Math.floor(t / 1000), r[1], r[2], r[3], r[4], r[5]);
      if (c) out.push(c);
    }
    return out;
  },

  async quote(ctx, ticker) {
    const j = await ctx.getJson(`${BINANCE_REST}/api/v3/ticker/24hr?symbol=${ticker}`);
    if (!isRecord(j)) return null;
    const last = toPrice(j.lastPrice);
    if (last === null) return null;
    const q: Omit<Quote, "symbol"> = { last, time: ctx.nowSec() };
    const change = toNum(j.priceChange);
    const pct = toNum(j.priceChangePercent);
    const bid = toPrice(j.bidPrice);
    const ask = toPrice(j.askPrice);
    const vol = toNum(j.volume);
    if (change !== null) q.change = change;
    if (pct !== null) q.changePercent = pct;
    if (bid !== null) q.bid = bid;
    if (ask !== null) q.ask = ask;
    if (vol !== null) q.volume24h = vol;
    return q;
  },

  /**
   * Live price = the last trade price from <pair>@trade (the "last" the 24h
   * ticker reports), not the best bid. Trade frames: {"e":"trade","p":"price"}.
   */
  async plan(_ctx, ticker) {
    return {
      url: `${BINANCE_WS}/${ticker.toLowerCase()}@trade`,
      maxFails: 3,
      pollMs: POLL_MS,
      parse(raw) {
        try {
          const m: unknown = JSON.parse(raw);
          if (!isRecord(m)) return null;
          return m.e === "trade" ? toPrice(m.p) : null;
        } catch {
          return null;
        }
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Kraken (public, no key)
// ---------------------------------------------------------------------------

const KRAKEN_REST = "https://api.kraken.com/0/public";
const KRAKEN_WS = "wss://ws.kraken.com/v2";

const KRAKEN_QUOTES = ["USDT", "USDC", "USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF"];
const NOT_CRYPTO_BASES = new Set(["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "XAU", "XAG"]);
/** REST pair names that differ from the common ticker. */
const KRAKEN_REST_BASE: Record<string, string> = { BTC: "XBT", DOGE: "XDG" };

function krakenSplit(ticker: string): { base: string; quote: string } | null {
  for (const quote of KRAKEN_QUOTES) {
    if (ticker.endsWith(quote) && ticker.length > quote.length + 1) {
      const base = ticker.slice(0, -quote.length);
      if (/^[A-Z0-9]{2,10}$/.test(base) && !NOT_CRYPTO_BASES.has(base)) return { base, quote };
    }
  }
  return null;
}
const krakenRestPair = (ticker: string): string => {
  const p = krakenSplit(ticker);
  return p ? `${KRAKEN_REST_BASE[p.base] ?? p.base}${p.quote}` : ticker;
};
/** WS v2 uses the common name: BTC/USD (not XBT/USD). */
const krakenWsPair = (ticker: string): string => {
  const p = krakenSplit(ticker);
  return p ? `${p.base}/${p.quote}` : ticker;
};

const KRAKEN_INTERVAL: Partial<Record<Resolution, number>> = {
  "1m": 1,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "4h": 240,
  "1D": 1440,
  "1W": 10080,
};

/** Kraken result keys are expanded (XXBTZUSD); take the first array/object that is not "last". */
function krakenFirst(j: unknown): unknown {
  if (!isRecord(j) || !isRecord(j.result)) return null;
  if (Array.isArray(j.error) && j.error.length > 0) return null;
  for (const [k, v] of Object.entries(j.result)) if (k !== "last") return v;
  return null;
}

const krakenConfig: SourceConfig = {
  id: "kraken",
  label: "Kraken",
  needsKey: false,
  assetClass: "crypto",
  pollMs: POLL_MS,
  supports: (t) => krakenSplit(t) !== null,
  catalog: [
    { ticker: "BTCUSD", description: "Bitcoin / US Dollar" },
    { ticker: "ETHUSD", description: "Ethereum / US Dollar" },
    { ticker: "SOLUSD", description: "Solana / US Dollar" },
    { ticker: "XRPUSD", description: "XRP / US Dollar" },
    { ticker: "BTCEUR", description: "Bitcoin / Euro" },
  ],
  precision: () => 2,
  ping: async (ctx) => (await ctx.getJson(`${KRAKEN_REST}/Time`)) !== null,

  async history(ctx, ticker, req) {
    const minutes = KRAKEN_INTERVAL[req.resolution];
    if (!minutes) return [];
    // `since` returns the 720 bars after it, so start 720 bars before `to` to get the latest.
    const since = Math.max(Math.floor(req.from), Math.floor(req.to) - 720 * minutes * 60);
    const url = `${KRAKEN_REST}/OHLC?pair=${krakenRestPair(ticker)}&interval=${minutes}&since=${since}`;
    const rows = krakenFirst(await ctx.getJson(url));
    if (!Array.isArray(rows)) return [];
    const out: Candle[] = [];
    for (const r of rows) {
      if (!Array.isArray(r)) continue;
      // [time, open, high, low, close, vwap, volume, count]; the last row is the in-progress bar, kept.
      const c = makeCandle(r[0], r[1], r[2], r[3], r[4], r[6]);
      if (c) out.push(c);
    }
    return out;
  },

  async quote(ctx, ticker) {
    const t = krakenFirst(await ctx.getJson(`${KRAKEN_REST}/Ticker?pair=${krakenRestPair(ticker)}`));
    if (!isRecord(t)) return null;
    const last = toPrice(firstOf(t.c));
    if (last === null) return null;
    const q: Omit<Quote, "symbol"> = { last, time: ctx.nowSec() };
    const open = toPrice(t.o);
    if (open !== null) {
      q.change = last - open;
      q.changePercent = ((last - open) / open) * 100;
    }
    const bid = toPrice(firstOf(t.b));
    const ask = toPrice(firstOf(t.a));
    const vol = toNum(Array.isArray(t.v) ? t.v[1] : undefined);
    if (bid !== null) q.bid = bid;
    if (ask !== null) q.ask = ask;
    if (vol !== null) q.volume24h = vol;
    return q;
  },

  async plan(_ctx, ticker) {
    const pair = krakenWsPair(ticker);
    return {
      url: KRAKEN_WS,
      maxFails: 3,
      pollMs: POLL_MS,
      onOpen: (ws) => ws.send(JSON.stringify({ method: "subscribe", params: { channel: "ticker", symbol: [pair] } })),
      parse(raw) {
        try {
          const m: unknown = JSON.parse(raw);
          if (!isRecord(m)) return null;
          if (m.method === "subscribe" && m.success === false) return "fail";
          if (m.channel !== "ticker" || !Array.isArray(m.data)) return null;
          const d: unknown = m.data[0];
          return isRecord(d) ? toPrice(d.last) : null;
        } catch {
          return null;
        }
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Twelve Data (forex / gold, free key, ~8 requests/minute)
// ---------------------------------------------------------------------------

const TD_REST = "https://api.twelvedata.com";
const TD_WS = "wss://ws.twelvedata.com/v1/quotes/price";

const TD_CCY = new Set([
  "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "XAU", "XAG",
  "SEK", "NOK", "MXN", "ZAR", "SGD", "HKD", "TRY", "PLN", "CNH",
]); // prettier-ignore

const TD_INTERVAL: Partial<Record<Resolution, string>> = {
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "30m": "30min",
  "1h": "1h",
  "2h": "2h",
  "4h": "4h",
  "1D": "1day",
  "1W": "1week",
  "1M": "1month",
};

const tdSupports = (t: string): boolean => /^[A-Z]{6}$/.test(t) && TD_CCY.has(t.slice(0, 3)) && TD_CCY.has(t.slice(3));
const tdPair = (t: string): string => `${t.slice(0, 3)}/${t.slice(3)}`;

/** "YYYY-MM-DD HH:mm:ss" (or date only), read as UTC -> epoch seconds. */
function parseUtc(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s.trim());
  if (!m) return null;
  const ms = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

const tdIsError = (j: unknown): boolean => isRecord(j) && (j.status === "error" || j.code !== undefined);

function makeTwelveConfig(deps: LiveSourceDeps): SourceConfig {
  const key = async (): Promise<string | null> => {
    try {
      const k = deps.getKey ? await deps.getKey("twelvedata") : null;
      return k && k.trim() ? k.trim() : null;
    } catch {
      return null;
    }
  };

  return {
    id: "twelvedata",
    label: "Twelve Data",
    needsKey: true,
    assetClass: "forex",
    pollMs: TWELVE_POLL_MS,
    supports: tdSupports,
    catalog: [
      { ticker: "EURUSD", description: "Euro / US Dollar" },
      { ticker: "GBPUSD", description: "British Pound / US Dollar" },
      { ticker: "USDJPY", description: "US Dollar / Japanese Yen" },
      { ticker: "AUDUSD", description: "Australian Dollar / US Dollar" },
      { ticker: "XAUUSD", description: "Gold / US Dollar" },
      { ticker: "XAGUSD", description: "Silver / US Dollar" },
    ],
    precision: (t) => (t.startsWith("XA") ? 2 : t.endsWith("JPY") ? 3 : 5),
    ping: async () => (await key()) !== null,

    async history(ctx, ticker, req) {
      const interval = TD_INTERVAL[req.resolution];
      const apikey = await key();
      if (!interval || !apikey) return [];
      const size = Math.max(1, Math.min(req.limit ?? 500, 500));
      const url =
        `${TD_REST}/time_series?symbol=${tdPair(ticker)}&interval=${interval}&outputsize=${size}` +
        `&order=asc&timezone=UTC&apikey=${encodeURIComponent(apikey)}`;
      const j = await ctx.getJson(url);
      if (!isRecord(j) || tdIsError(j) || !Array.isArray(j.values)) return [];
      const out: Candle[] = [];
      for (const r of j.values) {
        if (!isRecord(r)) continue;
        const c = makeCandle(parseUtc(r.datetime), r.open, r.high, r.low, r.close, r.volume);
        if (c) out.push(c);
      }
      return out;
    },

    async quote(ctx, ticker) {
      const apikey = await key();
      if (!apikey) return null;
      const j = await ctx.getJson(`${TD_REST}/price?symbol=${tdPair(ticker)}&apikey=${encodeURIComponent(apikey)}`);
      if (!isRecord(j) || tdIsError(j)) return null;
      const last = toPrice(j.price);
      return last === null ? null : { last, time: ctx.nowSec() };
    },

    async plan(_ctx, ticker) {
      const apikey = await key();
      if (!apikey) return null; // no key: no-op subscription
      const pair = tdPair(ticker);
      return {
        url: `${TD_WS}?apikey=${encodeURIComponent(apikey)}`,
        maxFails: 1, // any socket/plan problem -> straight to throttled REST polling
        pollMs: TWELVE_POLL_MS,
        heartbeat: { ms: TWELVE_HEARTBEAT_MS, msg: JSON.stringify({ action: "heartbeat" }) },
        onOpen: (ws) => ws.send(JSON.stringify({ action: "subscribe", params: { symbols: pair } })),
        parse(raw) {
          try {
            const m: unknown = JSON.parse(raw);
            if (!isRecord(m)) return null;
            if (m.status === "error") return "fail";
            if (m.event === "subscribe-status") {
              return m.status === "error" || (Array.isArray(m.fails) && m.fails.length > 0) ? "fail" : null;
            }
            return m.event === "price" ? toPrice(m.price) : null;
          } catch {
            return null;
          }
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------

export function createLiveSources(deps: LiveSourceDeps = {}): Record<LiveSourceId, LiveSource> {
  return {
    binance: buildSource(binanceConfig, deps),
    kraken: buildSource(krakenConfig, deps),
    twelvedata: buildSource(makeTwelveConfig(deps), deps),
  };
}
