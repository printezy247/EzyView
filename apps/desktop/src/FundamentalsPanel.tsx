import { useEffect, useMemo, useRef, useState } from "react";
import { KeyRound, X } from "lucide-react";
import type { DividendEvent, EarningsReport, EconomicEvent, Impact, IpoEvent, NewsItem } from "@ezyview/data-adapters";
import {
  buildSources,
  heatColor,
  layoutHeatmap,
  runScreener,
  scanUniverse,
} from "@ezyview/fundamentals";
import type { FundamentalsSources, ScreenerField, ScreenerRow, SourceSlot } from "@ezyview/fundamentals";
import { useApiKeys } from "./apiKeys";
import { market, tickerOf } from "./data";
import { safeHref } from "./links";

interface Props {
  symbol: string;
  onClose: () => void;
  onPickSymbol: (symbol: string) => void;
}

type Tab = "calendar" | "news" | "earnings" | "ipos" | "dividends" | "screener" | "heatmap";

/** Tabs and the source slots each one reads; screener and heatmap scan the market feed. */
const TABS: { id: Tab; label: string; slots: SourceSlot[] }[] = [
  { id: "calendar", label: "Calendar", slots: ["calendar"] },
  { id: "news", label: "News", slots: ["news"] },
  { id: "earnings", label: "Earnings", slots: ["earnings", "profile"] },
  { id: "ipos", label: "IPOs", slots: ["ipos"] },
  { id: "dividends", label: "Dividends", slots: ["dividends"] },
  { id: "screener", label: "Screener", slots: [] },
  { id: "heatmap", label: "Heatmap", slots: [] },
];

const DAY = 86400;
const IMPACT_COLOR: Record<Impact, string> = {
  high: "var(--ev-down)",
  medium: "var(--ev-warn)",
  low: "var(--ev-muted)",
  none: "var(--ev-dim)",
};
const when = (epoch: number): string =>
  new Date(epoch * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
/** Provider dates are UTC days; render them in UTC so they do not shift a day. */
const day = (epoch: number): string => new Date(epoch * 1000).toLocaleDateString(undefined, { timeZone: "UTC" });
const pct = (v: number): string => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
const tone = (v: number): string => (v >= 0 ? "text-ev-up" : "text-ev-down");

/** Calendar, news, earnings, IPOs, dividends, screener and heatmap in one bottom panel. */
export function FundamentalsPanel({ symbol, onClose, onPickSymbol }: Props) {
  const [tab, setTab] = useState<Tab>("calendar");
  const keys = useApiKeys((s) => s.keys);
  const keyError = useApiKeys((s) => s.error);
  const openApiKeys = useApiKeys((s) => s.openDialog);

  // A new keys object means a key was saved or removed: rebuild and reload every tab.
  const src = useMemo(() => ({ sources: buildSources(keys), version: String(Math.random()) }), [keys]);
  const sources = src.sources;
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <section aria-label="Fundamentals" className="flex min-h-0 flex-1 flex-col border-t border-ev-raised bg-ev-bg">
      <header className="flex h-8 shrink-0 items-center gap-1 border-b border-ev-raised px-3 text-[11px]">
        <div role="tablist" aria-label="Fundamentals" className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={
                tab === t.id
                  ? "rounded bg-ev-raised px-2 py-1 font-medium text-ev-strong"
                  : "rounded px-2 py-1 text-ev-muted hover:text-ev-strong"
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <SourceBadge slots={active.slots} live={sources.live} keyError={keyError} />
        <button
          type="button"
          onClick={openApiKeys}
          className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
        >
          <KeyRound size={12} aria-hidden />
          API keys
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close fundamentals"
          className="rounded p-1 text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
        >
          <X size={13} aria-hidden />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "calendar" && <CalendarTab src={src} />}
        {tab === "news" && <NewsTab symbol={symbol} src={src} />}
        {tab === "earnings" && <EarningsTab symbol={symbol} src={src} />}
        {tab === "ipos" && <IposTab src={src} />}
        {tab === "dividends" && <DividendsTab symbol={symbol} src={src} />}
        {tab === "screener" && <ScreenerTab onPick={onPickSymbol} />}
        {tab === "heatmap" && <HeatmapTab onPick={onPickSymbol} />}
      </div>
    </section>
  );
}

