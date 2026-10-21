import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { market } from "./data";
import { useWorkspace } from "./store";
import { Input, rowClass } from "./ui";

type SortKey = "ticker" | "price" | "change";

/**
 * Screener: the watchlist (or any symbol you add) as a sortable, filterable
 * table. It filters the rows the app already tracks rather than pretending to
 * scan the whole market — a real screener needs a universe feed the demo
 * adapter does not have.
 */
export function ScreenerTab() {
  const navigate = useNavigate();
  const watchlist = useWorkspace((s) => s.watchlist);
  const updateWatchPrice = useWorkspace((s) => s.updateWatchPrice);
  const updateActive = useWorkspace((s) => s.updateActive);
  const [query, setQuery] = useState("");
  const [minChange, setMinChange] = useState("");
  const [sort, setSort] = useState<SortKey>("change");
  const [desc, setDesc] = useState(true);

  useEffect(() => {
    if (watchlist.length === 0) return;
    let cancelled = false;
    const symbols = watchlist.map((w) => w.symbol);
    const tick = () => {
      void Promise.all(symbols.map((s) => market.getQuote(s))).then((quotes) => {
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
  }, [watchlist, updateWatchPrice]);

  const rows = useMemo(() => {
    const floor = minChange.trim() === "" ? null : Number(minChange);
    const needle = query.trim().toLowerCase();
    const filtered = watchlist.filter((w) => {
      if (needle && !w.ticker.toLowerCase().includes(needle) && !w.description.toLowerCase().includes(needle)) {
        return false;
      }
      if (floor !== null && Number.isFinite(floor) && (w.changePct ?? -Infinity) < floor) return false;
      return true;
    });
    const dir = desc ? -1 : 1;
    return filtered.toSorted((a, b) => {
      if (sort === "ticker") return a.ticker.localeCompare(b.ticker) * dir;
      if (sort === "price") return ((a.price ?? 0) - (b.price ?? 0)) * dir;
      return ((a.changePct ?? 0) - (b.changePct ?? 0)) * dir;
    });
  }, [watchlist, query, minChange, sort, desc]);

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
                  Type
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr
                  key={w.symbol}
                  className={rowClass({ className: "cursor-pointer hover:bg-ev-raised" })}
                  onClick={() => {
                    updateActive({ symbol: w.symbol });
                    navigate("/chart");
                  }}
                  title={`Open ${w.description} on the chart`}
                >
                  <td className="font-medium text-ev-strong">{w.ticker}</td>
                  <td className="text-right text-ev-text">{w.price === null ? "—" : w.price.toFixed(w.precision)}</td>
                  <td className={w.changePct === null ? "text-right text-ev-faint" : w.changePct >= 0 ? "text-right text-ev-up" : "text-right text-ev-down"}>
                    {w.changePct === null ? "—" : `${w.changePct >= 0 ? "+" : ""}${w.changePct.toFixed(2)}%`}
                  </td>
                  <td className="text-ev-muted">{w.assetClass}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
