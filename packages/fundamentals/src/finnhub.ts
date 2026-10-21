import type {
  CorporateCalendarAdapter,
  DividendEvent,
  EarningsReport,
  EpochSeconds,
  FundamentalsAdapter,
  IpoEvent,
  NewsAdapter,
  NewsItem,
} from "@ezyview/data-adapters";
import { classify, getJson, num, parseYmd, ProviderError, ymd } from "./http.js";
import type { FetchLike } from "./http.js";

const BASE = "https://finnhub.io/api/v1";
const DAY = 86400;
const now = (): EpochSeconds => Math.floor(Date.now() / 1000);

/** Thin Finnhub REST client. Free keys: https://finnhub.io/register (60 calls/min). */
export class FinnhubClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchLike = (url) => fetch(url),
  ) {}

  /** The token goes in the query string: Finnhub's CORS preflight does not allow its auth header. */
  get(path: string, params: Record<string, string> = {}): Promise<unknown> {
    const query = new URLSearchParams({ ...params, token: this.apiKey });
    return getJson(this.fetchFn, "Finnhub", `${BASE}${path}?${query}`);
  }
}

interface RawNews {
  id?: number;
  datetime?: number;
  headline?: string;
  summary?: string;
  source?: string;
  url?: string;
  related?: string;
  category?: string;
}

const toNews = (raw: RawNews, symbol: string | null): NewsItem | null =>
  raw.headline && raw.datetime
    ? {
        id: `finnhub-${raw.id ?? `${raw.datetime}-${raw.headline}`}`,
        time: raw.datetime,
        headline: raw.headline,
        summary: raw.summary || undefined,
        source: raw.source || "Finnhub",
        url: raw.url || undefined,
        symbols: symbol ? [symbol] : [],
        tags: raw.category ? [raw.category] : undefined,
      }
    : null;

/** Company news for stocks; crypto / forex / general market news otherwise. */
export class FinnhubNewsAdapter implements NewsAdapter {
  readonly id = "finnhub-news";
  readonly label = "Finnhub";

  constructor(private readonly client: FinnhubClient) {}

  async getNews(options?: { symbols?: string[]; from?: EpochSeconds; limit?: number }): Promise<NewsItem[]> {
    const limit = options?.limit ?? 30;
    const symbol = options?.symbols?.[0] ?? null;
    let items: NewsItem[] = [];
    if (symbol) {
      const { ticker, kind } = classify(symbol);
      if (kind === "stock") {
        const to = now();
        const from = options?.from ?? to - 7 * DAY;
        const raw = (await this.client.get("/company-news", { symbol: ticker, from: ymd(from), to: ymd(to) })) as RawNews[];
        items = (Array.isArray(raw) ? raw : []).map((r) => toNews(r, symbol)).filter((n) => n !== null);
      } else {
        items = await this.category(kind);
      }
    }
    if (items.length === 0) items = await this.category("general");
    return [...items]
      .filter((n) => !options?.from || n.time >= options.from)
      .sort((a, b) => b.time - a.time)
      .slice(0, limit);
  }

  private async category(category: string): Promise<NewsItem[]> {
    const raw = (await this.client.get("/news", { category })) as RawNews[];
    return (Array.isArray(raw) ? raw : []).map((r) => toNews(r, null)).filter((n) => n !== null);
  }
}

interface RawSurprise {
  actual?: number | null;
  estimate?: number | null;
  period?: string;
  quarter?: number;
  year?: number;
}

interface RawEarningsCal {
  date?: string;
  epsActual?: number | null;
  epsEstimate?: number | null;
  revenueActual?: number | null;
  quarter?: number;
  year?: number;
}

/**
 * Earnings: reported quarters from /stock/earnings plus upcoming dates from
 * /calendar/earnings. Profiles come from Alpha Vantage (see alphavantage.ts).
 */
export class FinnhubEarningsAdapter implements Pick<FundamentalsAdapter, "getEarnings"> {
  constructor(private readonly client: FinnhubClient) {}

