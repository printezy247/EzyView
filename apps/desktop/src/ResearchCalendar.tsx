import { useMemo } from "react";
import { buildSources } from "@ezyview/fundamentals";
import { CalendarTab, EarningsTab, type Src } from "./FundamentalsTabs";
import { useApiKeys } from "./apiKeys";

/**
 * The calendar view of the Research page: economic events, plus the earnings
 * dates for the active symbol. Reuses the panel's tab components so the
 * calendar stays one implementation, not two.
 */
export function ResearchCalendar({ symbol }: { symbol: string }) {
  const keys = useApiKeys((s) => s.keys);
  // A fresh source bundle per key set, mirroring FundamentalsPanel; the version
  // string is what the tab's cache keys are invalidated on.
  const src: Src = useMemo(() => ({ sources: buildSources(keys), version: String(Math.random()) }), [keys]);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <EarningsTab symbol={symbol} src={src} />
      <CalendarTab src={src} />
    </div>
  );
}
