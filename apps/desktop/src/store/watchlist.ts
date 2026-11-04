import { stopTicking } from "../data";
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
        const next = s.watchlist.filter((w) => w.symbol !== symbol);
        // Release the demo ticker when no chart needs the symbol any more.
        if (!next.some((w) => w.symbol === symbol) && !s.layouts.some((l) => l.charts.some((c) => c.symbol === symbol))) {
          stopTicking(symbol);
        }
        return {
          watchlist: next,
          watchlistSymbolKey: next.map((w) => w.symbol).join(","),
          watchlistQuoteKey: watchlistQuoteKeys(next),
        };
      }),

    updateWatchPrice: (symbol: string, price: number, changePct: number | null) =>
      set((s) => {
        const current = s.watchlist.find((w) => w.symbol === symbol);
        if (!current || (current.price === price && current.changePct === changePct)) return s;
        return {
          watchlist: s.watchlist.map((w) => (w.symbol === symbol ? { ...w, price, changePct } : w)),
        };
      }),
  };
}
