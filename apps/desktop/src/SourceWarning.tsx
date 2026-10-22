import { effectiveSource, orderWarning } from "./chartSource";
import type { DataSourceChoice } from "./chartSource";
import { useMt5 } from "./mt5";

/**
 * Non-blocking note shown next to order buttons: when MT5 takes the order but
 * the chart's price comes from another feed, the fill price will differ. Orders
 * stay allowed. The live region is always mounted so screen readers announce
 * the text when it appears.
 */
export function SourceWarning({ source, className = "" }: { source: DataSourceChoice | undefined; className?: string }) {
  const globalFeed = useMt5((s) => s.source);
  const text = orderWarning(effectiveSource(source, globalFeed), globalFeed === "mt5");
  return (
    <p role="status" aria-live="polite" className={text ? `text-dense text-ev-warn ${className}` : "sr-only"}>
      {text}
    </p>
  );
}
