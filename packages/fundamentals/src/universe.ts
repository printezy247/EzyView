import type { MarketDataAdapter, Resolution } from "@ezyview/data-adapters";
import { rowFromBars } from "./screener.js";
import type { ScreenerRow } from "./screener.js";

/** Scan every symbol an adapter offers and turn its recent history into screener rows. */
export async function scanUniverse(
  market: MarketDataAdapter,
  resolution: Resolution = "1D",
  bars = 60,
): Promise<ScreenerRow[]> {
  const symbols = await market.searchSymbols("");
  const rows = await Promise.all(
    symbols.map(async (info) => {
      const candles = await market.getHistory({ symbol: info.symbol, resolution, from: 0, to: 0, limit: bars });
      return rowFromBars(
        { symbol: info.symbol, ticker: info.ticker, name: info.description, assetClass: info.assetClass },
        candles,
      );
    }),
  );
  return rows.filter((r): r is ScreenerRow => r !== null);
}
