import { useEffect, useMemo, useRef, useState } from "react";
import type { EarningsReport, EconomicEvent, Impact, NewsItem } from "@ezyview/data-adapters";
import { filterEvents, filterNews } from "@ezyview/fundamentals";
import type { FundamentalsSources } from "@ezyview/fundamentals";
import { tickerOf } from "./data";
import { safeHref } from "./links";
import { inputClass } from "./ui";

/** Current providers plus a version string that changes when they do. */
export interface Src {
  sources: FundamentalsSources;
  version: string;
}

export const DAY = 86400;
const IMPACT_COLOR: Record<Impact, string> = {
  high: "var(--ev-down)",
  medium: "var(--ev-warn)",
  low: "var(--ev-muted)",
  none: "var(--ev-dim)",
};
const when = (epoch: number): string =>
  new Date(epoch * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
/** Provider dates are UTC days; render them in UTC so they do not shift a day. */
export const day = (epoch: number): string => new Date(epoch * 1000).toLocaleDateString(undefined, { timeZone: "UTC" });
export const pct = (v: number): string => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
export const tone = (v: number): string => (v >= 0 ? "text-ev-up" : "text-ev-down");

/**
 * Epoch seconds for a `YYYY-MM-DD` date input at local midnight.
 * `"end"` advances one day so the bound is an exclusive end that still covers
 * the chosen day (`filterEvents` treats `to` as exclusive). Empty or invalid
 * input returns undefined, leaving that side unbounded.
 */
export function dateInputToEpoch(value: string, edge: "start" | "end"): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const base = new Date(y, mo - 1, d);
  // Reject roll-overs such as 2026-02-31, which Date silently maps into March.
  if (base.getFullYear() !== y || base.getMonth() !== mo - 1 || base.getDate() !== d) return undefined;
  const bound = edge === "end" ? new Date(y, mo - 1, d + 1) : base;
  return Math.floor(bound.getTime() / 1000);
}

/** Local `YYYY-MM-DD` stamp for a date, for date-input values. */
const isoDate = (d: Date): string => {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

/** The default calendar date range: today through today + 7 days, local. */
export function defaultDateRange(now: Date = new Date()): { from: string; to: string } {
  return { from: isoDate(now), to: isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7)) };
}

/** Distinct currencies present in the events, sorted, keeping the first-seen casing. */
export function currencyOptions(events: readonly EconomicEvent[]): string[] {
  const seen = new Map<string, string>();
  for (const e of events) {
    const key = e.currency.trim().toLowerCase();
    if (key === "" || seen.has(key)) continue;
    seen.set(key, e.currency);
  }
  return [...seen.values()].toSorted((a, b) => a.localeCompare(b));
}

