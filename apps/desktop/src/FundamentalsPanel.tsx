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
import type { ApiKeys, FundamentalsSources, ScreenerField, ScreenerRow, SourceSlot } from "@ezyview/fundamentals";
import { ApiKeysDialog } from "./ApiKeysDialog";
import { loadApiKeys } from "./apiKeys";
import { market, tickerOf } from "./data";

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
const IMPACT_COLOR: Record<Impact, string> = { high: "#ef5350", medium: "#f0b90b", low: "#787b86", none: "#434651" };
const when = (epoch: number): string =>
  new Date(epoch * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
/** Provider dates are UTC days; render them in UTC so they do not shift a day. */
const day = (epoch: number): string => new Date(epoch * 1000).toLocaleDateString(undefined, { timeZone: "UTC" });
const pct = (v: number): string => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
const tone = (v: number): string => (v >= 0 ? "text-[#26a69a]" : "text-[#ef5350]");

/** Calendar, news, earnings, IPOs, dividends, screener and heatmap in one bottom panel. */
export function FundamentalsPanel({ symbol, onClose, onPickSymbol }: Props) {
  const [tab, setTab] = useState<Tab>("calendar");
  const [keys, setKeys] = useState<ApiKeys>({});
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keysVersion, setKeysVersion] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadApiKeys()
      .then((k) => {
        if (cancelled) return;
        setKeys(k);
        setKeyError(null);
      })
      .catch((err: unknown) => !cancelled && setKeyError(`Could not read the system keyring: ${String(err)}`));
    return () => {
      cancelled = true;
    };
  }, [keysVersion]);

  const sources = useMemo(() => buildSources(keys), [keys]);
  // Bumps whenever the providers change so every tab reloads.
  const src = { sources, version: `${keysVersion}:${Object.values(sources.live).join(",")}` };
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <section className="flex h-64 shrink-0 flex-col border-t border-[#1e222d] bg-[#0e1117]">
      <header className="flex h-8 shrink-0 items-center gap-1 border-b border-[#1e222d] px-3 text-[11px]">
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
                  ? "rounded bg-[#1e222d] px-2 py-1 font-medium text-white"
                  : "rounded px-2 py-1 text-[#787b86] hover:text-white"
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <SourceBadge slots={active.slots} live={sources.live} keyError={keyError} />
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-[#787b86] hover:bg-[#1e222d] hover:text-white"
        >
          <KeyRound size={12} aria-hidden />
          API keys
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close fundamentals"
          className="rounded p-1 text-[#787b86] hover:bg-[#1e222d] hover:text-white"
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
      {settingsOpen && (
        <ApiKeysDialog keys={keys} onClose={() => setSettingsOpen(false)} onChanged={() => setKeysVersion((v) => v + 1)} />
      )}
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
  if (keyError) return <span className="ml-3 truncate text-[#ef5350]">{keyError}</span>;
  if (slots.length === 0) return <span className="ml-3 text-[#787b86]">Scans the current market feed</span>;
  const names = [...new Set(slots.map((s) => live[s]).filter((n) => n !== null))];
  const demo = slots.some((s) => live[s] === null);
  if (names.length === 0) {
    const hint = slots.includes("calendar") ? "no free live source for the economic calendar yet" : "add a free API key for live data";
    return (
      <span className="ml-3 rounded bg-[#f0b90b]/15 px-1.5 py-0.5 text-[#f0b90b]">DEMO DATA · {hint}</span>
    );
  }
  return (
    <span className="ml-3 rounded bg-[#26a69a]/15 px-1.5 py-0.5 text-[#26a69a]">
      LIVE · {names.join(" + ")}
      {demo && <span className="text-[#f0b90b]"> (part demo)</span>}
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

const Empty = ({ text }: { text: string }) => <p className="p-3 text-[11px] text-[#787b86]">{text}</p>;
const Failed = ({ text }: { text: string }) => <p className="p-3 text-[11px] text-[#ef5350]">Could not load: {text}</p>;

function CalendarTab({ src }: { src: Src }) {
  const [impact, setImpact] = useState<Impact | "all">("all");
  const { data: events, error } = useLoad<EconomicEvent[]>(() => {
    const now = Math.floor(Date.now() / 1000);
    return src.sources.calendar.getCalendar(now - DAY, now + 7 * DAY);
  }, `calendar:${src.version}`);

  const rows = (events ?? []).filter((e) => impact === "all" || e.impact === impact);

  return (
    <div className="text-[11px]">
      <div className="sticky top-0 flex items-center gap-2 bg-[#0e1117] px-3 py-1.5">
        <label className="text-[#787b86]" htmlFor="impact">
          Impact
        </label>
        <select
          id="impact"
          value={impact}
          onChange={(e) => setImpact(e.target.value as Impact | "all")}
          className="rounded border border-[#2a2e39] bg-[#131722] px-1 py-0.5"
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
          <thead className="text-left text-[#787b86]">
            <tr>
              <th className="px-3 py-1 font-normal">Time</th>
              <th className="font-normal">Cur</th>
              <th className="font-normal">Event</th>
              <th className="text-right font-normal">Actual</th>
              <th className="text-right font-normal">Forecast</th>
              <th className="pr-3 text-right font-normal">Previous</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-t border-[#1e222d]">
                <td className="px-3 py-1 text-[#787b86]">{when(e.time)}</td>
                <td>{e.currency}</td>
                <td>
                  <span className="mr-1.5 inline-block size-1.5 rounded-full" style={{ background: IMPACT_COLOR[e.impact] }} aria-label={`${e.impact} impact`} />
                  {e.title}
                </td>
                <td className={`text-right ${e.deviation === "better" ? "text-[#26a69a]" : e.deviation === "worse" ? "text-[#ef5350]" : ""}`}>
                  {e.actual ?? "—"}
                </td>
                <td className="text-right">{e.forecast ?? "—"}</td>
                <td className="pr-3 text-right text-[#787b86]">{e.previous ?? "—"}</td>
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
    <ul className="divide-y divide-[#1e222d] text-[11px]">
      {items.map((n) => (
        <li key={n.id} className="flex items-center gap-3 px-3 py-1.5">
          <span className="w-24 shrink-0 text-[#787b86]">{when(n.time)}</span>
          {n.url ? (
            <a href={n.url} target="_blank" rel="noreferrer" title={n.summary} className="flex-1 hover:text-white hover:underline">
              {n.headline}
            </a>
          ) : (
            <span className="flex-1">{n.headline}</span>
          )}
          {n.source !== "demo" && <span className="shrink-0 text-[#787b86]">{n.source}</span>}
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
        <thead className="text-left text-[#787b86]">
          <tr>
            <th className="font-normal">Quarter</th>
            <th className="font-normal">Date</th>
            <th className="text-right font-normal">EPS est.</th>
            <th className="text-right font-normal">EPS actual</th>
            <th className="text-right font-normal">Surprise</th>
          </tr>
        </thead>
        <tbody>
          {data.earnings.map((r) => {
            const surprise = r.eps != null && r.estimate ? ((r.eps - r.estimate) / Math.abs(r.estimate)) * 100 : null;
            return (
              <tr key={r.time} className="border-t border-[#1e222d]">
                <td className="py-1">{r.quarter}</td>
                <td className="text-[#787b86]">{day(r.time)}</td>
                <td className="text-right">{r.estimate?.toFixed(2) ?? "—"}</td>
                <td className="text-right">{r.eps?.toFixed(2) ?? "upcoming"}</td>
                <td className={`text-right ${surprise === null ? "" : tone(surprise)}`}>{surprise === null ? "—" : pct(surprise)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <dl className="w-56 shrink-0 space-y-0.5">
        <dt className="mb-1 font-medium text-white">{tickerOf(symbol)} profile</dt>
        {Object.entries(data.profile).map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <dt className="text-[#787b86]">{k}</dt>
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
      <thead className="text-left text-[#787b86]">
        <tr>
          <th className="px-3 py-1 font-normal">Date</th>
          <th className="font-normal">Symbol</th>
          <th className="font-normal">Company</th>
          <th className="font-normal">Exchange</th>
          <th className="text-right font-normal">Price</th>
          <th className="text-right font-normal">Shares</th>
          <th className="pr-3 text-right font-normal">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.time}-${r.symbol}-${r.name}`} className="border-t border-[#1e222d]">
            <td className="px-3 py-1 text-[#787b86]">{day(r.time)}</td>
            <td className="font-medium">{r.symbol}</td>
            <td>{r.name}</td>
            <td className="text-[#787b86]">{r.exchange ?? "—"}</td>
            <td className="text-right">{r.price ?? "—"}</td>
            <td className="text-right">{r.shares ? r.shares.toLocaleString() : "—"}</td>
            <td className="pr-3 text-right text-[#787b86]">{r.status ?? "—"}</td>
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
      <thead className="text-left text-[#787b86]">
        <tr>
          <th className="px-3 py-1 font-normal">Ex-date</th>
          <th className="font-normal">Pay date</th>
          <th className="pr-3 text-right font-normal">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.exDate} className="border-t border-[#1e222d]">
            <td className="px-3 py-1">{day(r.exDate)}</td>
            <td className="text-[#787b86]">{r.payDate ? day(r.payDate) : "—"}</td>
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

  const input = "rounded border border-[#2a2e39] bg-[#131722] px-1.5 py-0.5";
  return (
    <div className="text-[11px]">
      <div className="sticky top-0 flex flex-wrap items-center gap-2 bg-[#0e1117] px-3 py-1.5">
        <input aria-label="Search symbols" placeholder="Search" value={text} onChange={(e) => setText(e.target.value)} className={`${input} w-24`} />
        <select aria-label="Asset class" value={assetClass} onChange={(e) => setAssetClass(e.target.value)} className={input}>
          <option value="">All classes</option>
          {[...new Set((universe ?? []).map((r) => r.assetClass))].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="text-[#787b86]">RSI</span>
        <input aria-label="RSI minimum" placeholder="min" inputMode="decimal" value={rsiMin} onChange={(e) => setRsiMin(e.target.value)} className={`${input} w-14`} />
        <input aria-label="RSI maximum" placeholder="max" inputMode="decimal" value={rsiMax} onChange={(e) => setRsiMax(e.target.value)} className={`${input} w-14`} />
        <span className="text-[#787b86]">Sort</span>
        <select aria-label="Sort by" value={sortBy} onChange={(e) => setSortBy(e.target.value as ScreenerField | "ticker")} className={input}>
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setDescending((d) => !d)} className={`${input} hover:text-white`}>
          {descending ? "↓ desc" : "↑ asc"}
        </button>
        <span className="ml-auto text-[#787b86]">{rows.length} match</span>
      </div>
      {universe === null ? (
        <Empty text="Scanning…" />
      ) : rows.length === 0 ? (
        <Empty text="No symbols match." />
      ) : (
        <table className="w-full">
          <thead className="text-left text-[#787b86]">
            <tr>
              <th className="px-3 py-1 font-normal">Symbol</th>
              <th className="text-right font-normal">Price</th>
              <th className="text-right font-normal">Change</th>
              <th className="text-right font-normal">RSI</th>
              <th className="text-right font-normal">From high</th>
              <th className="pr-3 text-right font-normal">Volume</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol} className="cursor-pointer border-t border-[#1e222d] hover:bg-[#131722]" onClick={() => onPick(r.symbol)}>
                <td className="px-3 py-1 font-medium">{r.ticker}</td>
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
          <rect x={t.x} y={t.y} width={t.w} height={t.h} fill={heatColor(t.changePct)} stroke="#0e1117" strokeWidth={2} />
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
