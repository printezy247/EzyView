import { effectiveSource, type EffectiveSource } from "../chartSource";
import type { WatchEntry, WorkspaceStore } from "./types";

export const DEFAULT_WATCHLIST: WatchEntry[] = [
  { symbol: "BINANCE:BTCUSDT", ticker: "BTCUSDT", description: "Bitcoin / Tether", assetClass: "Crypto", precision: 2, price: null, changePct: null },
  { symbol: "BINANCE:ETHUSDT", ticker: "ETHUSDT", description: "Ethereum / Tether", assetClass: "Crypto", precision: 2, price: null, changePct: null },
  { symbol: "OANDA:XAUUSD", ticker: "XAUUSD", description: "Gold / US Dollar", assetClass: "Commodity", precision: 2, price: null, changePct: null },
  { symbol: "OANDA:EURUSD", ticker: "EURUSD", description: "Euro / US Dollar", assetClass: "Forex", precision: 4, price: null, changePct: null },
  { symbol: "OANDA:GBPUSD", ticker: "GBPUSD", description: "British Pound / US Dollar", assetClass: "Forex", precision: 4, price: null, changePct: null },
  { symbol: "NASDAQ:AAPL", ticker: "AAPL", description: "Apple Inc.", assetClass: "Stock", precision: 2, price: null, changePct: null },
  { symbol: "NASDAQ:NVDA", ticker: "NVDA", description: "NVIDIA Corp.", assetClass: "Stock", precision: 2, price: null, changePct: null },
  { symbol: "AMEX:SPY", ticker: "SPY", description: "SPDR S&P 500 ETF Trust", assetClass: "Index", precision: 2, price: null, changePct: null },
];

/** One key that changes when a row's feed or symbol changes, not on a tick. */
export function watchlistQuoteKeys(list: readonly WatchEntry[]): string {
  return list.map((w) => (w.source ? `${w.source}|${w.symbol}` : w.symbol)).join(",");
}

/**
 * A row is the one on the chart only when symbol AND feed agree: the same
 * ticker on another feed is a different price series. A row with no saved feed
 * follows the global feed switch, like a chart set to "auto".
 */
export function watchRowActive(
  row: WatchEntry,
  activeSymbol: string,
  activeFeed: EffectiveSource,
  globalFeed: "mt5" | "ezyview",
): boolean {
  return row.symbol === activeSymbol && effectiveSource(row.source, globalFeed) === activeFeed;
}

type SliceSet = (
  partial: Partial<WorkspaceStore> | ((s: WorkspaceStore) => Partial<WorkspaceStore> | WorkspaceStore),
) => void;

/** Watchlist slice: rows the user tracks, and their live quotes. */
export function createWatchlistSlice(set: SliceSet, _get: () => WorkspaceStore) {
  return {
    watchlist: DEFAULT_WATCHLIST,
    watchlistSymbolKey: DEFAULT_WATCHLIST.map((w) => w.symbol).join(","),
    watchlistQuoteKey: watchlistQuoteKeys(DEFAULT_WATCHLIST),

    addToWatchlist: (entry: WatchEntry) =>
      set((s) => {
        if (s.watchlist.some((w) => w.symbol === entry.symbol)) return s;
        const next = [...s.watchlist, entry];
        return {
          watchlist: next,
          watchlistSymbolKey: next.map((w) => w.symbol).join(","),
          watchlistQuoteKey: watchlistQuoteKeys(next),
        };
      }),

    removeFromWatchlist: (symbol: string) =>
      set((s) => {
        // The quote poller holds the demo-ticker lease and releases it with its
        // last subscriber, so removing a row must not force-stop a ticker that a
        // chart or the header may still be reading.
        const next = s.watchlist.filter((w) => w.symbol !== symbol);
        return {
          watchlist: next,
          watchlistSymbolKey: next.map((w) => w.symbol).join(","),
          watchlistQuoteKey: watchlistQuoteKeys(next),
        };
      }),

    updateWatchPrice: (symbol: string, price: number, changePct: number | null) =>
      set((s) => {
        const current = s.watchlist.find((w) => w.symbol === symbol);
        // A quote without a change% must not wipe the last good one.
        const nextPct = changePct ?? current?.changePct ?? null;
        if (!current || (current.price === price && current.changePct === nextPct)) return s;
        return {
          watchlist: s.watchlist.map((w) => (w.symbol === symbol ? { ...w, price, changePct: nextPct } : w)),
        };
      }),

    invalidateFollowGlobalPrices: () =>
      set((s) => {
        // Rows pinned to a feed keep their quotes; rows that follow the global
        // switch would show the old feed's numbers until the next poll.
        if (!s.watchlist.some((w) => !w.source && (w.price !== null || w.changePct !== null))) return s;
        return {
          watchlist: s.watchlist.map((w) => (!w.source ? { ...w, price: null, changePct: null } : w)),
        };
      }),
  };
}
