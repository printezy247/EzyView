import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";

import { Chip, IconButton } from "./ui";
import { effectiveSource, isLiveSourceChoice } from "./chartSource";
import type { DataSourceChoice } from "./chartSource";
import { isLivePublicSymbol } from "./data";
import { precisionForSymbol } from "./pricePrecision";
import { useQuote } from "./quotePoller";
import { useFeedHealth } from "./useFeedHealth";
import { useMt5 } from "./mt5";
import { useWorkspace } from "./store";
import { provenanceLabel, provenanceOf, provenanceTitle, provenanceTone } from "./provenance";

/**
 * The quote header: the symbol's last price, the change, and a chip saying
 * where the price came from.
 *
 * The chip is the point. A number on its own cannot be judged, and a demo
 * price that looks like a live one is the kind of thing that costs money. So
 * the header states the source: live, delayed, demo or cached.
 *
 * The quote comes from the shared per-symbol poller, so the header, legend and
 * ticket on the same chart cost one request between them.
 */
export function QuoteHeader({ symbol, dataSource }: { symbol: string; dataSource?: DataSourceChoice }) {
  const source = useMt5((s) => s.source);
  const status = useMt5((s) => s.status);
  // Replay pauses only the replaying symbol; every other header keeps ticking.
  const replaySymbol = useWorkspace((s) => s.replaySymbol);
  const paused = replaySymbol !== null && replaySymbol === symbol;
  const { quote } = useQuote(symbol, { source: dataSource, intervalMs: 1000, enabled: !paused });
  // A provider that is failing must not leave the last price looking live.
  const effective = effectiveSource(dataSource, source);
  const watched = useWorkspace((s) => s.watchlist.some((w) => w.symbol === symbol));
  const addToWatchlist = useWorkspace((s) => s.addToWatchlist);
  const removeFromWatchlist = useWorkspace((s) => s.removeFromWatchlist);

  const toggleWatched = () => {
    if (watched) {
      removeFromWatchlist(symbol);
      return;
    }
    // Instant: pin what the header shows, including the feed it is reading.
    addToWatchlist({
      symbol,
      ticker: symbol.split(":").pop() ?? symbol,
      description: symbol,
      assetClass: "",
      precision: precisionForSymbol(symbol, quote?.last ?? null),
      price: quote?.last ?? null,
      changePct: quote?.changePercent ?? null,
      source: effective,
    });
  };
  const { status: feedStatus, message: feedMessage } = useFeedHealth(effective);
  const feedFailed = feedStatus === "failed";
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevLastRef = useRef<number | null>(null);

  useEffect(() => {
    prevLastRef.current = null;
  }, [symbol]);

  useEffect(() => {
    if (!quote) return;
    const prev = prevLastRef.current;
    if (prev !== null && quote.last !== prev) setFlash(quote.last > prev ? "up" : "down");
    prevLastRef.current = quote.last;
  }, [quote]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(t);
  }, [flash]);

  const ageSeconds = quote ? Math.floor(Date.now() / 1000) - quote.time : undefined;
  const baseProvenance = provenanceOf({
    source: dataSource === "mt5" ? "mt5" : dataSource === "demo" ? "ezyview" : source,
    status,
    ageSeconds,
    feedFailed,
  });
  const provenance =
    isLiveSourceChoice(dataSource ?? "auto") && quote
      ? "live"
      : baseProvenance === "demo" && isLivePublicSymbol(symbol)
        ? "live"
        : baseProvenance;
  const digits = precisionForSymbol(symbol, quote?.last ?? null);
  const up = (quote?.changePercent ?? 0) >= 0;

  return (
    <div className="flex items-center gap-2">
      <IconButton
        label={watched ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
        size="sm"
        onClick={toggleWatched}
      >
        <Star size={13} aria-hidden fill={watched ? "currentColor" : "none"} />
      </IconButton>
      <div className={`flex items-baseline gap-1.5 rounded px-1 transition-colors ${flash === "up" ? "flash-up" : flash === "down" ? "flash-down" : ""}`}>
        <span className="num text-body font-semibold text-ev-strong" data-volatile="price">
          {quote ? quote.last.toFixed(digits) : "—"}
        </span>
        {quote && quote.changePercent !== undefined && (
          <span className={`num text-dense font-medium ${up ? "text-ev-up-text" : "text-ev-down-text"}`} data-volatile="price">
            {up ? "+" : ""}
            {quote.changePercent.toFixed(2)}%
          </span>
        )}
      </div>
      <Chip tone={provenanceTone(provenance)} title={feedMessage ? `${provenanceTitle(provenance)} — ${feedMessage}` : provenanceTitle(provenance)}>
        {provenanceLabel(provenance)}
      </Chip>
    </div>
  );
}
