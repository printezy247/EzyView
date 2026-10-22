import { useMemo, useState } from "react";
import { KeyRound, X } from "lucide-react";
import type { IpoEvent } from "@ezyview/data-adapters";
import {
  buildSources,
  heatColor,
  layoutHeatmap,
  runScreener,
  scanUniverse,
} from "@ezyview/fundamentals";
import type { FundamentalsSources, ScreenerField, ScreenerRow, SourceSlot } from "@ezyview/fundamentals";
import { useApiKeys } from "./apiKeys";
import { market } from "./data";
import { CalendarTab, DAY, day, DividendsTab, EarningsTab, Empty, Failed, NewsTab, pct, tone, useLoad } from "./FundamentalsTabs";
import type { Src } from "./FundamentalsTabs";
import { inputClass } from "./ui";

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
      <header className="flex h-8 shrink-0 items-center gap-1 border-b border-ev-raised px-3 text-dense">
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

function IposTab({ src }: { src: Src }) {
  const { data: rows, error } = useLoad<IpoEvent[]>(() => {
    const now = Math.floor(Date.now() / 1000);
    return src.sources.corporate.getIpos(now - 7 * DAY, now + 30 * DAY);
  }, `ipos:${src.version}`);
  if (error) return <Failed text={error} />;
  if (rows === null) return <Empty text="Loading…" />;
  if (rows.length === 0) return <Empty text="No IPOs in the next 30 days." />;
  return (
    <table className="w-full text-dense">
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

  const input = inputClass("h-6 w-auto");
  return (
    <div className="text-dense">
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
            <text x={t.x + t.w / 2} y={t.y + t.h / 2} textAnchor="middle" fill="currentColor" fontSize={Math.min(22, t.w / 6)}>
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
