import { useEffect, useState } from "react";
import type { Quote } from "@ezyview/data-adapters";
import { quoteOf } from "./data";
import { useWorkspace } from "./store";

interface Props {
  symbol: string;
  precision: number;
}

interface Level {
  price: number;
  size: number;
  /** Cumulative size from the best price inward, used for the depth bar. */
  cum: number;
}

/**
 * Depth of market panel with visual volume bars and spread telemetry.
 */
export function DepthOfMarket({ symbol, precision }: Props) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const isReplay = useWorkspace((s) => s.replayBar !== null);

  useEffect(() => {
    if (isReplay) return;
    let cancelled = false;
    const tick = () => {
      void quoteOf(symbol)
        .catch(() => null)
        .then((q) => {
          if (!cancelled) setQuote(q);
        });
    };
    tick();
    const t = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [symbol, isReplay]);

  const mid = quote?.last ?? null;
  const asks = mid === null ? [] : buildLadder(mid, precision, "ask");
  const bids = mid === null ? [] : buildLadder(mid, precision, "bid");
  const maxCum = Math.max(1, ...asks.map((a) => a.cum), ...bids.map((b) => b.cum));
  const maxSize = Math.max(0.1, ...asks.map((a) => a.size), ...bids.map((b) => b.size));

  const totalBidVol = bids.reduce((acc, b) => acc + b.size, 0);
  const totalAskVol = asks.reduce((acc, a) => acc + a.size, 0);
  const totalBookVol = totalBidVol + totalAskVol;
  const bidRatio = totalBookVol > 0 ? Math.round((totalBidVol / totalBookVol) * 100) : 50;

  const tickSize = 10 ** -precision;
  const spread = tickSize;
  const spreadBps = mid ? ((spread / mid) * 10000).toFixed(1) : "0.0";

  return (
    <aside aria-label="Depth of market" className="flex w-full min-w-0 flex-1 flex-col bg-ev-bg">
      <div className="border-b border-ev-raised px-3 py-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold uppercase tracking-wider text-ev-muted">Depth of Market</h2>
          <span className="text-dense num text-ev-faint">{symbol}</span>
        </div>

        {/* Bid/Ask Volume Imbalance Bar */}
        {mid !== null && (
          <div className="mt-2 space-y-1">
            <div className="flex justify-between text-micro text-ev-faint">
              <span className="text-ev-up font-medium">Bids {bidRatio}%</span>
              <span className="text-ev-down font-medium">Asks {100 - bidRatio}%</span>
            </div>
            <div className="flex h-1.5 w-full overflow-hidden rounded bg-ev-raised">
              <div className="bg-ev-up transition-all duration-300" style={{ width: `${bidRatio}%` }} />
              <div className="bg-ev-down transition-all duration-300" style={{ width: `${100 - bidRatio}%` }} />
            </div>
          </div>
        )}
      </div>

      {mid === null ? (
        <p className="px-3 py-6 text-base text-ev-faint">Waiting for a quote…</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Table Header */}
          <div className="flex items-center justify-between border-b border-ev-raised bg-ev-panel px-3 py-1 text-micro font-semibold uppercase tracking-wider text-ev-faint">
            <span>Price</span>
            <span className="text-right">Size / Depth</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto text-dense num">
            {/* Asks (Sell Orders - descending toward mid) */}
            <ul>
              {[...asks].reverse().map((lvl) => (
                <Row
                  key={`a-${lvl.price}`}
                  level={lvl}
                  maxCum={maxCum}
                  maxSize={maxSize}
                  side="ask"
                  precision={precision}
                />
              ))}
            </ul>

            {/* Spread Divider */}
            <div className="flex items-center justify-between border-y border-ev-raised bg-ev-panel/90 px-3 py-1 text-center font-medium">
              <span className="num font-bold text-ev-strong">{mid.toFixed(precision)}</span>
              <span className="text-micro text-ev-faint">
                Spread: {spread.toFixed(precision)} ({spreadBps} bps)
              </span>
            </div>

            {/* Bids (Buy Orders - descending from mid) */}
            <ul>
              {bids.map((lvl) => (
                <Row
                  key={`b-${lvl.price}`}
                  level={lvl}
                  maxCum={maxCum}
                  maxSize={maxSize}
                  side="bid"
                  precision={precision}
                />
              ))}
            </ul>
          </div>
        </div>
      )}
    </aside>
  );
}

function Row({
  level,
  maxCum,
  maxSize,
  side,
  precision,
}: {
  level: Level;
  maxCum: number;
  maxSize: number;
  side: "ask" | "bid";
  precision: number;
}) {
  const cumWidth = `${Math.min(100, (level.cum / maxCum) * 100)}%`;
  const sizeWidth = `${Math.min(100, (level.size / maxSize) * 60)}%`;

  return (
    <li className="relative flex items-center justify-between px-3 py-0.5 hover:bg-white/[0.03]">
      {/* Cumulative depth background gradient bar */}
      <span
        className="absolute inset-y-0 right-0 pointer-events-none"
        style={{
          width: cumWidth,
          backgroundColor: `color-mix(in srgb, var(--ev-${side === "ask" ? "down" : "up"}) 12%, transparent)`,
        }}
        aria-hidden
      />
      {/* Individual level size bar */}
      <span
        className="absolute inset-y-0 right-0 pointer-events-none opacity-40"
        style={{
          width: sizeWidth,
          backgroundColor: `var(--ev-${side === "ask" ? "down" : "up"})`,
        }}
        aria-hidden
      />

      <span className={`relative font-semibold ${side === "ask" ? "text-ev-down" : "text-ev-up"}`}>
        {level.price.toFixed(precision)}
      </span>
      <div className="relative flex items-baseline gap-2 text-right">
        <span className="text-ev-strong font-medium">{level.size.toFixed(2)}</span>
        <span className="text-micro text-ev-faint w-12">{level.cum.toFixed(2)}</span>
      </div>
    </li>
  );
}

/**
 * Deterministic synthetic ladder: sizes come from a hash of the price so the
 * book does not reshuffle on every poll tick.
 */
function buildLadder(mid: number, precision: number, side: "ask" | "bid", levels = 12): Level[] {
  const tick = 10 ** -precision;
  const out: Level[] = [];
  let cum = 0;
  for (let i = 1; i <= levels; i++) {
    const price = side === "ask" ? mid + tick * i : mid - tick * i;
    const seed = Math.abs(Math.sin(price * 1000)) * 10;
    const size = 0.05 + seed * 0.4;
    cum += size;
    out.push({ price, size, cum });
  }
  return out;
}
