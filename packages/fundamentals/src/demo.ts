import type {
  CalendarAdapter,
  CorporateCalendarAdapter,
  DividendEvent,
  EarningsReport,
  EconomicEvent,
  EpochSeconds,
  FundamentalsAdapter,
  Impact,
  IpoEvent,
  NewsAdapter,
  NewsItem,
} from "@ezyview/data-adapters";
import { classify } from "./http.js";
import { hashSeed, mulberry32 } from "./rng.js";

const DAY = 86400;
const HOUR = 3600;

interface EventSpec {
  title: string;
  currency: string;
  impact: Impact;
  /** Typical level; forecast/previous are jittered around it. */
  base: number;
  unit: string;
}

const EVENT_SPECS: EventSpec[] = [
  { title: "Non-Farm Payrolls", currency: "USD", impact: "high", base: 180, unit: "K" },
  { title: "CPI y/y", currency: "USD", impact: "high", base: 3.1, unit: "%" },
  { title: "FOMC Rate Decision", currency: "USD", impact: "high", base: 5.25, unit: "%" },
  { title: "Retail Sales m/m", currency: "USD", impact: "medium", base: 0.4, unit: "%" },
  { title: "ECB Rate Decision", currency: "EUR", impact: "high", base: 4.0, unit: "%" },
  { title: "German ZEW Sentiment", currency: "EUR", impact: "medium", base: 15, unit: "" },
  { title: "BoE Rate Decision", currency: "GBP", impact: "high", base: 5.0, unit: "%" },
  { title: "UK GDP m/m", currency: "GBP", impact: "medium", base: 0.2, unit: "%" },
  { title: "BoJ Policy Rate", currency: "JPY", impact: "high", base: 0.1, unit: "%" },
  { title: "Tokyo Core CPI y/y", currency: "JPY", impact: "low", base: 2.5, unit: "%" },
  { title: "RBA Cash Rate", currency: "AUD", impact: "high", base: 4.35, unit: "%" },
  { title: "Unemployment Claims", currency: "USD", impact: "low", base: 215, unit: "K" },
];

const fmt = (value: number, unit: string): string => `${Number(value.toFixed(2))}${unit}`;

/** Offline economic calendar: a repeatable weekly schedule of plausible events. */
export class DemoCalendarAdapter implements CalendarAdapter {
  readonly id = "demo-calendar";
  readonly label = "Demo calendar (offline)";

  async getCalendar(
    from: EpochSeconds,
    to: EpochSeconds,
    filter?: { currency?: string; impact?: Impact },
  ): Promise<EconomicEvent[]> {
    const out: EconomicEvent[] = [];
    const firstDay = Math.floor(from / DAY);
    const lastDay = Math.floor(to / DAY);
    for (let day = firstDay; day <= lastDay; day++) {
      const rand = mulberry32(hashSeed(`cal:${day}`));
      const count = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < count; i++) {
        const spec = EVENT_SPECS[Math.floor(rand() * EVENT_SPECS.length)]!;
        const time = day * DAY + (6 + Math.floor(rand() * 12)) * HOUR;
        if (time < from || time > to) continue;
        const spread = Math.abs(spec.base) * 0.15 + 0.05;
        const previous = spec.base + (rand() - 0.5) * spread * 2;
        const forecast = previous + (rand() - 0.5) * spread;
        const released = time <= Date.now() / 1000;
        const actual = released ? forecast + (rand() - 0.5) * spread * 1.5 : null;
        const gap = actual === null ? 0 : actual - forecast;
        const deviation: EconomicEvent["deviation"] =
          actual === null ? null : Math.abs(gap) < spread * 0.1 ? "inline" : gap > 0 ? "better" : "worse";
        out.push({
          id: `cal-${day}-${i}`,
          time,
          currency: spec.currency,
          impact: spec.impact,
          title: spec.title,
          actual: actual === null ? null : fmt(actual, spec.unit),
          forecast: fmt(forecast, spec.unit),
          previous: fmt(previous, spec.unit),
          deviation,
          source: "demo",
        });
      }
    }
    return [...out]
      .filter((e) => (!filter?.currency || e.currency === filter.currency) && (!filter?.impact || e.impact === filter.impact))
      .sort((a, b) => a.time - b.time);
  }
}

const HEADLINES: { text: string; tags: string[]; sentiment: number }[] = [
  { text: "{S} edges higher as risk appetite returns", tags: ["markets"], sentiment: 0.4 },
  { text: "{S} slips ahead of key central-bank decision", tags: ["macro"], sentiment: -0.3 },
  { text: "Analysts raise price target on {S}", tags: ["analyst"], sentiment: 0.6 },
  { text: "{S} volatility climbs as volumes surge", tags: ["volatility"], sentiment: -0.1 },
  { text: "Institutional flows tilt long on {S}", tags: ["flows"], sentiment: 0.5 },
  { text: "{S} tests major support after weak data", tags: ["technical"], sentiment: -0.5 },
  { text: "Options traders position for {S} breakout", tags: ["options"], sentiment: 0.2 },
];

const GENERAL = ["Global equities mixed as yields hold steady", "Dollar index consolidates after payrolls", "Oil steadies on supply outlook"];

/** Offline news: synthetic headlines. Replace with a real NewsAdapter for live news. */
export class DemoNewsAdapter implements NewsAdapter {
  readonly id = "demo-news";
  readonly label = "Demo news (offline)";

