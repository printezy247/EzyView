import { Crosshair, ListPlus, Plus, Trash2 } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { searchSymbolsForSource } from "./data";
import { subscribeQuote } from "./quotePoller";
import { useFeedHealth } from "./useFeedHealth";
import { activeChartOf } from "./layout";
import { effectiveSource, sourceLabel } from "./chartSource";
import { useMt5 } from "./mt5";
import { useWorkspace } from "./store";
import { selectActiveSymbol } from "./store/selectors";
import type { WatchEntry } from "./store";
import { watchRowActive } from "./store/watchlist";
import { VirtualList } from "./VirtualList";
import { Button, EmptyState, IconButton, Input } from "./ui";
import { sortWatch } from "./watchSort";
import type { WatchSortField } from "./watchSort";

interface Props {
  onOpenAlerts: () => void;
}

const WatchRow = memo(function WatchRow({
  item,
  active,
  onSelect,
  onRemove,
  feedSource,
}: {
  item: WatchEntry;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
  /** Which feed this row reads: its own, or the global one. */
  feedSource: string;
}) {
  const prevPriceRef = useRef<number | null>(item.price);
  // A row whose feed is failing shows the last known price as stale, so it
  // does not read as a live tick.
  const { status: feedStatus, message: feedMessage } = useFeedHealth(feedSource);
  const feedFailed = feedStatus === "failed";
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
    <div
      className={`group flex items-center gap-2 border-b border-ev-panel px-3 py-1.5 ${
        active ? "bg-ev-raised/40" : ""
      }`}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        aria-label={`Open ${item.description}`}
        title={`Open ${item.description}`}
        className="min-w-0 flex-1 justify-start text-left"
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
            {feedFailed && (
              <span className="ml-1 text-micro uppercase text-ev-warn" title={feedMessage ? `Feed unavailable: ${feedMessage}` : "Feed unavailable — this price is the last one received"}>
                stale
              </span>
            )}
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
      </Button>
      <IconButton
        label={`Remove ${item.ticker}`}
        size="sm"
        onClick={onRemove}
        className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
      >
        <Trash2 size={12} aria-hidden />
      </IconButton>
    </div>
  );
});

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
      <Button variant="ghost" size="sm" onClick={onSort} aria-label={`Sort by ${label}`} className="min-h-6 min-w-6 uppercase">

        {label}
        <span aria-hidden>{active ? (desc ? " ↓" : " ↑") : ""}</span>
      </Button>
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
  const invalidateFollowGlobalPrices = useWorkspace((s) => s.invalidateFollowGlobalPrices);
  const setSymbol = useWorkspace((s) => s.setSymbol);
  const activeSymbol = useWorkspace(selectActiveSymbol);
  const dataSourceChoice = useWorkspace((s) => activeChartOf(s.activeLayout()).dataSource);
  const globalFeed = useMt5((s) => s.source);
  const source = effectiveSource(dataSourceChoice, globalFeed);

  // The global feed switch moves every follow-global row to a new price
  // series: blank them so they never wear the old feed's numbers.
  useEffect(() => {
    invalidateFollowGlobalPrices();
  }, [globalFeed, invalidateFollowGlobalPrices]);

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
          // Bind to the row we subscribed for: a live adapter may echo a
          // normalised symbol (BTCUSDT) that matches no row.
          if (quote) updateWatchPrice(row.symbol, quote.last, quote.changePercent ?? null);
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
    // A row with no saved feed follows the global switch, so release any feed
    // the chart was pinned to instead of keeping a feed that may not know it.
    setSymbol(row.symbol, row.source ?? "auto");
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
          <Button variant="ghost" size="sm" title="Create alert for the active symbol" onClick={onOpenAlerts}>
            Alerts
          </Button>
          <IconButton label="Add the active chart's symbol" size="sm" onClick={() => void addFromActiveChart()}>
            <Crosshair size={13} aria-hidden />
          </IconButton>
          <IconButton label="Add symbol" size="sm" aria-expanded={adding} onClick={() => setAdding((v) => !v)}>
            <Plus size={13} aria-hidden />
          </IconButton>
        </div>
      </div>

      {adding && (
        <div className="border-b border-ev-raised px-2 py-1.5">
          <Input
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
          <EmptyState
            title="Watchlist is empty"
            body="Add the tickers you trade so the chart can jump to any of them in one click, and this list stays live."
            hint="Nothing is tracked until you add it — the chart itself works without a watchlist."
            icon={<ListPlus size={20} aria-hidden />}
            action={{ label: "Add a ticker", onSelect: () => setAdding(true) }}
          />
        ) : (
          <VirtualList
            items={sortedWatchlist}
            itemKey={(w) => w.symbol}
            estimateSize={46}
            className="min-h-0 flex-1 overflow-y-auto"
            ariaLabel="Watchlist"
            renderItem={(w) => (
              <WatchRow
                item={w}
                active={watchRowActive(w, activeSymbol, source, globalFeed)}
                onSelect={() => openSymbol(w)}
                onRemove={() => removeFromWatchlist(w.symbol)}
                feedSource={effectiveSource(w.source, globalFeed)}
              />
            )}
          />
        )}
      </div>
    </aside>
  );
}
