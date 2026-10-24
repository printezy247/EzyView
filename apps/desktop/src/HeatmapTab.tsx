import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { precisionFor, quoteOf } from "./data";
import { useWorkspace } from "./store";
import { market } from "./data";
import type { Quote, SymbolInfo } from "@ezyview/data-adapters";

type Scope = "all" | "crypto" | "forex" | "commodity" | "stock" | "index";

interface HeatTile {
  symbol: string;
  ticker: string;
  description: string;
  assetClass: string;
  price: number | null;
  changePct: number | null;
  precision: number;
}

const ASSET_LABELS: Record<Scope, string> = {
  all: "All Markets",
  crypto: "Crypto",
  forex: "Forex",
  commodity: "Commodities & Metals",
  stock: "Equities",
  index: "Indices",
};

/**
 * Investing.com-style visual market heatmap:
 * Tiles sized and color-graded by performance, with asset-class segmentation
 * and single-click routing to the chart.
 */
export function HeatmapTab() {
  const navigate = useNavigate();
  const watchlist = useWorkspace((s) => s.watchlist);
  const symbolKey = useWorkspace((s) => s.watchlistSymbolKey);
  const updateWatchPrice = useWorkspace((s) => s.updateWatchPrice);
  const setSymbol = useWorkspace((s) => s.setSymbol);

  const [mode, setMode] = useState<"universe" | "watchlist">("universe");
  const [filter, setFilter] = useState<Scope>("all");
  const [universeTiles, setUniverseTiles] = useState<HeatTile[]>([]);
  const [loading, setLoading] = useState(false);
  /** Why the universe could not be loaded, if it could not. */
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load universe symbols on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void market
      .searchSymbols("")
      .then((symbols: SymbolInfo[]) => {
        if (cancelled) return;
        const initial: HeatTile[] = symbols.map((s) => ({
          symbol: s.symbol,
          ticker: s.ticker,
          description: s.description,
          assetClass: s.assetClass,
          price: null,
          changePct: null,
          precision: s.precision,
        }));
        setUniverseTiles(initial);
        setLoading(false);
        setLoadError(null);

      // Fetch live/sim quotes for universe symbols
      void Promise.all(
        symbols.map((s) =>
          quoteOf(s.symbol)
            .then((q: Quote | null) => {
              if (cancelled || !q) return null;
              return { symbol: s.symbol, last: q.last, changePercent: q.changePercent ?? 0 };
            })
            .catch(() => null),
        ),
      ).then((quotes) => {
        if (cancelled) return;
        // A lookup table, not a scan: the old find-in-map was O(n^2) over the
        // whole universe on every refresh.
        const bySymbol = new Map<string, { last: number; changePercent: number }>();
        for (const q of quotes) {
          if (q) bySymbol.set(q.symbol, { last: q.last, changePercent: q.changePercent });
        }
        setUniverseTiles((prev) =>
          prev.map((tile) => {
            const found = bySymbol.get(tile.symbol);
            if (!found) return tile;
            return { ...tile, price: found.last, changePct: found.changePercent };
          }),
        );
      })
        .catch((err: unknown) => {
          // Without this the panel stayed on "Loading market heatmap…" for ever.
          if (cancelled) return;
          setLoading(false);
          setLoadError(err instanceof Error ? err.message : String(err));
        });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Poll watchlist quotes when on watchlist view
  useEffect(() => {
    if (mode !== "watchlist" || !symbolKey) return;
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
    const t = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [mode, symbolKey, updateWatchPrice]);

  const rawTiles: HeatTile[] = useMemo(() => {
    if (mode === "watchlist") {
      return watchlist.map((w) => ({
        symbol: w.symbol,
        ticker: w.ticker,
        description: w.description,
        assetClass: w.assetClass,
        price: w.price,
        changePct: w.changePct,
        precision: w.precision,
      }));
    }
    return universeTiles;
  }, [mode, watchlist, universeTiles]);

  const filteredTiles = useMemo(() => {
    if (filter === "all") return rawTiles;
    return rawTiles.filter((t) => {
      const cls = t.assetClass.toLowerCase();
      if (filter === "commodity") return cls.includes("commodity") || cls.includes("metal") || t.ticker.includes("XAU");
      if (filter === "stock") return cls.includes("stock") || cls.includes("equity");
      return cls.includes(filter);
    });
  }, [rawTiles, filter]);

  const maxAbs = useMemo(
    () => Math.max(1.5, ...filteredTiles.map((w) => Math.abs(w.changePct ?? 0))),
    [filteredTiles],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-ev-bg">
      {/* Header filter & scope bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ev-raised px-4 py-2">
        <div className="flex items-center gap-1.5">
          <div className="flex rounded border border-ev-line p-px">
            <button
              type="button"
              onClick={() => setMode("universe")}
              className={`rounded px-2.5 py-1 text-dense font-medium ${
                mode === "universe" ? "bg-ev-raised text-ev-strong" : "text-ev-muted hover:text-ev-strong"
              }`}
            >
              Market Universe
            </button>
            <button
              type="button"
              onClick={() => setMode("watchlist")}
              className={`rounded px-2.5 py-1 text-dense font-medium ${
                mode === "watchlist" ? "bg-ev-raised text-ev-strong" : "text-ev-muted hover:text-ev-strong"
              }`}
            >
              Watchlist ({watchlist.length})
            </button>
          </div>

          <div className="mx-1 h-4 w-px bg-ev-raised" />

          {/* Sector filters */}
          <div className="flex flex-wrap items-center gap-1">
            {(Object.keys(ASSET_LABELS) as Scope[]).map((scopeKey) => (
              <button
                key={scopeKey}
                type="button"
                onClick={() => setFilter(scopeKey)}
                className={`rounded px-2 py-0.5 text-dense ${
                  filter === scopeKey
                    ? "bg-ev-accent text-white font-medium"
                    : "text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
                }`}
              >
                {ASSET_LABELS[scopeKey]}
              </button>
            ))}
          </div>
        </div>

        <span className="text-dense text-ev-faint">
          {filteredTiles.length} instruments · Click tile to chart
        </span>
      </div>

      {/* Heatmap visualization grid */}
      <div className="flex min-h-0 flex-1 flex-wrap content-start gap-2 overflow-y-auto p-4">
        {loading && universeTiles.length === 0 ? (
          <div role="status" className="flex flex-1 items-center justify-center p-8 text-base text-ev-muted">
            Loading market heatmap…
          </div>
        ) : loadError ? (
          <div role="alert" className="flex flex-1 items-center justify-center p-8">
            <p className="max-w-sm rounded border border-ev-down/40 bg-ev-panel px-3 py-2 text-center text-base text-ev-down-text">
              Could not load the market heatmap: {loadError}
            </p>
          </div>
        ) : filteredTiles.length === 0 ? (
          <p className="p-4 text-base text-ev-faint">No market instruments match the active filter.</p>
        ) : (
          filteredTiles.map((tile) => {
            const pct = tile.changePct ?? 0;
            const weight = Math.min(1, Math.abs(pct) / maxAbs);
            const digits = tile.precision ?? precisionFor(tile.price);

            // Tiered color grading, from the theme tokens so Tokyo Night and
            // the light theme stay in step with the rest of the app.
            let tileBg = "var(--ev-raised)";
            let textColor = "text-ev-text";

            if (pct > 0.05) {
              if (pct >= 3.0) tileBg = "var(--ev-up)";
              else if (pct >= 1.0) tileBg = "color-mix(in srgb, var(--ev-up) 75%, transparent)";
              else tileBg = "color-mix(in srgb, var(--ev-up) 40%, transparent)";
              textColor = "text-white";
            } else if (pct < -0.05) {
              if (pct <= -3.0) tileBg = "var(--ev-down)";
              else if (pct <= -1.0) tileBg = "color-mix(in srgb, var(--ev-down) 75%, transparent)";
              else tileBg = "color-mix(in srgb, var(--ev-down) 40%, transparent)";
              textColor = "text-white";
            }

            // Sizing: tiles scale dynamically with move weight
            const flexGrow = Math.round(1 + weight * 2.5);

            return (
              <button
                key={tile.symbol}
                type="button"
                onClick={() => {
                  setSymbol(tile.symbol);
                  navigate("/chart");
                }}
                className={`flex flex-col justify-between rounded border border-white/10 p-3 text-left transition hover:scale-[1.01] hover:brightness-110 shadow-sm ${textColor}`}
                style={{
                  flex: `${flexGrow} 1 10rem`,
                  minHeight: "5.5rem",
                  backgroundColor: tileBg,
                }}
                title={`${tile.description} (${tile.symbol})\nPrice: ${
                  tile.price !== null ? tile.price.toFixed(digits) : "—"
                }\nChange: ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}
              >
                <div className="flex items-baseline justify-between gap-1">
                  <span className="font-bold tracking-tight text-base">{tile.ticker}</span>
                  <span className="text-micro opacity-75 uppercase">{tile.assetClass}</span>
                </div>
                <div className="flex items-baseline justify-between gap-1">
                  <span className="num text-dense opacity-90">
                    {tile.price !== null ? tile.price.toFixed(digits) : "—"}
                  </span>
                  <span className="num font-bold text-base">
                    {tile.changePct === null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