  async getEarnings(symbol: string, from?: EpochSeconds, to?: EpochSeconds): Promise<EarningsReport[]> {
    const { ticker, kind } = classify(symbol);
    if (kind !== "stock") return [];
    const today = now();
    const [history, upcoming] = await Promise.all([
      this.client.get("/stock/earnings", { symbol: ticker }) as Promise<RawSurprise[]>,
      this.client.get("/calendar/earnings", { symbol: ticker, from: ymd(today - 30 * DAY), to: ymd(today + 180 * DAY) }) as Promise<{
        earningsCalendar?: RawEarningsCal[];
      }>,
    ]);
    const byQuarter = new Map<string, EarningsReport>();
    for (const r of Array.isArray(history) ? history : []) {
      const time = parseYmd(r.period);
      if (time === null) continue;
      const quarter = r.quarter && r.year ? `Q${r.quarter} ${r.year}` : (r.period ?? "");
      byQuarter.set(quarter, { symbol, time, eps: num(r.actual), estimate: num(r.estimate), quarter, source: "finnhub" });
    }
    for (const r of upcoming?.earningsCalendar ?? []) {
      const time = parseYmd(r.date);
      if (time === null) continue;
      const quarter = r.quarter && r.year ? `Q${r.quarter} ${r.year}` : (r.date ?? "");
      // Calendar rows carry the report date, so they win over the fiscal-period row.
      byQuarter.set(quarter, {
        symbol,
        time,
        eps: num(r.epsActual),
        estimate: num(r.epsEstimate) ?? byQuarter.get(quarter)?.estimate ?? null,
        revenue: num(r.revenueActual),
        quarter,
        source: "finnhub",
      });
    }
    return [...byQuarter.values()]
      .filter((r) => (!from || r.time >= from) && (!to || r.time <= to))
      .sort((a, b) => a.time - b.time);
  }
}

interface RawIpo {
  date?: string;
  exchange?: string | null;
  name?: string;
  numberOfShares?: number | null;
  price?: string | null;
  status?: string | null;
  symbol?: string | null;
}

interface RawDividend {
  symbol?: string;
  date?: string;
  amount?: number;
  payDate?: string;
  currency?: string;
}

/** Dividend source used when Finnhub refuses /stock/dividend (it is a paid endpoint on many plans). */
export type DividendFallback = (symbol: string, from: EpochSeconds, to: EpochSeconds) => Promise<DividendEvent[]>;

/** IPO calendar and dividend history from Finnhub. */
export class FinnhubCorporateCalendarAdapter implements CorporateCalendarAdapter {
  readonly id = "finnhub-corporate";
  readonly label = "Finnhub";

  constructor(
    private readonly client: FinnhubClient,
    private readonly dividendFallback?: DividendFallback,
  ) {}

  async getIpos(from: EpochSeconds, to: EpochSeconds): Promise<IpoEvent[]> {
    const raw = (await this.client.get("/calendar/ipo", { from: ymd(from), to: ymd(to) })) as { ipoCalendar?: RawIpo[] };
    const out: IpoEvent[] = [];
    for (const r of raw?.ipoCalendar ?? []) {
      const time = parseYmd(r.date);
      if (time === null || !r.name) continue;
      out.push({
        time,
        symbol: r.symbol || "—",
        name: r.name,
        exchange: r.exchange ?? null,
        price: r.price ?? null,
        shares: num(r.numberOfShares),
        status: r.status ?? null,
        source: "finnhub",
      });
    }
    return [...out].sort((a, b) => a.time - b.time);
  }

  async getDividends(symbol: string, from: EpochSeconds, to: EpochSeconds): Promise<DividendEvent[]> {
    const { ticker, kind } = classify(symbol);
    if (kind !== "stock") return [];
    let raw: RawDividend[];
    try {
      raw = (await this.client.get("/stock/dividend", { symbol: ticker, from: ymd(from), to: ymd(to) })) as RawDividend[];
    } catch (err) {
      if (err instanceof ProviderError && err.denied && this.dividendFallback) return this.dividendFallback(symbol, from, to);
      throw err;
    }
    const out: DividendEvent[] = [];
    for (const r of Array.isArray(raw) ? raw : []) {
      const exDate = parseYmd(r.date);
      const amount = num(r.amount);
      if (exDate === null || amount === null) continue;
      out.push({ symbol, exDate, payDate: parseYmd(r.payDate), amount, currency: r.currency ?? null, source: "finnhub" });
    }
    return [...out].sort((a, b) => b.exDate - a.exDate);
  }
}
