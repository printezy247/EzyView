import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { quoteOf } from "./data";
import { useWorkspace } from "./store";
import { themeColors } from "@ezyview/brand";

/**
 * Heatmap: one tile per watched symbol, coloured by percent change and sized
 * by the size of the move. Sizing by move (rather than by market cap) is what
 * the quotes the app has can honestly support.
 */
export function HeatmapTab() {
  const navigate = useNavigate();
  const watchlist = useWorkspace((s) => s.watchlist);
  const updateWatchPrice = useWorkspace((s) => s.updateWatchPrice);
  const updateActive = useWorkspace((s) => s.updateActive);
  const appTheme = useWorkspace((s) => s.appTheme);
  const chartTheme = useWorkspace((s) => s.activeLayout().charts[0]?.theme ?? "dark");
  const theme = appTheme === "auto" ? chartTheme : appTheme;
  const symbolKey = watchlist.map((w) => w.symbol).join(",");

  useEffect(() => {
    if (!symbolKey) return;
    let cancelled = false;
    const symbols = symbolKey.split(",");
    const tick = () => {
      void Promise.all(symbols.map((s) => quoteOf(s).catch(() => null))).then((quotes) => {
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

  // Tile weight: change magnitude, floored so a flat market still fills the grid.
  const maxAbs = useMemo(
    () => Math.max(1, ...watchlist.map((w) => Math.abs(w.changePct ?? 0))),
    [watchlist],
  );
  const colors = themeColors(theme);

  if (watchlist.length === 0) {
    return <p className="p-3 text-base text-ev-faint">Add symbols to the watchlist to see a heatmap.</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-wrap content-start gap-1.5 overflow-y-auto p-3">
      {watchlist.map((w) => {
        const pct = w.changePct ?? 0;
        const up = pct >= 0;
        const weight = Math.abs(pct) / maxAbs;
        // Grow with the move but never collapse below a legible tile.
        const grow = 1 + weight * 3;
        const bg = up ? colors.up : colors.down;
        return (
          <button
            key={w.symbol}
            type="button"
            onClick={() => {
              updateActive({ symbol: w.symbol });
              navigate("/chart");
            }}
            className="flex flex-col justify-between rounded border border-ev-line p-2 text-left text-white transition hover:brightness-110"
            style={{
              flex: `${grow} 1 8rem`,
              minHeight: `${3 + weight * 4}rem`,
              backgroundColor: `color-mix(in srgb, ${bg} ${30 + weight * 55}%, transparent)`,
            }}
            title={`${w.description} — ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}
          >
            <span className="text-base font-semibold">{w.ticker}</span>
            <span className="num text-body font-medium">
              {w.changePct === null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
