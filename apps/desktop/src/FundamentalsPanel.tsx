import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { EarningsReport, EconomicEvent, Impact, NewsItem } from "@ezyview/data-adapters";
import {
  DemoCalendarAdapter,
  DemoFundamentalsAdapter,
  DemoNewsAdapter,
  heatColor,
  layoutHeatmap,
  runScreener,
  scanUniverse,
} from "@ezyview/fundamentals";
import type { ScreenerField, ScreenerRow } from "@ezyview/fundamentals";
import { market, tickerOf } from "./data";

interface Props {
  symbol: string;
  onClose: () => void;
  onPickSymbol: (symbol: string) => void;
}

type Tab = "calendar" | "news" | "earnings" | "screener" | "heatmap";

const TABS: { id: Tab; label: string }[] = [
  { id: "calendar", label: "Calendar" },
  { id: "news", label: "News" },
  { id: "earnings", label: "Earnings" },
  { id: "screener", label: "Screener" },
  { id: "heatmap", label: "Heatmap" },
];

// Offline sources behind the same adapter contracts a real provider would implement.
const calendar = new DemoCalendarAdapter();
const news = new DemoNewsAdapter();
const fundamentals = new DemoFundamentalsAdapter();

const DAY = 86400;
const IMPACT_COLOR: Record<Impact, string> = { high: "#ef5350", medium: "#f0b90b", low: "#787b86", none: "#434651" };
const when = (epoch: number): string =>
  new Date(epoch * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const pct = (v: number): string => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
const tone = (v: number): string => (v >= 0 ? "text-[#26a69a]" : "text-[#ef5350]");

/** Calendar, news, earnings, screener and heatmap in one bottom panel. */
export function FundamentalsPanel({ symbol, onClose, onPickSymbol }: Props) {
  const [tab, setTab] = useState<Tab>("calendar");

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
        <span className="ml-3 text-[#787b86]">Demo data — plug a provider into the adapter contracts for live feeds</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close fundamentals"
          className="ml-auto rounded p-1 text-[#787b86] hover:bg-[#1e222d] hover:text-white"
        >
          <X size={13} aria-hidden />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "calendar" && <CalendarTab />}
        {tab === "news" && <NewsTab symbol={symbol} />}
        {tab === "earnings" && <EarningsTab symbol={symbol} />}
        {tab === "screener" && <ScreenerTab onPick={onPickSymbol} />}
        {tab === "heatmap" && <HeatmapTab onPick={onPickSymbol} />}
      </div>
    </section>
  );
}

/** Run an async loader whenever `key` changes, ignoring stale results. */
function useLoad<T>(load: () => Promise<T>, key: string): T | null {
  const [data, setData] = useState<T | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let cancelled = false;
    setData(null);
    void loadRef.current().then((value) => {
      if (!cancelled) setData(value);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return data;
}

const Empty = ({ text }: { text: string }) => <p className="p-3 text-[11px] text-[#787b86]">{text}</p>;

function CalendarTab() {
  const [impact, setImpact] = useState<Impact | "all">("all");
  const events = useLoad<EconomicEvent[]>(() => {
    const now = Math.floor(Date.now() / 1000);
    return calendar.getCalendar(now - DAY, now + 7 * DAY);
  }, "calendar");

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
      {events === null ? (
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

function NewsTab({ symbol }: { symbol: string }) {
  const items = useLoad<NewsItem[]>(() => news.getNews({ symbols: [symbol], limit: 25 }), symbol);
  if (items === null) return <Empty text="Loading…" />;
  return (
    <ul className="divide-y divide-[#1e222d] text-[11px]">
      {items.map((n) => (
        <li key={n.id} className="flex items-center gap-3 px-3 py-1.5">
          <span className="w-24 shrink-0 text-[#787b86]">{when(n.time)}</span>
          <span className="flex-1">{n.headline}</span>
          {n.sentiment !== undefined && n.sentiment !== 0 && (
            <span className={tone(n.sentiment)}>{n.sentiment > 0 ? "bullish" : "bearish"}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function EarningsTab({ symbol }: { symbol: string }) {
  const data = useLoad<{ earnings: EarningsReport[]; profile: Record<string, number | string | null> }>(
    async () => ({ earnings: await fundamentals.getEarnings(symbol), profile: await fundamentals.getProfile(symbol) }),
    symbol,
  );
  if (data === null) return <Empty text="Loading…" />;
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
                <td className="text-[#787b86]">{new Date(r.time * 1000).toLocaleDateString()}</td>
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

function useUniverse(): ScreenerRow[] | null {
  return useLoad(() => scanUniverse(market, "1D", 60), "universe");
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