/** Run an async loader whenever `key` changes, ignoring stale results and keeping errors. */
export function useLoad<T>(load: () => Promise<T>, key: string): { data: T | null; error: string | null } {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let cancelled = false;
    setState({ data: null, error: null });
    loadRef.current().then(
      (data) => !cancelled && setState({ data, error: null }),
      (err: unknown) => !cancelled && setState({ data: null, error: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [key]);
  return state;
}

export const Empty = ({ text }: { text: string }) => <p className="p-3 text-dense text-ev-muted">{text}</p>;
export const Failed = ({ text }: { text: string }) => (
  <p role="alert" className="p-3 text-dense text-ev-down">
    Could not load: {text}
  </p>
);

export function CalendarTab({ src }: { src: Src }) {
  const [impact, setImpact] = useState<Impact | "all">("all");
  const [currency, setCurrency] = useState("all");
  const [search, setSearch] = useState("");
  // Defaults are derived once on mount so a day rollover does not jump the inputs.
  const [range, setRange] = useState(defaultDateRange);
  const { data: events, error } = useLoad<EconomicEvent[]>(() => {
    const now = Math.floor(Date.now() / 1000);
    return src.sources.calendar.getCalendar(now - 7 * DAY, now + 30 * DAY);
  }, `calendar:${src.version}`);

  const currencies = useMemo(() => currencyOptions(events ?? []), [events]);
  const rows = useMemo(
    () =>
      filterEvents(events ?? [], {
        impact,
        currency: currency === "all" ? undefined : currency,
        search,
        from: dateInputToEpoch(range.from, "start"),
        to: dateInputToEpoch(range.to, "end"),
      }),
    [events, impact, currency, search, range],
  );

  const input = inputClass("h-6 w-auto");
  return (
    <div className="text-dense">
      <div className="sticky top-0 flex flex-wrap items-center gap-2 bg-ev-bg px-3 py-1.5">
        <label className="text-ev-muted" htmlFor="impact">
          Impact
        </label>
        <select
          id="impact"
          value={impact}
          onChange={(e) => setImpact(e.target.value as Impact | "all")}
          className={input}
        >
          <option value="all">All</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <label className="text-ev-muted" htmlFor="currency">
          Currency
        </label>
        <select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={input}>
          <option value="all">All</option>
          {currencies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="search"
          aria-label="Search events"
          placeholder="Search events"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${input} w-36`}
        />
        <input
          type="date"
          aria-label="From date"
          value={range.from}
          onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
          className={input}
        />
        <span className="text-ev-muted">to</span>
        <input
          type="date"
          aria-label="To date"
          value={range.to}
          onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
          className={input}
        />
      </div>
      {error ? (
        <Failed text={error} />
      ) : events === null ? (
        <Empty text="Loading…" />
      ) : rows.length === 0 ? (
        <Empty text="No events match." />
      ) : (
        <table className="w-full">
          <thead className="text-left text-ev-muted">
            <tr>
              <th scope="col" className="px-3 py-1 font-normal">Time</th>
              <th scope="col" className="font-normal">Cur</th>
              <th scope="col" className="font-normal">Event</th>
              <th scope="col" className="text-right font-normal">Actual</th>
              <th scope="col" className="text-right font-normal">Forecast</th>
              <th scope="col" className="pr-3 text-right font-normal">Previous</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-t border-ev-raised">
                <td className="px-3 py-1 text-ev-muted">{when(e.time)}</td>
                <td>{e.currency}</td>
                <td>
                  <span className="mr-1.5 inline-block size-1.5 rounded-full" style={{ background: IMPACT_COLOR[e.impact] }} aria-label={`${e.impact} impact`} />
                  {e.title}
                </td>
                <td className={`text-right ${e.deviation === "better" ? "text-ev-up" : e.deviation === "worse" ? "text-ev-down" : ""}`}>
                  {e.actual ?? "—"}
                </td>
                <td className="text-right">{e.forecast ?? "—"}</td>
                <td className="pr-3 text-right text-ev-muted">{e.previous ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function NewsTab({ symbol, src }: { symbol: string; src: Src }) {
  const [search, setSearch] = useState("");
  const { data: items, error } = useLoad<NewsItem[]>(
    () => src.sources.news.getNews({ symbols: [symbol], limit: 25 }),
    `${symbol}:${src.version}`,
  );
  if (error) return <Failed text={error} />;
  if (items === null) return <Empty text="Loading…" />;
  const rows = filterNews(items, search);
  const searching = search.trim() !== "";
  const input = inputClass("h-6 w-auto");
  return (
    <div>
      <div className="sticky top-0 flex items-center gap-2 bg-ev-bg px-3 py-1.5">
        <input
          type="search"
          aria-label="Search news"
          placeholder="Search news"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${input} w-40`}
        />
        {searching && (
          <span className="text-ev-muted">
            {rows.length} of {items.length}
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <Empty text={searching ? "No news match." : "No recent news."} />
      ) : (
        <ul className="divide-y divide-ev-raised text-dense">
          {rows.map((n) => (
            <li key={n.id} className="flex items-center gap-3 px-3 py-1.5">
              <span className="w-24 shrink-0 text-ev-muted">{when(n.time)}</span>
              {safeHref(n.url) ? (
                <a href={safeHref(n.url)} target="_blank" rel="noopener noreferrer" title={n.summary} className="flex-1 hover:text-ev-strong hover:underline">
                  {n.headline}
                </a>
              ) : (
                <span className="flex-1">{n.headline}</span>
              )}
              {n.source !== "demo" && <span className="shrink-0 text-ev-muted">{n.source}</span>}
              {n.sentiment !== undefined && n.sentiment !== 0 && (
                <span className={tone(n.sentiment)}>{n.sentiment > 0 ? "bullish" : "bearish"}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EarningsTab({ symbol, src }: { symbol: string; src: Src }) {
  const { data, error } = useLoad<{ earnings: EarningsReport[]; profile: Record<string, number | string | null> }>(
    async () => {
      const [earnings, profile] = await Promise.all([src.sources.earnings.getEarnings(symbol), src.sources.profile.getProfile(symbol)]);
      return { earnings, profile };
    },
    `${symbol}:${src.version}`,
  );
  if (error) return <Failed text={error} />;
  if (data === null) return <Empty text="Loading…" />;
  if (data.earnings.length === 0 && Object.keys(data.profile).length === 0)
    return <Empty text={`No earnings or company profile for ${tickerOf(symbol)} (stocks only).`} />;
  return (
    <div className="flex gap-6 p-3 text-dense">
      <table className="flex-1">
        <thead className="text-left text-ev-muted">
          <tr>
            <th scope="col" className="font-normal">Quarter</th>
            <th scope="col" className="font-normal">Date</th>
            <th scope="col" className="text-right font-normal">EPS est.</th>
            <th scope="col" className="text-right font-normal">EPS actual</th>
            <th scope="col" className="text-right font-normal">Surprise</th>
          </tr>
        </thead>
        <tbody>
          {data.earnings.map((r) => {
            const surprise = r.eps != null && r.estimate ? ((r.eps - r.estimate) / Math.abs(r.estimate)) * 100 : null;
            return (
              <tr key={r.time} className="border-t border-ev-raised">
                <td className="py-1">{r.quarter}</td>
                <td className="text-ev-muted">{day(r.time)}</td>
                <td className="text-right">{r.estimate?.toFixed(2) ?? "—"}</td>
                <td className="text-right">{r.eps?.toFixed(2) ?? "upcoming"}</td>
                <td className={`text-right ${surprise === null ? "" : tone(surprise)}`}>{surprise === null ? "—" : pct(surprise)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <dl className="w-56 shrink-0 space-y-0.5">
        <dt className="mb-1 font-medium text-ev-strong">{tickerOf(symbol)} profile</dt>
        {Object.entries(data.profile).map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <dt className="text-ev-muted">{k}</dt>
            <dd>{v ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