/** Current providers plus a version string that changes when they do. */
interface Src {
  sources: FundamentalsSources;
  version: string;
}

/** Says, for the open tab, whether the rows are live and from whom, or demo data. */
function SourceBadge({ slots, live, keyError }: { slots: SourceSlot[]; live: FundamentalsSources["live"]; keyError: string | null }) {
  if (keyError) return <span className="ml-3 truncate text-ev-down">{keyError}</span>;
  if (slots.length === 0) return <span className="ml-3 text-ev-muted">Scans the current market feed</span>;
  const names = [...new Set(slots.map((s) => live[s]).filter((n) => n !== null))];
  const demo = slots.some((s) => live[s] === null);
  if (names.length === 0) {
    const hint = slots.includes("calendar") ? "no free live source for the economic calendar yet" : "add a free API key for live data";
    return (
      <span className="ml-3 rounded bg-ev-warn/15 px-1.5 py-0.5 text-ev-warn">DEMO DATA · {hint}</span>
    );
  }
  return (
    <span className="ml-3 rounded bg-ev-up/15 px-1.5 py-0.5 text-ev-up">
      LIVE · {names.join(" + ")}
      {demo && <span className="text-ev-warn"> (part demo)</span>}
    </span>
  );
}

/** Run an async loader whenever `key` changes, ignoring stale results and keeping errors. */
function useLoad<T>(load: () => Promise<T>, key: string): { data: T | null; error: string | null } {
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

const Empty = ({ text }: { text: string }) => <p className="p-3 text-[11px] text-ev-muted">{text}</p>;
const Failed = ({ text }: { text: string }) => <p role="alert" className="p-3 text-[11px] text-ev-down">Could not load: {text}</p>;

function CalendarTab({ src }: { src: Src }) {
  const [impact, setImpact] = useState<Impact | "all">("all");
  const { data: events, error } = useLoad<EconomicEvent[]>(() => {
    const now = Math.floor(Date.now() / 1000);
    return src.sources.calendar.getCalendar(now - DAY, now + 7 * DAY);
  }, `calendar:${src.version}`);

  const rows = (events ?? []).filter((e) => impact === "all" || e.impact === impact);

  return (
    <div className="text-[11px]">
      <div className="sticky top-0 flex items-center gap-2 bg-ev-bg px-3 py-1.5">
        <label className="text-ev-muted" htmlFor="impact">
          Impact
        </label>
        <select
          id="impact"
          value={impact}
          onChange={(e) => setImpact(e.target.value as Impact | "all")}
          className="rounded border border-ev-line bg-ev-panel px-1 py-0.5"
        >
          <option value="all">All</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
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

function NewsTab({ symbol, src }: { symbol: string; src: Src }) {
  const { data: items, error } = useLoad<NewsItem[]>(
    () => src.sources.news.getNews({ symbols: [symbol], limit: 25 }),
    `${symbol}:${src.version}`,
  );
  if (error) return <Failed text={error} />;
  if (items === null) return <Empty text="Loading…" />;
  if (items.length === 0) return <Empty text="No recent news." />;
  return (
    <ul className="divide-y divide-ev-raised text-[11px]">
      {items.map((n) => (
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
  );
}

function EarningsTab({ symbol, src }: { symbol: string; src: Src }) {
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
    <div className="flex gap-6 p-3 text-[11px]">
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

function IposTab({ src }: { src: Src }) {
  const { data: rows, error } = useLoad<IpoEvent[]>(() => {
    const now = Math.floor(Date.now() / 1000);
    return src.sources.corporate.getIpos(now - 7 * DAY, now + 30 * DAY);
  }, `ipos:${src.version}`);
  if (error) return <Failed text={error} />;
  if (rows === null) return <Empty text="Loading…" />;
  if (rows.length === 0) return <Empty text="No IPOs in the next 30 days." />;
  return (
    <table className="w-full text-[11px]">
      <thead className="text-left text-ev-muted">
        <tr>
          <th scope="col" className="px-3 py-1 font-normal">Date</th>
          <th scope="col" className="font-normal">Symbol</th>
          <th scope="col" className="font-normal">Company</th>
          <th scope="col" className="font-normal">Exchange</th>
          <th scope="col" className="text-right font-normal">Price</th>
          <th scope="col" className="text-right font-normal">Shares</th>
          <th scope="col" className="pr-3 text-right font-normal">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.time}-${r.symbol}-${r.name}`} className="border-t border-ev-raised">
            <td className="px-3 py-1 text-ev-muted">{day(r.time)}</td>
            <td className="font-medium">{r.symbol}</td>
            <td>{r.name}</td>
            <td className="text-ev-muted">{r.exchange ?? "—"}</td>
            <td className="text-right">{r.price ?? "—"}</td>
            <td className="text-right">{r.shares ? r.shares.toLocaleString() : "—"}</td>
            <td className="pr-3 text-right text-ev-muted">{r.status ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DividendsTab({ symbol, src }: { symbol: string; src: Src }) {
  const { data: rows, error } = useLoad<DividendEvent[]>(() => {
    const now = Math.floor(Date.now() / 1000);
    return src.sources.corporate.getDividends(symbol, now - 3 * 365 * DAY, now + 120 * DAY);
  }, `${symbol}:${src.version}`);
  if (error) return <Failed text={error} />;
  if (rows === null) return <Empty text="Loading…" />;
  if (rows.length === 0) return <Empty text={`No dividends for ${tickerOf(symbol)} in the last 3 years (stocks only).`} />;
  return (
    <table className="w-full text-[11px]">
      <thead className="text-left text-ev-muted">
        <tr>
          <th scope="col" className="px-3 py-1 font-normal">Ex-date</th>
          <th scope="col" className="font-normal">Pay date</th>
          <th scope="col" className="pr-3 text-right font-normal">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.exDate} className="border-t border-ev-raised">
            <td className="px-3 py-1">{day(r.exDate)}</td>
            <td className="text-ev-muted">{r.payDate ? day(r.payDate) : "—"}</td>
            <td className="pr-3 text-right">
              {r.amount.toFixed(4).replace(/0{1,2}$/, "")} {r.currency ?? ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function useUniverse(): ScreenerRow[] | null {
  return useLoad(() => scanUniverse(market, "1D", 60), "universe").data;
}

const SORTS: { id: ScreenerField | "ticker"; label: string }[] = [
  { id: "changePct", label: "Change %" },
  { id: "rsi", label: "RSI" },
  { id: "volume", label: "Volume" },
  { id: "fromHighPct", label: "From high" },
  { id: "price", label: "Price" },
  { id: "ticker", label: "Ticker" },
];

function ScreenerTab({ onPick }: { onPick: (symbol: string) => void }) {
  const universe = useUniverse();
  const [text, setText] = useState("");
  const [assetClass, setAssetClass] = useState("");
  const [rsiMin, setRsiMin] = useState("");
  const [rsiMax, setRsiMax] = useState("");
  const [sortBy, setSortBy] = useState<ScreenerField | "ticker">("changePct");
  const [descending, setDescending] = useState(true);

  const rows = useMemo(() => {
    const bound = (s: string): number | undefined => (s.trim() === "" || Number.isNaN(Number(s)) ? undefined : Number(s));
    return runScreener(universe ?? [], {
      text,
      assetClass: assetClass || undefined,
      filters: [{ field: "rsi", min: bound(rsiMin), max: bound(rsiMax) }],
      sortBy,
      descending,
    });
  }, [universe, text, assetClass, rsiMin, rsiMax, sortBy, descending]);

  const input = "rounded border border-ev-line bg-ev-panel px-1.5 py-0.5";
  return (
    <div className="text-[11px]">
      <div className="sticky top-0 flex flex-wrap items-center gap-2 bg-ev-bg px-3 py-1.5">
        <input aria-label="Search symbols" placeholder="Search" value={text} onChange={(e) => setText(e.target.value)} className={`${input} w-24`} />
        <select aria-label="Asset class" value={assetClass} onChange={(e) => setAssetClass(e.target.value)} className={input}>
          <option value="">All classes</option>
          {[...new Set((universe ?? []).map((r) => r.assetClass))].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="text-ev-muted">RSI</span>
        <input aria-label="RSI minimum" placeholder="min" inputMode="decimal" value={rsiMin} onChange={(e) => setRsiMin(e.target.value)} className={`${input} w-14`} />
        <input aria-label="RSI maximum" placeholder="max" inputMode="decimal" value={rsiMax} onChange={(e) => setRsiMax(e.target.value)} className={`${input} w-14`} />
        <span className="text-ev-muted">Sort</span>
        <select aria-label="Sort by" value={sortBy} onChange={(e) => setSortBy(e.target.value as ScreenerField | "ticker")} className={input}>
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setDescending((d) => !d)} className={`${input} hover:text-ev-strong`}>
          {descending ? "↓ desc" : "↑ asc"}
        </button>
        <span className="ml-auto text-ev-muted">{rows.length} match</span>
      </div>
      {universe === null ? (
        <Empty text="Scanning…" />
      ) : rows.length === 0 ? (
        <Empty text="No symbols match." />
      ) : (
        <table className="w-full">
          <thead className="text-left text-ev-muted">
            <tr>
              <th scope="col" className="px-3 py-1 font-normal">Symbol</th>
              <th scope="col" className="text-right font-normal">Price</th>
              <th scope="col" className="text-right font-normal">Change</th>
              <th scope="col" className="text-right font-normal">RSI</th>
              <th scope="col" className="text-right font-normal">From high</th>
              <th scope="col" className="pr-3 text-right font-normal">Volume</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol} className="cursor-pointer border-t border-ev-raised hover:bg-ev-panel" onClick={() => onPick(r.symbol)}>
                <th scope="row" className="px-3 py-1 text-left font-medium">
                  {/* The row is clickable for the mouse; the button is the keyboard and screen-reader path. */}
                  <button type="button" onClick={(e) => (e.stopPropagation(), onPick(r.symbol))} className="hover:underline" aria-label={`Open ${r.ticker} chart`}>
                    {r.ticker}
                  </button>
                </th>
                <td className="text-right">{r.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                <td className={`text-right ${tone(r.changePct)}`}>{pct(r.changePct)}</td>
                <td className="text-right">{r.rsi?.toFixed(1) ?? "—"}</td>
                <td className="text-right">{pct(r.fromHighPct)}</td>
                <td className="pr-3 text-right">{Math.round(r.volume).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const W = 1000;
const H = 400;

function HeatmapTab({ onPick }: { onPick: (symbol: string) => void }) {
  const universe = useUniverse();
  const tiles = useMemo(
    () =>
      layoutHeatmap(
        (universe ?? []).map((r) => ({ id: r.symbol, label: r.ticker, weight: Math.max(r.price * r.volume, 1), changePct: r.changePct })),
        W,
        H,
      ),
    [universe],
  );
  if (universe === null) return <Empty text="Scanning…" />;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="size-full" role="img" aria-label="Heatmap of the symbol universe, sized by turnover and colored by change">
      {tiles.map((t) => (
        <g key={t.id} className="cursor-pointer" onClick={() => onPick(t.id)}>
          <title>{`${t.label} ${pct(t.changePct)}`}</title>
          <rect x={t.x} y={t.y} width={t.w} height={t.h} fill={heatColor(t.changePct)} className="stroke-ev-bg" strokeWidth={2} />
          {t.w > 60 && t.h > 30 && (
            <text x={t.x + t.w / 2} y={t.y + t.h / 2} textAnchor="middle" fill="#fff" fontSize={Math.min(22, t.w / 6)}>
              <tspan x={t.x + t.w / 2} dy="-0.2em" fontWeight={600}>
                {t.label}
              </tspan>
              <tspan x={t.x + t.w / 2} dy="1.2em" fontSize="0.75em">
                {pct(t.changePct)}
              </tspan>
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
