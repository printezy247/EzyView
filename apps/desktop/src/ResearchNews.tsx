import { useMemo } from "react";
import { buildSources } from "@ezyview/fundamentals";
import { NewsTab, type Src } from "./FundamentalsTabs";
import { useApiKeys } from "./apiKeys";

/** The news view of the Research page, for the active symbol. */
export function ResearchNews({ symbol }: { symbol: string }) {
  const keys = useApiKeys((s) => s.keys);
  const src: Src = useMemo(() => ({ sources: buildSources(keys), version: String(Math.random()) }), [keys]);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <NewsTab symbol={symbol} src={src} />
    </div>
  );
}
