import type { DividendEvent, EarningsReport, EpochSeconds, FundamentalsAdapter } from "@ezyview/data-adapters";
import { classify, getJson, num, parseYmd, ProviderError } from "./http.js";
import type { FetchLike } from "./http.js";

const BASE = "https://www.alphavantage.co/query";
/** Free keys reject bursts faster than about one request per second. */
const MIN_GAP_MS = 1100;

/** Thin Alpha Vantage client. Free keys: https://www.alphavantage.co/support/#api-key (25 calls/day). */
export class AlphaVantageClient {
  private nextAt = 0;

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchLike = (url) => fetch(url),
  ) {}

  /** Alpha Vantage answers 200 with a "Note" / "Information" / "Error Message" body on failure. */
  async get(fn: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
    const now = Date.now();
    const wait = Math.max(0, this.nextAt - now);
    this.nextAt = Math.max(now, this.nextAt) + MIN_GAP_MS;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    const query = new URLSearchParams({ function: fn, ...params, apikey: this.apiKey });
    const body = (await getJson(this.fetchFn, "Alpha Vantage", `${BASE}?${query}`)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") throw new ProviderError("Alpha Vantage", 0, "unexpected response");
    const error = body["Error Message"];
    if (typeof error === "string") throw new ProviderError("Alpha Vantage", 400, error);
    const note = body["Note"] ?? body["Information"];
    if (typeof note === "string") {
      const limited = /rate limit|call frequency|requests per|spreading out/i.test(note);
      throw new ProviderError(
        "Alpha Vantage",
        limited ? 429 : 401,
        limited ? "request limit reached (free plan: 25 per day, about 1 per second); try again later" : note,
      );
    }
    return body;
  }
}

const billions = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Number((n / 1e9).toFixed(1));
};
const percent = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Number((n * 100).toFixed(2));
};
const text = (v: unknown): string | null => (typeof v === "string" && v !== "None" && v !== "-" && v !== "" ? v : null);

/** Company overview (OVERVIEW) and quarterly earnings (EARNINGS). */
export class AlphaVantageFundamentalsAdapter implements FundamentalsAdapter {
  readonly id = "alphavantage-fundamentals";
  readonly label = "Alpha Vantage";

  constructor(private readonly client: AlphaVantageClient) {}

  async getProfile(symbol: string): Promise<Record<string, number | string | null>> {
    const { ticker, kind } = classify(symbol);
    if (kind !== "stock") return {};
    const o = await this.client.get("OVERVIEW", { symbol: ticker });
    if (!o["Symbol"]) return {};
    return {
      Name: text(o["Name"]),
      Sector: text(o["Sector"]),
      Industry: text(o["Industry"]),
      "Market cap ($B)": billions(o["MarketCapitalization"]),
      "P/E": num(o["PERatio"]),
      EPS: num(o["EPS"]),
      "Dividend yield (%)": percent(o["DividendYield"]),
      "Net margin (%)": percent(o["ProfitMargin"]),
      Beta: num(o["Beta"]),
      "52w high": num(o["52WeekHigh"]),
      "52w low": num(o["52WeekLow"]),
    };
  }

  async getEarnings(symbol: string, from?: EpochSeconds, to?: EpochSeconds): Promise<EarningsReport[]> {
    const { ticker, kind } = classify(symbol);
    if (kind !== "stock") return [];
    const body = await this.client.get("EARNINGS", { symbol: ticker });
    const rows = Array.isArray(body["quarterlyEarnings"]) ? (body["quarterlyEarnings"] as Record<string, unknown>[]) : [];
    const out: EarningsReport[] = [];
    for (const r of rows.slice(0, 12)) {
      const time = parseYmd(r["reportedDate"]) ?? parseYmd(r["fiscalDateEnding"]);
      if (time === null || (from && time < from) || (to && time > to)) continue;
      const end = new Date(String(r["fiscalDateEnding"]));
      out.push({
        symbol,
        time,
        eps: num(r["reportedEPS"]),
        estimate: num(r["estimatedEPS"]),
        quarter: Number.isNaN(end.getTime()) ? String(r["fiscalDateEnding"]) : `Q${Math.floor(end.getUTCMonth() / 3) + 1} ${end.getUTCFullYear()}`,
        source: "alphavantage",
      });
    }
    return out.toSorted((a, b) => a.time - b.time);
  }

  /** Dividend history (DIVIDENDS), newest first. */
  async getDividends(symbol: string, from: EpochSeconds, to: EpochSeconds): Promise<DividendEvent[]> {
    const { ticker, kind } = classify(symbol);
    if (kind !== "stock") return [];
    const body = await this.client.get("DIVIDENDS", { symbol: ticker });
    const rows = Array.isArray(body["data"]) ? (body["data"] as Record<string, unknown>[]) : [];
    const out: DividendEvent[] = [];
    for (const r of rows) {
      const exDate = parseYmd(r["ex_dividend_date"]);
      const amount = num(r["amount"]);
      if (exDate === null || amount === null || exDate < from || exDate > to) continue;
      out.push({ symbol, exDate, payDate: parseYmd(r["payment_date"]), amount, currency: null, source: "alphavantage" });
    }
    return out.toSorted((a, b) => b.exDate - a.exDate);
  }
}
