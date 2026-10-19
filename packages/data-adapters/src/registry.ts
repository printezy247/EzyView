import type {
  AdapterRegistry,
  CalendarAdapter,
  FundamentalsAdapter,
  MarketDataAdapter,
  NewsAdapter,
  TradingAdapter,
} from "./types.js";

/** Create an empty registry. Adapters self-register on import in the app. */
export function createRegistry(): AdapterRegistry {
  return {
    markets: new Map<string, MarketDataAdapter>(),
    trading: new Map<string, TradingAdapter>(),
    calendars: new Map<string, CalendarAdapter>(),
    news: new Map<string, NewsAdapter>(),
    fundamentals: new Map<string, FundamentalsAdapter>(),
  };
}

export function registerMarket(registry: AdapterRegistry, adapter: MarketDataAdapter): void {
  if (registry.markets.has(adapter.id)) {
    throw new Error(`market adapter already registered: ${adapter.id}`);
  }
  registry.markets.set(adapter.id, adapter);
}

export function registerTrading(registry: AdapterRegistry, adapter: TradingAdapter): void {
  if (registry.trading.has(adapter.id)) {
    throw new Error(`trading adapter already registered: ${adapter.id}`);
  }
  registry.trading.set(adapter.id, adapter);
}

/** Resolve a full symbol like "BINANCE:BTCUSDT" to its owning adapter. */
export function resolveProvider(registry: AdapterRegistry, symbol: string): { adapter: MarketDataAdapter; local: string } | null {
  const colon = symbol.indexOf(":");
  if (colon > 0) {
    const prefix = symbol.slice(0, colon).toLowerCase();
    const local = symbol.slice(colon + 1);
    // Prefer exact provider-id match; fall back to a label/asset-class match.
    const byId = registry.markets.get(prefix);
    if (byId) return { adapter: byId, local };
  }
  // Fall back: first adapter that can resolve the symbol directly.
  for (const adapter of registry.markets.values()) {
    return { adapter, local: symbol };
  }
  return null;
}
