import { describe, expect, it } from "vitest";
import { AlphaVantageClient, AlphaVantageFundamentalsAdapter } from "./alphavantage.js";
import { FinnhubClient, FinnhubCorporateCalendarAdapter, FinnhubEarningsAdapter, FinnhubNewsAdapter } from "./finnhub.js";
import { classify, ProviderError } from "./http.js";
import type { FetchLike } from "./http.js";
import { buildSources } from "./sources.js";

/** Fake fetch: routes by URL substring, records every URL it was asked for. */
function fakeFetch(routes: Record<string, unknown | { status: number }>): FetchLike & { urls: string[] } {
  const urls: string[] = [];
  const fn = (async (url: string) => {
    urls.push(url);
    const hit = Object.entries(routes).find(([key]) => url.includes(key));
    if (!hit) throw new Error(`unexpected request ${url}`);
    const body = hit[1];
    if (body && typeof body === "object" && "status" in body && typeof body.status === "number") {
      return { ok: false, status: body.status, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => body };
  }) as FetchLike & { urls: string[] };
  fn.urls = urls;
  return fn;
}

const fallback = async () => [{ symbol: "DEMO:AAPL", exDate: 1, amount: 0.25, source: "alphavantage" }];

describe("classify", () => {
  it("separates stocks, crypto and forex", () => {
    expect(classify("DEMO:AAPL")).toEqual({ ticker: "AAPL", kind: "stock" });
    expect(classify("BINANCE:BTCUSDT").kind).toBe("crypto");
    expect(classify("DEMO:EURUSD").kind).toBe("forex");
    expect(classify("DEMO:XAUUSD").kind).toBe("forex");
  });
});

describe("Finnhub", () => {
  it("maps company news, passes the token and sorts newest first", async () => {
    const f = fakeFetch({
      "/company-news": [
        { id: 1, datetime: 1_700_000_000, headline: "Old", source: "Reuters", url: "https://x/1" },
        { id: 2, datetime: 1_700_100_000, headline: "New", summary: "s", source: "CNBC" },
        { id: 3, headline: "no time" },
      ],
    });
    const news = await new FinnhubNewsAdapter(new FinnhubClient("KEY", f)).getNews({ symbols: ["DEMO:AAPL"], limit: 10 });
    expect(news.map((n) => n.headline)).toEqual(["New", "Old"]);
    expect(news[0]).toMatchObject({ id: "finnhub-2", source: "CNBC", symbols: ["DEMO:AAPL"] });
    expect(f.urls[0]).toContain("symbol=AAPL");
    expect(f.urls[0]).toContain("token=KEY");
  });

  it("uses the crypto news category for crypto symbols", async () => {
    const f = fakeFetch({ "category=crypto": [{ id: 9, datetime: 1_700_000_000, headline: "BTC up" }] });
    const news = await new FinnhubNewsAdapter(new FinnhubClient("K", f)).getNews({ symbols: ["BINANCE:BTCUSDT"] });
    expect(news).toHaveLength(1);
    expect(f.urls).toHaveLength(1);
  });

  it("merges reported surprises with upcoming earnings dates", async () => {
    const f = fakeFetch({
      "/stock/earnings": [
        { actual: 1.5, estimate: 1.4, period: "2024-03-31", quarter: 1, year: 2024 },
        { actual: 1.6, estimate: 1.55, period: "2024-06-30", quarter: 2, year: 2024 },
      ],
      "/calendar/earnings": {
        earningsCalendar: [{ date: "2024-08-01", epsActual: null, epsEstimate: 1.7, quarter: 3, year: 2024 }],
      },
    });
    const rows = await new FinnhubEarningsAdapter(new FinnhubClient("K", f)).getEarnings("DEMO:AAPL");
    expect(rows.map((r) => r.quarter)).toEqual(["Q1 2024", "Q2 2024", "Q3 2024"]);
    expect(rows[2]).toMatchObject({ eps: null, estimate: 1.7, time: Date.UTC(2024, 7, 1) / 1000 });
  });

  it("skips earnings requests for non-stocks", async () => {
    const f = fakeFetch({});
    expect(await new FinnhubEarningsAdapter(new FinnhubClient("K", f)).getEarnings("DEMO:EURUSD")).toEqual([]);
    expect(f.urls).toHaveLength(0);
  });

  it("maps the IPO calendar", async () => {
    const f = fakeFetch({
      "/calendar/ipo": {
        ipoCalendar: [
          { date: "2024-05-02", name: "B Corp", symbol: "BC", price: "10.00-12.00", numberOfShares: 5e6, status: "expected", exchange: "NYSE" },
          { date: "2024-05-01", name: "A Corp", symbol: "AC", price: null, status: "priced" },
          { date: "bad", name: "Skip" },
        ],
      },
    });
    const ipos = await new FinnhubCorporateCalendarAdapter(new FinnhubClient("K", f)).getIpos(0, 2e9);
    expect(ipos.map((i) => i.symbol)).toEqual(["AC", "BC"]);
    expect(ipos[1]).toMatchObject({ price: "10.00-12.00", shares: 5e6, exchange: "NYSE" });
  });

  it("falls back for dividends when the plan lacks access", async () => {
    const f = fakeFetch({ "/stock/dividend": { status: 403 } });
    const cal = new FinnhubCorporateCalendarAdapter(new FinnhubClient("K", f), fallback);
    expect(await cal.getDividends("DEMO:AAPL", 0, 2e9)).toHaveLength(1);
    await expect(new FinnhubCorporateCalendarAdapter(new FinnhubClient("K", f)).getDividends("DEMO:AAPL", 0, 2e9)).rejects.toThrow(
      /plan does not include/,
    );
  });

  it("reports a bad key as a ProviderError", async () => {
    const f = fakeFetch({ "/news": { status: 401 } });
    const err = await new FinnhubNewsAdapter(new FinnhubClient("bad", f)).getNews().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).denied).toBe(true);
  });
});

