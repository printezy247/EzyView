import type { CalendarAdapter, CorporateCalendarAdapter, FundamentalsAdapter, NewsAdapter } from "@ezyview/data-adapters";
import { AlphaVantageClient, AlphaVantageFundamentalsAdapter } from "./alphavantage.js";
import { DemoCalendarAdapter, DemoCorporateCalendarAdapter, DemoFundamentalsAdapter, DemoNewsAdapter } from "./demo.js";
import { FinnhubClient, FinnhubCorporateCalendarAdapter, FinnhubEarningsAdapter, FinnhubNewsAdapter } from "./finnhub.js";
import type { FetchLike } from "./http.js";

export type ApiKeyName = "finnhub" | "alphavantage";
export type ApiKeys = Partial<Record<ApiKeyName, string | null>>;

/** What each fundamentals view reads from. */
export type SourceSlot = "calendar" | "news" | "earnings" | "profile" | "ipos" | "dividends";

export interface FundamentalsSources {
  calendar: CalendarAdapter;
  news: NewsAdapter;
  earnings: Pick<FundamentalsAdapter, "getEarnings">;
  profile: Pick<FundamentalsAdapter, "getProfile">;
  corporate: CorporateCalendarAdapter;
  /** Provider name per slot, or null when that slot shows offline demo data. */
  live: Record<SourceSlot, string | null>;
}

/**
 * Pick live providers for every slot that has a key and fall back to the
 * Demo* adapters for the rest. The economic calendar stays demo: Finnhub's is
 * a paid endpoint and Alpha Vantage has none.
 */
export function buildSources(keys: ApiKeys, fetchFn?: FetchLike): FundamentalsSources {
  const fh = keys.finnhub?.trim() ? new FinnhubClient(keys.finnhub.trim(), fetchFn) : null;
  const av = keys.alphavantage?.trim() ? new AlphaVantageFundamentalsAdapter(new AlphaVantageClient(keys.alphavantage.trim(), fetchFn)) : null;
  const demoFundamentals = new DemoFundamentalsAdapter();
  const demoCorporate = new DemoCorporateCalendarAdapter();

  const ipos = fh ? new FinnhubCorporateCalendarAdapter(fh) : demoCorporate;
  const dividends = fh
    ? new FinnhubCorporateCalendarAdapter(fh, av ? (s, f, t) => av.getDividends(s, f, t) : undefined)
    : (av ?? demoCorporate);

  return {
    calendar: new DemoCalendarAdapter(),
    news: fh ? new FinnhubNewsAdapter(fh) : new DemoNewsAdapter(),
    earnings: fh ? new FinnhubEarningsAdapter(fh) : (av ?? demoFundamentals),
    profile: av ?? demoFundamentals,
    corporate: {
      id: "corporate",
      label: "Corporate calendar",
      getIpos: (from, to) => ipos.getIpos(from, to),
      getDividends: (symbol, from, to) => dividends.getDividends(symbol, from, to),
    },
    live: {
      calendar: null,
      news: fh ? "Finnhub" : null,
      earnings: fh ? "Finnhub" : av ? "Alpha Vantage" : null,
      profile: av ? "Alpha Vantage" : null,
      ipos: fh ? "Finnhub" : null,
      dividends: fh ? (av ? "Finnhub / Alpha Vantage" : "Finnhub") : av ? "Alpha Vantage" : null,
    },
  };
}
