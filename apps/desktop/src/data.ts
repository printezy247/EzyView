import { DemoMarketAdapter } from "@ezyview/data-adapters";
import type { Candle, Quote, Resolution, SymbolInfo } from "@ezyview/data-adapters";
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

export async function searchSymbols(query: string): Promise<SymbolInfo[]> {
  if (brokerFeed()) return getMt5().data.searchSymbols(query);
  return market.searchSymbols(query);
}

/** One quote, from whichever feed the chart is on. */
/** Demo symbols already ticking; the demo feed only moves while subscribed to. */
const ticking = new Set<string>();

export async function quoteOf(symbol: string): Promise<Quote | null> {
  if (brokerFeed()) return getMt5().data.getQuote(symbol);
  if (!ticking.has(symbol)) {
    ticking.add(symbol);
    void market.subscribe([symbol], () => {});
  }
  return market.getQuote(symbol);
}

export async function loadHistory(symbol: string, resolution: Resolution, limit = 500): Promise<Candle[]> {
  const step = RESOLUTION_SECONDS[resolution];
  const now = Math.floor(Date.now() / 1000);
  // Snap the window to the bar grid so the newest candle is always complete.
  const to = Math.floor(now / step) * step;
  const request = { symbol, resolution, from: to - step * limit, to, limit };
  if (brokerFeed()) return getMt5().data.getHistory(request);
  return market.getHistory(request);
}
