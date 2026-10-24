import { Crosshair, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { searchSymbolsForSource } from "./data";
import { subscribeQuote } from "./quotePoller";
import { activeChartOf } from "./layout";
import { effectiveSource, sourceLabel } from "./chartSource";
import { useMt5 } from "./mt5";
import { useWorkspace } from "./store";
import type { WatchEntry } from "./store";
import { sortWatch } from "./watchSort";
import type { WatchSortField } from "./watchSort";

interface Props {
  onOpenAlerts: () => void;
}

function WatchRow({
  item,
  active,
  onSelect,
  onRemove,
}: {
  item: WatchEntry;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const prevPriceRef = useRef<number | null>(item.price);
  // `n` changes on every tick, so the CSS animation restarts (via key) and the
  // timer is re-armed even when the price moves the same way twice in a row.
  const [flash, setFlash] = useState<{ dir: "up" | "down"; n: number } | null>(null);

  useEffect(() => {
    if (prevPriceRef.current !== null && item.price !== null && item.price !== prevPriceRef.current) {
      const dir = item.price > prevPriceRef.current ? "up" : "down";
      setFlash((f) => ({ dir, n: (f?.n ?? 0) + 1 }));
    }
    prevPriceRef.current = item.price;
  }, [item.price]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(t);
  }, [flash]);

  return (
    <li
      className={`group flex items-center gap-2 border-b border-ev-panel px-3 py-1.5 ${
        active ? "bg-ev-raised/40" : ""
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className={`min-w-0 flex-1 text-left ${active ? "border-l-2 border-ev-accent pl-1.5" : ""}`}
        title={`Open ${item.description}`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-base font-medium text-ev-strong">{item.ticker}</span>
          <span
            key={flash?.n ?? 0}
            className={`shrink-0 rounded px-1 text-base num text-ev-text transition-colors ${
              flash?.dir === "up" ? "flash-up" : flash?.dir === "down" ? "flash-down" : ""
            }`}
          >
            {flash && <span aria-hidden>{flash.dir === "up" ? "▲ " : "▼ "}</span>}
            {item.price === null ? "—" : item.price.toFixed(item.precision)}
            {flash && <span className="sr-only">{flash.dir === "up" ? " rising" : " falling"}</span>}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-dense text-ev-faint">
            {item.assetClass}
            {item.source ? ` · ${sourceLabel(item.source)}` : ""}
          </span>
          <span
            className={
              item.changePct === null
                ? "text-dense text-ev-faint"
                : item.changePct >= 0
                  ? "text-dense num text-ev-up-text"
                  : "text-dense num text-ev-down-text"
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
        className="text-ev-line opacity-0 transition-opacity hover:text-ev-down-text focus-visible:opacity-100 focus-visible:text-ev-down-text group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <Trash2 size={12} aria-hidden />
      </button>
    </li>
  );
}

function SortHead({
  label,
  field,
  current,
  desc,
  onSort,
}: {
  label: string;
  field: WatchSortField;
  current: WatchSortField;
  desc: boolean;
  onSort: () => void;
}) {
  const active = current === field;
  return (
    <div role="columnheader" aria-sort={active ? (desc ? "descending" : "ascending") : "none"}>
      <button
        type="button"
        onClick={onSort}
        className="min-h-6 min-w-6 cursor-pointer px-1 uppercase hover:text-ev-strong"
      >
        {label}
        <span aria-hidden>{active ? (desc ? " ↓" : " ↑") : ""}</span>
      </button>
    </div>
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
  const quoteKey = useWorkspace((s) => s.watchlistQuoteKey);
  const isReplay = useWorkspace((s) => s.replayBar !== null);
  const addToWatchlist = useWorkspace((s) => s.addToWatchlist);
  const removeFromWatchlist = useWorkspace((s) => s.removeFromWatchlist);
  const updateWatchPrice = useWorkspace((s) => s.updateWatchPrice);
  const setSymbol = useWorkspace((s) => s.setSymbol);
  const activeSymbol = useWorkspace((s) => activeChartOf(s.activeLayout()).symbol);
  const dataSourceChoice = useWorkspace((s) => activeChartOf(s.activeLayout()).dataSource);
  const globalFeed = useMt5((s) => s.source);
  const source = effectiveSource(dataSourceChoice, globalFeed);

  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [sortField, setSortField] = useState<WatchSortField>("none");
  const [sortDesc, setSortDesc] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sortedWatchlist = useMemo(() => sortWatch(watchlist, sortField, sortDesc), [watchlist, sortField, sortDesc]);

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
    if (!quoteKey || isReplay) return;
    // Each row joins the shared poller with the feed it was saved on, so a
    // chart and the watchlist showing the same instrument cost one request,
    // and an MT5 row never asks the demo feed for a bare broker ticker.
    const rows = useWorkspace.getState().watchlist;
    const stops = rows.map((row) =>
      subscribeQuote(
        row.symbol,
        (quote) => {
          if (quote) updateWatchPrice(quote.symbol, quote.last, quote.changePercent ?? null);
        },
        { intervalMs: 3000, ...(row.source ? { source: row.source } : {}) },
      ),
    );
    return () => {
      for (const stop of stops) stop();
    };
  }, [quoteKey, isReplay, updateWatchPrice]);

  const toggleSort = (field: Exclude<WatchSortField, "none">, firstDesc: boolean) => {
    if (sortField === field) setSortDesc((d) => !d);
    else {
      setSortField(field);
      setSortDesc(firstDesc);
    }
  };

  const addFromQuery = async (targetQuery = query) => {
    const trimmed = targetQuery.trim();
    if (!trimmed) return;
    const found = await searchSymbolsForSource(trimmed, source);
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
      source,
    };
    addToWatchlist(entry);
    setAdding(false);
    setQuery("");
  };

  /** Pin the focused chart's instrument, including the feed it is reading. */
  const addFromActiveChart = async () => {
    const chart = useWorkspace.getState().activeChart();
    const chartSource = effectiveSource(chart.dataSource, useMt5.getState().source);
    const found = await searchSymbolsForSource(chart.symbol, chartSource);
    const info = found.find((s) => s.symbol === chart.symbol) ?? found[0];
    addToWatchlist({
      symbol: chart.symbol,
      ticker: info?.ticker ?? chart.symbol.split(":").pop() ?? chart.symbol,
      description: info?.description ?? chart.symbol,
      assetClass: info?.assetClass ?? "",
      precision: info?.precision ?? 2,
      price: null,
      changePct: null,
      source: chartSource,
    });
  };

  const openSymbol = (row: WatchEntry) => {
    if (row.source) setSymbol(row.symbol, row.source);
    else setSymbol(row.symbol);
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      // Pre-warm search against the active feed without committing.
      if (val.trim()) void searchSymbolsForSource(val.trim(), source);
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
            className="min-h-6 rounded px-1.5 py-0.5 text-dense text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
          >
            Alerts
          </button>
          <button
            type="button"
            title="Add the active chart's symbol"
            aria-label="Add the active chart's symbol"
            onClick={() => void addFromActiveChart()}
            className="flex size-6 items-center justify-center rounded text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
          >
            <Crosshair size={13} aria-hidden />
          </button>
          <button
            type="button"
            title="Add symbol"
            aria-label="Add symbol"
            aria-expanded={adding}
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

      {watchlist.length > 0 && (
        <div role="table" aria-label="Watchlist sort">
          <div
            role="row"
            className="flex items-center justify-between border-b border-ev-raised bg-ev-panel px-3 py-1 text-micro font-semibold uppercase tracking-wider text-ev-faint"
          >
            <SortHead label="Symbol" field="symbol" current={sortField} desc={sortDesc} onSort={() => toggleSort("symbol", false)} />
            <div className="flex items-center gap-4">
              <SortHead label="Last" field="price" current={sortField} desc={sortDesc} onSort={() => toggleSort("price", true)} />
              <SortHead label="Chg%" field="change" current={sortField} desc={sortDesc} onSort={() => toggleSort("change", true)} />
            </div>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {watchlist.length === 0 ? (
          <p className="px-3 py-6 text-base leading-relaxed text-ev-faint">
            Watchlist is empty. Click <span className="text-ev-muted">+</span> and type a ticker to add one.
          </p>
        ) : (
          <ul>
            {sortedWatchlist.map((w) => (
              <WatchRow
                key={w.symbol}
                item={w}
                active={w.symbol === activeSymbol}
                onSelect={() => openSymbol(w)}
                onRemove={() => removeFromWatchlist(w.symbol)}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
