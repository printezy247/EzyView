import { useEffect, useState } from "react";

import { Chip } from "./ui";
import { precisionFor, quoteOf } from "./data";
import { useMt5 } from "./mt5";
import { provenanceLabel, provenanceOf, provenanceTitle, provenanceTone } from "./provenance";
import type { Quote } from "@ezyview/data-adapters";

/**
 * The quote header: the symbol's last price, the change, and a chip saying
 * where the price came from.
 *
 * The chip is the point. A number on its own cannot be judged, and a demo
 * price that looks like a live one is the kind of thing that costs money. So
 * the header states the source: live, delayed, demo or cached.
 *
 * The quote is polled rather than pushed, because the app's feeds expose a
 * pull quote; a one-second poll is what the rest of the app already does.
 */
export function QuoteHeader({ symbol }: { symbol: string }) {
  const source = useMt5((s) => s.source);
  const status = useMt5((s) => s.status);
  const [quote, setQuote] = useState<Quote | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      void quoteOf(symbol).then((q) => {
        if (!cancelled) setQuote(q);
      });
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [symbol]);

  const ageSeconds = quote ? Math.floor(Date.now() / 1000) - quote.time : undefined;
  const provenance = provenanceOf({ source, status, ageSeconds });
  const digits = precisionFor(quote?.last ?? null);
  const up = (quote?.changePercent ?? 0) >= 0;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-baseline gap-1.5">
        <span className="num text-body font-semibold text-ev-strong">
          {quote ? quote.last.toFixed(digits) : "—"}
        </span>
        {quote && quote.changePercent !== undefined && (
          <span className={`num text-dense font-medium ${up ? "text-ev-up" : "text-ev-down"}`}>
            {up ? "+" : ""}
            {quote.changePercent.toFixed(2)}%
          </span>
        )}
      </div>
      <Chip tone={provenanceTone(provenance)} title={provenanceTitle(provenance)}>
        {provenanceLabel(provenance)}
      </Chip>
    </div>
  );
}
