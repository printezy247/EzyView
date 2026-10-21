/** One row of the screener: a symbol plus the numbers filters and sorts act on. */
export interface ScreenerRow {
  symbol: string;
  ticker: string;
  name: string;
  assetClass: string;
  price: number;
  /** Percent change over the lookback window. */
  changePct: number;
  /** Latest bar volume. */
  volume: number;
  /** Percent distance of price from its window high (<= 0). */
  fromHighPct: number;
  /** Wilder RSI(14), or null when there is too little history. */
  rsi: number | null;
}

export type ScreenerField = "price" | "changePct" | "volume" | "fromHighPct" | "rsi";

export interface ScreenerFilter {
  field: ScreenerField;
  min?: number;
  max?: number;
}

export interface ScreenerQuery {
  filters: ScreenerFilter[];
  assetClass?: string;
  text?: string;
  sortBy: ScreenerField | "ticker";
  descending: boolean;
}

/** Filter then sort. A null field value never satisfies a bound on that field. */
export function runScreener(rows: ScreenerRow[], query: ScreenerQuery): ScreenerRow[] {
  const text = query.text?.trim().toLowerCase() ?? "";
  const kept = rows.filter((row) => {
    if (query.assetClass && row.assetClass !== query.assetClass) return false;
    if (text && !row.ticker.toLowerCase().includes(text) && !row.name.toLowerCase().includes(text)) return false;
    return query.filters.every((f) => {
      const value = row[f.field];
      if (f.min === undefined && f.max === undefined) return true;
      if (value === null) return false;
      return (f.min === undefined || value >= f.min) && (f.max === undefined || value <= f.max);
    });
  });
  const dir = query.descending ? -1 : 1;
  return [...kept].sort((a, b) => {
    if (query.sortBy === "ticker") return a.ticker.localeCompare(b.ticker) * dir;
    const av = a[query.sortBy];
    const bv = b[query.sortBy];
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return (av - bv) * dir;
  });
}

/** Wilder RSI over closes; null with fewer than period+1 values. */
export function rsiOf(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss === 0) return gain === 0 ? 50 : 100;
  return 100 - 100 / (1 + gain / loss);
}

/** Build a row from raw closes/volumes. Returns null for an empty series. */
export function rowFromBars(
  meta: Pick<ScreenerRow, "symbol" | "ticker" | "name" | "assetClass">,
  bars: { high: number; close: number; volume: number }[],
): ScreenerRow | null {
  const last = bars[bars.length - 1];
  const first = bars[0];
  if (!last || !first || first.close === 0) return null;
  const high = Math.max(...bars.map((b) => b.high));
  return {
    ...meta,
    price: last.close,
    changePct: ((last.close - first.close) / first.close) * 100,
    volume: last.volume,
    fromHighPct: high > 0 ? ((last.close - high) / high) * 100 : 0,
    rsi: rsiOf(bars.map((b) => b.close)),
  };
}
