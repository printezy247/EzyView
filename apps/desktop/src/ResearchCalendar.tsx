import { useMemo, useState } from "react";
import { buildSources } from "@ezyview/fundamentals";
import { CalendarTab, DividendsTab, EarningsTab, type Src } from "./FundamentalsTabs";
import { useApiKeys } from "./apiKeys";

type CalendarSection = "calendar" | "earnings" | "dividends";

/**
 * The calendar view of the Research page: economic events, the earnings dates
 * for the active symbol, and its dividend history.
 */
export function ResearchCalendar({ symbol }: { symbol: string }) {
  const keys = useApiKeys((s) => s.keys);
  const [activeTab, setActiveTab] = useState<CalendarSection>("calendar");
  // A fresh source bundle per key set, mirroring FundamentalsPanel; the version
  // string is what the tab's cache keys are invalidated on.
  const src: Src = useMemo(() => ({ sources: buildSources(keys), version: String(Math.random()) }), [keys]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-ev-bg">
      <div className="flex shrink-0 items-center gap-1 border-b border-ev-raised px-3 py-1.5">
        <button
          type="button"
          onClick={() => setActiveTab("calendar")}
          className={`rounded px-2.5 py-1 text-dense font-medium ${
            activeTab === "calendar" ? "bg-ev-raised text-ev-strong" : "text-ev-muted hover:text-ev-strong"
          }`}
        >
          Economic Calendar
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("earnings")}
          className={`rounded px-2.5 py-1 text-dense font-medium ${
            activeTab === "earnings" ? "bg-ev-raised text-ev-strong" : "text-ev-muted hover:text-ev-strong"
          }`}
        >
          Earnings ({symbol})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("dividends")}
          className={`rounded px-2.5 py-1 text-dense font-medium ${
            activeTab === "dividends" ? "bg-ev-raised text-ev-strong" : "text-ev-muted hover:text-ev-strong"
          }`}
        >
          Dividends ({symbol})
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {activeTab === "calendar" && <CalendarTab src={src} />}
        {activeTab === "earnings" && <EarningsTab symbol={symbol} src={src} />}
        {activeTab === "dividends" && <DividendsTab symbol={symbol} src={src} />}
      </div>
    </div>
  );
}
