import { useState } from "react";
import { useNavigate } from "react-router";
import { activeChartOf } from "./layout";
import { useWorkspace } from "./store";
import { Watchlist } from "./Watchlist";
import { ScreenerTab } from "./ScreenerTab";
import { HeatmapTab } from "./HeatmapTab";
import { Button } from "./ui";

type Tab = "watchlists" | "screener" | "heatmap";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "watchlists", label: "Watchlists", hint: "Quotes for the symbols you track" },
  { id: "screener", label: "Screener", hint: "Filter the market on price and change" },
  { id: "heatmap", label: "Heatmap", hint: "Performance at a glance, sized by move" },
];

/**
 * Markets destination: the watchlist manager (the chart's right-rail panel,
 * promoted to a page), plus a screener and a heatmap. Picking a row loads it
 * on the chart, like the panel does.
 */
export function MarketsPage() {
  const navigate = useNavigate();
  const layout = useWorkspace((s) => s.activeLayout());
  const state = activeChartOf(layout);
  const [tab, setTab] = useState<Tab>("watchlists");

  return (
    <section aria-label="Markets" className="flex min-h-0 flex-1 flex-col text-base">
      <div role="tablist" aria-label="Market views" className="flex shrink-0 items-center gap-1 border-b border-ev-raised px-3 py-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            title={t.hint}
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? "rounded bg-ev-raised px-2.5 py-1 text-dense font-medium text-ev-strong"
                : "rounded px-2.5 py-1 text-dense text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
            }
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-2">
          <span className="text-dense text-ev-faint">{state.symbol}</span>
          <Button variant="outline" size="sm" onClick={() => navigate("/chart")}>
            Back to chart
          </Button>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === "watchlists" && (
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <Watchlist onOpenAlerts={() => navigate("/alerts")} />
          </div>
        )}
        {tab === "screener" && <ScreenerTab />}
        {tab === "heatmap" && <HeatmapTab />}
      </div>
    </section>
  );
}
