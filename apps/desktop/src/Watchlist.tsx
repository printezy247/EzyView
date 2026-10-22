import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { quoteOf, searchSymbols } from "./data";
import { useWorkspace } from "./store";
import type { WatchEntry } from "./store";

interface Props {
  onOpenAlerts: () => void;
}

function WatchRow({
  item,
  onSelect,
  onRemove,
}: {
  item: WatchEntry;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const prevPriceRef = useRef<number | null>(item.price);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (prevPriceRef.current !== null && item.price !== null && item.price !== prevPriceRef.current) {
      setFlash(item.price > prevPriceRef.current ? "up" : "down");
    }
    prevPriceRef.current = item.price;
  }, [item.price]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(t);
  }, [flash]);

  return (
    <li className="group flex items-center gap-2 border-b border-ev-panel px-3 py-1.5">
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 text-left"
        title={`Open ${item.description}`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-base font-medium text-ev-strong">{item.ticker}</span>
          <span
            className={`shrink-0 rounded px-1 text-base num text-ev-text transition-colors ${
              flash === "up" ? "flash-up" : flash === "down" ? "flash-down" : ""
            }`}
          >
            {item.price === null ? "—" : item.price.toFixed(item.precision)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-dense text-ev-faint">{item.assetClass}</span>
          <span
            className={
              item.changePct === null
                ? "text-dense text-ev-faint"
                : item.changePct >= 0
                  ? "text-dense num text-ev-up"
                  : "text-dense num text-ev-down"
            }
          >
            {item.changePct === null ? "—" : `${item.changePct >= 0 ? "+" : ""}${item.changePct.toFixed(2)}%`}
          </span>
        </div>
      </button>
      <button
        type="button"
        title={`Remove ${item.ticker}`}
        onClick={onRemove}
        className="text-ev-line opacity-0 transition-opacity hover:text-ev-down focus-visible:opacity-100 focus-visible:text-ev-down group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <Trash2 size={12} aria-hidden />
      </button>
    </li>
  );
}

/**
 * Right-hand watchlist panel.
 *
 * Polls the active feed's quotes on a slow tick. Keyed on the memoized symbol
 * key in zustand so price updates do not trigger O(N) allocations or reset intervals.
 */
export function Watchlist({ onOpenAlerts }: Props) {
  const watchlist = useWorkspace((s) => s.watchlist);
  const symbolKey = useWorkspace((s) => s.watchlistSymbolKey);
  const isReplay = useWorkspace((s) => s.replayBar !== null);
  const addToWatchlist = useWorkspace((s) => s.addToWatchlist);
  const removeFromWatchlist = useWorkspace((s) => s.removeFromWatchlist);
  const updateWatchPrice = useWorkspace((s) => s.updateWatchPrice);
  const setSymbol = useWorkspace((s) => s.setSymbol);

  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!adding) return;
    setQuery("");
  }, [adding]);

  // The search debounce must not outlive the panel.
  useEffect(
    () => () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!symbolKey || isReplay) return;
    const symbols = symbolKey.split(",");
    let cancelled = false;

    const tick = () => {
      void Promise.all(symbols.map((s) => quoteOf(s).catch(() => null))).then((quotes) => {
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
  }, [symbolKey, isReplay, updateWatchPrice]);

  const addFromQuery = async (targetQuery = query) => {
    const trimmed = targetQuery.trim();
    if (!trimmed) return;
    const found = await searchSymbols(trimmed);
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
    setQuery("");
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      // Pre-warm search without committing
      if (val.trim()) void searchSymbols(val.trim());
    }, 250);
  };

  return (
    <aside aria-label="Watchlist" className="flex w-full min-w-0 flex-1 flex-col bg-ev-bg">
      <div className="flex items-center justify-between border-b border-ev-raised px-3 py-2">
        <h2 className="text-base font-semibold uppercase tracking-wider text-ev-muted">Watchlist</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Create alert for the active symbol"
            onClick={onOpenAlerts}
            className="rounded px-1.5 py-0.5 text-dense text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
          >
            Alerts
          </button>
          <button
            type="button"
            title="Add symbol"
            onClick={() => setAdding((v) => !v)}
            className="flex size-6 items-center justify-center rounded text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
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
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addFromQuery();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="Ticker, then Enter"
            className="w-full rounded bg-ev-panel px-2 py-1 text-base text-ev-strong outline-none placeholder:text-ev-muted"
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {watchlist.length === 0 ? (
          <p className="px-3 py-6 text-base leading-relaxed text-ev-faint">
            Watchlist is empty. Click <span className="text-ev-muted">+</span> and type a ticker to add one.
          </p>
        ) : (
          <ul>
            {watchlist.map((w) => (
              <WatchRow
                key={w.symbol}
                item={w}
                onSelect={() => setSymbol(w.symbol)}
                onRemove={() => removeFromWatchlist(w.symbol)}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
