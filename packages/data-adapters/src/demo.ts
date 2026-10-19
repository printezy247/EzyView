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

/** Deterministic 32-bit PRNG so the demo feed is reproducible across reloads. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable string hash used to seed per-symbol series. */
function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const RESOLUTION_SECONDS: Record<Resolution, number> = {
  "1t": 1,
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

interface DemoSpec {
  symbol: string;
  ticker: string;
  description: string;
  assetClass: AssetClass;
  base: number;
  precision: number;
  tickSize: number;
}

const DEMO_SYMBOLS: DemoSpec[] = [
  { symbol: "DEMO:BTCUSDT", ticker: "BTCUSDT", description: "Bitcoin / TetherUS", assetClass: "crypto", base: 67000, precision: 2, tickSize: 0.1 },
  { symbol: "DEMO:ETHUSDT", ticker: "ETHUSDT", description: "Ethereum / TetherUS", assetClass: "crypto", base: 3300, precision: 2, tickSize: 0.01 },
  { symbol: "DEMO:SOLUSDT", ticker: "SOLUSDT", description: "Solana / TetherUS", assetClass: "crypto", base: 165, precision: 3, tickSize: 0.001 },
  { symbol: "DEMO:EURUSD", ticker: "EURUSD", description: "Euro / US Dollar", assetClass: "forex", base: 1.085, precision: 5, tickSize: 0.00001 },
  { symbol: "DEMO:GBPUSD", ticker: "GBPUSD", description: "British Pound / US Dollar", assetClass: "forex", base: 1.27, precision: 5, tickSize: 0.00001 },
  { symbol: "DEMO:XAUUSD", ticker: "XAUUSD", description: "Gold / US Dollar", assetClass: "forex", base: 2650, precision: 2, tickSize: 0.01 },
  { symbol: "DEMO:AAPL", ticker: "AAPL", description: "Apple Inc.", assetClass: "stock", base: 232, precision: 2, tickSize: 0.01 },
  { symbol: "DEMO:SPX", ticker: "SPX", description: "S&P 500 Index", assetClass: "index", base: 5800, precision: 2, tickSize: 0.01 },
];

/**
 * Fully offline synthetic market data source.
 *
 * Deterministic random walk per symbol so charts look identical on every load.
 * Used as the default feed (P0/P1) and as the fallback whenever a live adapter
 * is unreachable, which keeps the terminal usable with no API keys.
 */
export class DemoMarketAdapter implements MarketDataAdapter {
  readonly id = "demo";
  readonly label = "Demo feed (offline)";
  readonly assetClasses = ["crypto", "forex", "stock", "index"] as const;

  private readonly timers = new Set<ReturnType<typeof setInterval>>();
  private readonly quotes = new Map<string, Quote>();

  async ping(): Promise<boolean> {
    return true;
  }

  async searchSymbols(query: string, assetClass?: AssetClass): Promise<SymbolInfo[]> {
    const q = query.trim().toLowerCase();
    return DEMO_SYMBOLS.filter(
      (s) =>
        (!assetClass || s.assetClass === assetClass) &&
        (q === "" || s.ticker.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)),
    ).map((s) => this.toInfo(s));
  }

  async getSymbol(symbol: string): Promise<SymbolInfo | null> {
    const found = DEMO_SYMBOLS.find((s) => s.symbol === symbol || s.ticker === symbol);
    return found ? this.toInfo(found) : null;
  }

  async getHistory(request: HistoricalRequest): Promise<Candle[]> {
    const spec = this.findSpec(request.symbol);
    if (!spec) return [];
    const seconds = RESOLUTION_SECONDS[request.resolution] ?? 300;
    const to = request.to || Math.floor(Date.now() / 1000);
    const from = request.from || to - seconds * 500;
    const limit = request.limit ?? 5000;

    const endBar = Math.floor(to / seconds) * seconds;
    // Round the lower bound up so no bar starts before `from`.
    const startBar = Math.ceil(from / seconds) * seconds;
    if (endBar < startBar) return [];
    const count = Math.min(limit, Math.max(0, Math.floor((endBar - startBar) / seconds) + 1));

    const out: Candle[] = [];
    const rand = mulberry32(hashSeed(`${spec.symbol}:${seconds}:${startBar}`));
    // Walk backwards so the most recent price is anchored to spec.base.
    let close = spec.base;
    const bars: Candle[] = [];
    for (let i = 0; i < count; i++) {
      const drift = (rand() - 0.5) * spec.base * 0.012;
      const open = close;
      close = Math.max(spec.tickSize, open + drift);
      const high = Math.max(open, close) + rand() * spec.base * 0.004;
      const low = Math.min(open, close) - rand() * spec.base * 0.004;
      bars.push({
        time: endBar - i * seconds,
        open: round(open, spec.precision),
        high: round(high, spec.precision),
        low: round(Math.max(spec.tickSize, low), spec.precision),
        close: round(close, spec.precision),
        volume: Math.round(50 + rand() * 950),
      });
    }
    // bars are newest-first; chart consumers expect oldest-first.
    for (let i = bars.length - 1; i >= 0; i--) out.push(bars[i]!);
    return out;
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const existing = this.quotes.get(symbol);
    if (existing) return existing;
    const candles = await this.getHistory({ symbol, resolution: "1m", from: 0, to: 0, limit: 2 });
    if (candles.length === 0) return null;
    const last = candles[candles.length - 1]!;
    const prev = candles.length > 1 ? candles[candles.length - 2]! : last;
    const quote: Quote = {
      symbol,
      last: last.close,
      change: round(last.close - prev.close, 6),
      changePercent: prev.close === 0 ? 0 : round(((last.close - prev.close) / prev.close) * 100, 4),
      time: Math.floor(Date.now() / 1000),
    };
    this.quotes.set(symbol, quote);
    return quote;
  }

  async subscribe(symbols: string[], onQuote: SubscribeHandler): Promise<UnsubscribeFn> {
    const timer = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      for (const symbol of symbols) {
        const spec = this.findSpec(symbol);
        if (!spec) continue;
        const prev = this.quotes.get(symbol);
        const base = prev?.last ?? spec.base;
        const delta = (Math.random() - 0.5) * base * 0.001;
        const last = Math.max(spec.tickSize, base + delta);
        const quote: Quote = {
          symbol,
          last: round(last, spec.precision),
          change: round(last - spec.base, 6),
          changePercent: round(((last - spec.base) / spec.base) * 100, 4),
          time: now,
        };
        this.quotes.set(symbol, quote);
        onQuote(quote);
      }
    }, 1000);
    this.timers.add(timer);

    return () => {
      clearInterval(timer);
      this.timers.delete(timer);
    };
  }

  private findSpec(symbol: string): DemoSpec | null {
    return DEMO_SYMBOLS.find((s) => s.symbol === symbol || s.ticker === symbol) ?? null;
  }

  private toInfo(spec: DemoSpec): SymbolInfo {
    return {
      symbol: spec.symbol,
      ticker: spec.ticker,
      description: spec.description,
      provider: this.id,
      assetClass: spec.assetClass,
      precision: spec.precision,
      tickSize: spec.tickSize,
      minQty: spec.assetClass === "crypto" ? 0.0001 : 1,
      qtyStep: spec.assetClass === "crypto" ? 0.0001 : 1,
      currency: spec.assetClass === "crypto" ? "USDT" : "USD",
      tradable: true,
    };
  }
}

function round(value: number, precision: number): number {
  const f = 10 ** precision;
  return Math.round(value * f) / f;
}
