import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { quoteOf } from "./data";
import { useWorkspace } from "./store";
import { Input, rowClass } from "./ui";

type SortKey = "ticker" | "price" | "change";

export type ScreenerPreset = "all" | "gainers" | "losers" | "contraction" | "expansion" | "forex" | "crypto";

const PRESETS: { id: ScreenerPreset; label: string }[] = [
  { id: "all", label: "All Symbols" },
  { id: "gainers", label: "Top Gainers (≥ +1.5%)" },
  { id: "losers", label: "Top Losers (≤ -1.5%)" },
  { id: "contraction", label: "Volatility Contraction (±0.5%)" },
  { id: "expansion", label: "Momentum Breakout (≥ ±2.0%)" },
  { id: "forex", label: "Forex & Gold" },
  { id: "crypto", label: "Crypto" },
];

/**
 * Screener: the watchlist (or any symbol you add) as a sortable, filterable
 * table with technical alpha presets.
 */
export function ScreenerTab() {
  const navigate = useNavigate();
  const watchlist = useWorkspace((s) => s.watchlist);
  const updateWatchPrice = useWorkspace((s) => s.updateWatchPrice);
  const setSymbol = useWorkspace((s) => s.setSymbol);
  const [query, setQuery] = useState("");
  const [minChange, setMinChange] = useState("");
  const [preset, setPreset] = useState<ScreenerPreset>("all");
  const [sort, setSort] = useState<SortKey>("change");
  const [desc, setDesc] = useState(true);
  const symbolKey = watchlist.map((w) => w.symbol).join(",");

  useEffect(() => {
    if (!symbolKey) return;
    let cancelled = false;
    const tick = () => {
      const rows = useWorkspace.getState().watchlist;
      void Promise.all(rows.map((row) => quoteOf(row.symbol, row.source).catch(() => null))).then((quotes) => {
        if (cancelled) return;
        quotes.forEach((q) => {
          if (q) updateWatchPrice(q.symbol, q.last, q.changePercent ?? null);
        });
      });
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [symbolKey, updateWatchPrice]);

  const rows = useMemo(() => {
    const floor = minChange.trim() === "" ? null : Number(minChange);
    const needle = query.trim().toLowerCase();
    const filtered = watchlist.filter((w) => {
      if (needle && !w.ticker.toLowerCase().includes(needle) && !w.description.toLowerCase().includes(needle)) {
        return false;
      }
      if (floor !== null && Number.isFinite(floor) && (w.changePct ?? -Infinity) < floor) return false;

      const change = w.changePct ?? 0;
      if (preset === "gainers" && change < 1.5) return false;
      if (preset === "losers" && change > -1.5) return false;
      if (preset === "contraction" && Math.abs(change) > 0.5) return false;
      if (preset === "expansion" && Math.abs(change) < 2.0) return false;
      if (preset === "forex" && w.assetClass !== "forex" && w.assetClass !== "commodity" && !w.ticker.includes("XAU") && !w.ticker.includes("USD")) return false;
      if (preset === "crypto" && w.assetClass !== "crypto" && !w.ticker.includes("BTC") && !w.ticker.includes("ETH")) return false;

      return true;
    });
    const dir = desc ? -1 : 1;
    return [...filtered].sort((a, b) => {
      if (sort === "ticker") return a.ticker.localeCompare(b.ticker) * dir;
      if (sort === "price") return ((a.price ?? 0) - (b.price ?? 0)) * dir;
      return ((a.changePct ?? 0) - (b.changePct ?? 0)) * dir;
    });
  }, [watchlist, query, minChange, preset, sort, desc]);

  const header = (key: SortKey, label: string, align: "left" | "right" = "right") => (
    <th scope="col" className={align === "right" ? "text-right" : "text-left"}>
      <button
        type="button"
        onClick={() => {
          if (sort === key) setDesc((v) => !v);
          else {
            setSort(key);
            setDesc(true);
          }
        }}
        className="text-micro font-semibold uppercase tracking-wider text-ev-faint hover:text-ev-strong"
        aria-sort={sort === key ? (desc ? "descending" : "ascending") : "none"}
      >
        {label}
        {sort === key && <span aria-hidden>{desc ? " ↓" : " ↑"}</span>}
      </button>
    </th>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col p-3">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="text-dense font-medium text-ev-muted">Preset:</span>
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              className={`rounded px-2 py-0.5 text-dense transition-colors ${
                preset === p.id
                  ? "bg-ev-accent text-white font-medium shadow-sm"
                  : "bg-ev-raised text-ev-muted hover:text-ev-strong hover:bg-ev-panel"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input
          aria-label="Filter by symbol"
          placeholder="Filter symbol…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-48"
        />
        <label className="flex items-center gap-1.5 text-dense text-ev-muted">
          Min change %
          <Input
            type="number"
            step="0.5"
            aria-label="Minimum change percent"
            value={minChange}
            onChange={(e) => setMinChange(e.target.value)}
            className="w-20"
          />
        </label>
        <span className="text-dense text-ev-faint">{rows.length} rows</span>
      </div>

      {watchlist.length === 0 ? (
        <p className="text-base text-ev-faint">Add symbols to the watchlist to screen them here.</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 bg-ev-bg">
              <tr className="border-b border-ev-line">
                {header("ticker", "Symbol", "left")}
                {header("price", "Last")}
                {header("change", "Change %")}
                <th scope="col" className="text-left text-micro font-semibold uppercase tracking-wider text-ev-faint">
                  Signal
                </th>
                <th scope="col" className="text-left text-micro font-semibold uppercase tracking-wider text-ev-faint">
                  Type
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => {
                const change = w.changePct ?? 0;
                let signalBadge = null;
                if (change >= 2.0) {
                  signalBadge = (
                    <span className="rounded bg-ev-up/20 px-1.5 py-0.5 text-[11px] font-semibold text-ev-up-text">
                      Breakout ▲
                    </span>
                  );
                } else if (change <= -2.0) {
                  signalBadge = (
                    <span className="rounded bg-ev-down/20 px-1.5 py-0.5 text-[11px] font-semibold text-ev-down-text">
                      Breakdown ▼
                    </span>
                  );
                } else if (Math.abs(change) <= 0.4) {
                  signalBadge = (
                    <span className="rounded bg-ev-raised px-1.5 py-0.5 text-[11px] font-medium text-ev-muted">
                      Contraction ⬍
                    </span>
                  );
                }

                return (
                  <tr
                    key={w.symbol}
                    className={rowClass({ className: "cursor-pointer hover:bg-ev-raised" })}
                    onClick={() => {
                      setSymbol(w.symbol);
                      navigate("/chart");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSymbol(w.symbol);
                        navigate("/chart");
                      }
                    }}
                    tabIndex={0}
                    role="link"
                    title={`Open ${w.description} on the chart`}
                  >
                    <td className="font-medium text-ev-strong">{w.ticker}</td>
                    <td className="text-right text-ev-text">{w.price === null ? "—" : w.price.toFixed(w.precision)}</td>
                    <td
                      className={
                        w.changePct === null
                          ? "text-right text-ev-faint"
                          : w.changePct >= 0
                            ? "text-right text-ev-up-text"
                            : "text-right text-ev-down-text"
                      }
                    >
                      {w.changePct === null ? "—" : `${w.changePct >= 0 ? "+" : ""}${w.changePct.toFixed(2)}%`}
                    </td>
                    <td>{signalBadge}</td>
                    <td className="text-ev-muted">{w.assetClass}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
