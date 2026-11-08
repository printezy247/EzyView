import { useNavigate, useSearchParams } from "react-router";
import { useWorkspace } from "./store";
import { selectActiveSymbol } from "./store/selectors";
import { Watchlist } from "./Watchlist";
import { ScreenerTab } from "./ScreenerTab";
import { HeatmapTab } from "./HeatmapTab";
import { Button, Tabs } from "./ui";
import { SECTION_TABS } from "./sectionTabs";
import { resolveTabParam, writeTabParam } from "./tabUrl";

const { defaultTab, tabs: TABS } = SECTION_TABS.markets!;

/**
 * Markets destination: the watchlist manager (the chart's right-rail panel,
 * promoted to a page), plus a screener and a heatmap. Picking a row loads it
 * on the chart, like the panel does.
 *
 * The selected view lives in the URL, so a reload keeps it and the link can
 * be shared — the same contract the Research and Settings pages already use.
 */
export function MarketsPage() {
  const navigate = useNavigate();
  const symbol = useWorkspace(selectActiveSymbol);
  const [params, setParams] = useSearchParams();

  const tab = resolveTabParam(params.get("tab"), TABS.map((t) => t.id), defaultTab);

  const selectTab = (id: string) => {
    const query = writeTabParam(id, defaultTab);
    setParams(query === "" ? {} : { tab: id }, { replace: true });
  };

  return (
    <section aria-label="Markets" className="flex min-h-0 flex-1 flex-col text-base">
      <div className="flex shrink-0 items-center gap-1 border-b border-ev-raised px-3 py-1.5">
        <Tabs
          label="Market views"
          value={tab}
          onChange={selectTab}
          items={TABS.map((t) => ({ id: t.id, label: t.label, title: t.hint }))}
        />
        <span className="ml-auto flex items-center gap-2">
          <span className="text-dense text-ev-faint">{symbol}</span>
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