describe("Alpha Vantage", () => {
  it("maps the company overview", async () => {
    const f = fakeFetch({
      "function=OVERVIEW": {
        Symbol: "IBM",
        Name: "IBM",
        Sector: "TECHNOLOGY",
        MarketCapitalization: "180000000000",
        PERatio: "22.5",
        EPS: "8.1",
        DividendYield: "0.0385",
        ProfitMargin: "0.12",
        Beta: "None",
      },
    });
    const profile = await new AlphaVantageFundamentalsAdapter(new AlphaVantageClient("K", f)).getProfile("DEMO:IBM");
    expect(profile).toMatchObject({ Name: "IBM", "Market cap ($B)": 180, "P/E": 22.5, "Dividend yield (%)": 3.85, "Net margin (%)": 12, Beta: null });
    expect(f.urls[0]).toContain("symbol=IBM");
    expect(f.urls[0]).toContain("apikey=K");
  });

  it("returns an empty profile for unknown symbols", async () => {
    const f = fakeFetch({ OVERVIEW: {} });
    expect(await new AlphaVantageFundamentalsAdapter(new AlphaVantageClient("K", f)).getProfile("DEMO:ZZZZ")).toEqual({});
  });

  it("turns a rate-limit note into a 429 ProviderError", async () => {
    const f = fakeFetch({ OVERVIEW: { Information: "Our standard API rate limit is 25 requests per day." } });
    const err = await new AlphaVantageFundamentalsAdapter(new AlphaVantageClient("K", f)).getProfile("DEMO:IBM").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).status).toBe(429);
  });

  it("maps dividends inside the range, newest first", async () => {
    const f = fakeFetch({
      DIVIDENDS: {
        data: [
          { ex_dividend_date: "2024-08-09", payment_date: "2024-09-10", amount: "1.67" },
          { ex_dividend_date: "2024-05-09", payment_date: "None", amount: "1.67" },
          { ex_dividend_date: "2019-05-09", amount: "1.62" },
        ],
      },
    });
    const rows = await new AlphaVantageFundamentalsAdapter(new AlphaVantageClient("K", f)).getDividends("DEMO:IBM", Date.UTC(2024, 0, 1) / 1000, 2e9);
    expect(rows.map((r) => r.amount)).toEqual([1.67, 1.67]);
    expect(rows[0]!.payDate).toBe(Date.UTC(2024, 8, 10) / 1000);
    expect(rows[1]!.payDate).toBeNull();
  });
});

describe("buildSources", () => {
  it("uses demo data everywhere without keys", () => {
    const s = buildSources({});
    expect(Object.values(s.live).every((v) => v === null)).toBe(true);
    expect(s.news.id).toBe("demo-news");
  });

  it("goes live per provider key", () => {
    const f = fakeFetch({});
    expect(buildSources({ finnhub: "a" }, f).live).toMatchObject({ news: "Finnhub", ipos: "Finnhub", profile: null, calendar: null });
    expect(buildSources({ alphavantage: "b" }, f).live).toMatchObject({ news: null, profile: "Alpha Vantage", earnings: "Alpha Vantage" });
    expect(buildSources({ finnhub: "  " }, f).live.news).toBeNull();
  });
});