  async getNews(options?: { symbols?: string[]; from?: EpochSeconds; limit?: number }): Promise<NewsItem[]> {
    const now = Math.floor(Date.now() / 1000);
    const limit = options?.limit ?? 30;
    const symbols = options?.symbols?.length ? options.symbols : [];
    const out: NewsItem[] = [];
    for (let i = 0; i < limit; i++) {
      const time = now - i * 47 * 60;
      if (options?.from && time < options.from) break;
      const rand = mulberry32(hashSeed(`news:${Math.floor(time / 2820)}`));
      if (symbols.length === 0) {
        out.push({
          id: `news-${i}`,
          time,
          headline: GENERAL[Math.floor(rand() * GENERAL.length)]!,
          source: "demo",
          symbols: [],
          tags: ["general"],
          sentiment: 0,
        });
        continue;
      }
      const symbol = symbols[Math.floor(rand() * symbols.length)]!;
      const ticker = symbol.split(":").pop() ?? symbol;
      const h = HEADLINES[Math.floor(rand() * HEADLINES.length)]!;
      out.push({
        id: `news-${symbol}-${i}`,
        time,
        headline: h.text.replace("{S}", ticker),
        source: "demo",
        symbols: [symbol],
        tags: h.tags,
        sentiment: h.sentiment,
      });
    }
    return out;
  }
}

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;

/** Offline fundamentals: stable per-symbol ratios and quarterly earnings. */
export class DemoFundamentalsAdapter implements FundamentalsAdapter {
  readonly id = "demo-fundamentals";
  readonly label = "Demo fundamentals (offline)";

  async getEarnings(symbol: string, from?: EpochSeconds, to?: EpochSeconds): Promise<EarningsReport[]> {
    const rand = mulberry32(hashSeed(`earn:${symbol}`));
    const baseEps = 0.5 + rand() * 4;
    const now = Math.floor(Date.now() / 1000);
    const out: EarningsReport[] = [];
    for (let q = -7; q <= 1; q++) {
      const time = now + q * 91 * DAY;
      if ((from && time < from) || (to && time > to)) continue;
      const estimate = baseEps * (1 + q * 0.015) + (rand() - 0.5) * 0.1;
      const future = time > now;
      const date = new Date(time * 1000);
      out.push({
        symbol,
        time,
        eps: future ? null : estimate * (1 + (rand() - 0.4) * 0.12),
        estimate,
        revenue: future ? null : baseEps * 2e9 * (1 + q * 0.02),
        quarter: `${QUARTERS[Math.floor(date.getUTCMonth() / 3)]} ${date.getUTCFullYear()}`,
        source: "demo",
      });
    }
    return out;
  }

  async getProfile(symbol: string): Promise<Record<string, number | string | null>> {
    const rand = mulberry32(hashSeed(`profile:${symbol}`));
    const eps = 0.5 + rand() * 6;
    const pe = 8 + rand() * 40;
    return {
      "Market cap ($B)": Number((20 + rand() * 2500).toFixed(1)),
      "P/E": Number(pe.toFixed(1)),
      EPS: Number(eps.toFixed(2)),
      "Dividend yield (%)": Number((rand() * 4).toFixed(2)),
      "Net margin (%)": Number((5 + rand() * 30).toFixed(1)),
      "Debt / equity": Number((rand() * 2).toFixed(2)),
      Sector: ["Technology", "Financials", "Energy", "Healthcare", "Consumer", "Industrials"][Math.floor(rand() * 6)]!,
    };
  }
}

const IPO_NAMES = ["Northwind Robotics", "Bluefin Payments", "Cobalt Bio", "Harbor Energy", "Lumen Cloud", "Quarry Foods", "Vertex Mobility"];

/** Offline IPO and dividend calendars. */
export class DemoCorporateCalendarAdapter implements CorporateCalendarAdapter {
  readonly id = "demo-corporate";
  readonly label = "Demo corporate calendar (offline)";

  async getIpos(from: EpochSeconds, to: EpochSeconds): Promise<IpoEvent[]> {
    const out: IpoEvent[] = [];
    for (let day = Math.floor(from / DAY); day <= Math.floor(to / DAY); day++) {
      const rand = mulberry32(hashSeed(`ipo:${day}`));
      if (rand() < 0.6) continue;
      const name = IPO_NAMES[Math.floor(rand() * IPO_NAMES.length)]!;
      const low = 8 + Math.floor(rand() * 20);
      const time = day * DAY;
      out.push({
        time,
        symbol: name.replace(/[^A-Z]/g, "").slice(0, 4),
        name,
        exchange: rand() < 0.5 ? "NASDAQ" : "NYSE",
        price: `${low.toFixed(2)}-${(low + 2).toFixed(2)}`,
        shares: Math.round(5 + rand() * 40) * 1e6,
        status: time * 1000 < Date.now() ? "priced" : "expected",
        source: "demo",
      });
    }
    return out;
  }

  async getDividends(symbol: string, from: EpochSeconds, to: EpochSeconds): Promise<DividendEvent[]> {
    if (classify(symbol).kind !== "stock") return [];
    const rand = mulberry32(hashSeed(`div:${symbol}`));
    const amount = Number((0.1 + rand() * 1.5).toFixed(2));
    const offset = Math.floor(rand() * 91) * DAY;
    const out: DividendEvent[] = [];
    // Quarterly cadence anchored to a fixed epoch so results are stable across calls.
    for (let exDate = offset; exDate <= to; exDate += 91 * DAY) {
      if (exDate >= from) out.push({ symbol, exDate, payDate: exDate + 21 * DAY, amount, currency: "USD", source: "demo" });
    }
    return [...out].sort((a, b) => b.exDate - a.exDate);
  }
}
