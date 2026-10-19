import { DemoMarketAdapter } from "@ezyview/data-adapters";
import type { Candle, Resolution, SymbolInfo } from "@ezyview/data-adapters";

/** Single shared adapter. P2 swaps this for a registry with live providers. */
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

export const DEFAULT_SYMBOL = "BINANCE:BTCUSDT";

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

export async function searchSymbols(query: string): Promise<SymbolInfo[]> {
  return market.searchSymbols(query);
}

export async function loadHistory(symbol: string, resolution: Resolution, limit = 500): Promise<Candle[]> {
  const step = RESOLUTION_SECONDS[resolution];
  const now = Math.floor(Date.now() / 1000);
  // Snap the window to the bar grid so the newest candle is always complete.
  const to = Math.floor(now / step) * step;
  return market.getHistory({ symbol, resolution, from: to - step * limit, to, limit });
}
