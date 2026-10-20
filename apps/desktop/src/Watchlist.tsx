import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { market, searchSymbols } from "./data";
import { useWorkspace } from "./store";
import type { WatchEntry } from "./store";

interface Props {
  onOpenAlerts: () => void;
}

/**
 * Right-hand watchlist panel.
 *
 * Polls the market adapter's quotes on a slow tick. A real feed would push
 * instead, but the polling loop keeps the panel independent of feed plumbing.
 */
export function Watchlist({ onOpenAlerts }: Props) {
  const watchlist = useWorkspace((s) => s.watchlist);
  const addToWatchlist = useWorkspace((s) => s.addToWatchlist);
  const removeFromWatchlist = useWorkspace((s) => s.removeFromWatchlist);
  const updateWatchPrice = useWorkspace((s) => s.updateWatchPrice);
  const updateActive = useWorkspace((s) => s.updateActive);

  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!adding) return;
    setQuery("");
  }, [adding]);

  useEffect(() => {
    if (watchlist.length === 0) return;
    const symbols = watchlist.map((w) => w.symbol);
    let cancelled = false;

    const tick = () => {
      void Promise.all(symbols.map((s) => market.getQuote(s))).then((quotes) => {
        if (cancelled) return;
        quotes.forEach((q) => {
          if (q) updateWatchPrice(q.symbol, q.last, q.changePercent ?? null);
        });
      });
    };

    tick();
    const t = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [watchlist, updateWatchPrice]);

  const addFromQuery = async () => {
    const found = await searchSymbols(query);
    const first = found[0];
    if (!first) return;
    const entry: WatchEntry = {
      symbol: first.symbol,
      ticker: first.ticker,
      description: first.description,
      assetClass: first.assetClass,
      precision: first.precision,
      price: null,
      changePct: null,
    };
    addToWatchlist(entry);
    setAdding(false);
  };

  return (
    <aside aria-label="Watchlist" className="flex w-56 shrink-0 flex-col border-l border-ev-raised bg-ev-bg">
      <div className="flex items-center justify-between border-b border-ev-raised px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ev-muted">Watchlist</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Create alert for the active symbol"
            onClick={onOpenAlerts}
            className="rounded px-1.5 py-0.5 text-[11px] text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
          >
            Alerts
          </button>
          <button
            type="button"
            title="Add symbol"
            onClick={() => setAdding((v) => !v)}
            className="flex size-5 items-center justify-center rounded text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
          >
            <Plus size={13} aria-hidden />
          </button>
        </div>
      </div>

      {adding && (
        <div className="border-b border-ev-raised px-2 py-1.5">
          <input
            aria-label="Add symbol to watchlist"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addFromQuery();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="Ticker, then Enter"
            className="w-full rounded bg-ev-panel px-2 py-1 text-xs text-ev-strong outline-none placeholder:text-ev-muted"
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {watchlist.length === 0 ? (
          <p className="px-3 py-6 text-xs leading-relaxed text-ev-faint">
            Watchlist is empty. Click <span className="text-ev-muted">+</span> and type a ticker to add one.
          </p>
        ) : (
          <ul>
            {watchlist.map((w) => (
              <li key={w.symbol} className="group flex items-center gap-2 border-b border-ev-panel px-3 py-1.5">
                <button
                  type="button"
                  onClick={() => updateActive({ symbol: w.symbol })}
                  className="min-w-0 flex-1 text-left"
                  title={`Open ${w.description}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs font-medium text-ev-strong">{w.ticker}</span>
                    <span className="shrink-0 text-xs tabular-nums text-ev-text">
                      {w.price === null ? "—" : w.price.toFixed(w.precision)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[11px] text-ev-faint">{w.assetClass}</span>
                    <span
                      className={
                        w.changePct === null
                          ? "text-[11px] text-ev-faint"
                          : w.changePct >= 0
                            ? "text-[11px] tabular-nums text-ev-up"
                            : "text-[11px] tabular-nums text-ev-down"
                      }
                    >
                      {w.changePct === null ? "—" : `${w.changePct >= 0 ? "+" : ""}${w.changePct.toFixed(2)}%`}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  title={`Remove ${w.ticker}`}
                  onClick={() => removeFromWatchlist(w.symbol)}
                  className="text-ev-line opacity-0 transition-opacity hover:text-ev-down group-hover:opacity-100"
                >
                  <Trash2 size={12} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
