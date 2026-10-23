/**
 * Display precision for a symbol.
 *
 * `precisionFor(price)` guesses from the magnitude alone, which turns EURUSD's
 * 1.08500 into "1.085" and makes every FX pair look like a 3-decimal
 * instrument. When the symbol is known, its own precision wins: the watchlist
 * carries the adapter's `SymbolInfo.precision` (MT5 `digits`, Binance tick
 * size, …). The magnitude guess stays as the fallback for an unknown symbol.
 */
import { precisionFor, tickerOf } from "./data";
import { useWorkspace } from "./store";

/** Six-letter FX pairs; JPY crosses quote to three decimals, the rest to five. */
const FX_PAIR = /^[A-Z]{6}$/;
/** Precious metals quote to two decimals despite having six-letter tickers. */
const METAL = /^(XAU|XAG|XPT|XPD)/;

export function precisionForSymbol(symbol: string | null | undefined, price: number | null): number {
  if (symbol) {
    const ticker = tickerOf(symbol).toUpperCase();
    const watched = useWorkspace
      .getState()
      .watchlist.find((entry) => entry.symbol === symbol || entry.ticker.toUpperCase() === ticker);
    if (watched && Number.isInteger(watched.precision) && watched.precision >= 0 && watched.precision <= 8) {
      return watched.precision;
    }
    if (METAL.test(ticker)) return 2;
    if (FX_PAIR.test(ticker)) return ticker.endsWith("JPY") ? 3 : 5;
  }
  return precisionFor(price);
}
