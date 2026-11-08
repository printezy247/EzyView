import { Suspense, lazy } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { SECTION_TABS } from "./sectionTabs";
import { resolveTabParam } from "./tabUrl";
import type { JournalTabId } from "./JournalPanel";

const JournalPanel = lazy(() => import("./JournalPanel").then((m) => ({ default: m.JournalPanel })));

const { defaultTab, tabs: TABS } = SECTION_TABS.journal!;

/**
 * Trading journal as a full-page destination; Close returns to the chart.
 *
 * The selected view lives in the URL, so a reload keeps it and the link can
 * be shared — "here is my Stats for the month" is a link worth sending.
 */
export function JournalPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const tab = resolveTabParam(
    params.get("tab"),
    TABS.map((t) => t.id),
    defaultTab,
  ) as JournalTabId;

  const selectTab = (next: JournalTabId) => {
    setParams(next === defaultTab ? {} : { tab: next }, { replace: true });
  };

  return (
    <Suspense fallback={<div role="status" className="p-6 text-base text-ev-muted">Loading…</div>}>
      <JournalPanel onClose={() => navigate("/chart")} tab={tab} onTabChange={selectTab} />
    </Suspense>
  );
}
