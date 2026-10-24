import { useRef, useState } from "react";
import { buildLadder } from "./depthLadder";
import { useQuote } from "./quotePoller";
import { useWorkspace } from "./store";
import { useTrading } from "./trading";
import { createLockout, roundPrice } from "./tradeMath";

interface Props {
  symbol: string;
  precision: number;
}

type Level = ReturnType<typeof buildLadder>[number];

/**
 * Depth of market panel with visual volume bars and spread telemetry.
 */
export function DepthOfMarket({ symbol, precision }: Props) {
  const [qty, setQty] = useState(1);
  const isReplay = useWorkspace((s) => s.replayBar !== null);
  const { quote, status, refresh } = useQuote(symbol, { intervalMs: 1500, enabled: !isReplay });
  const submit = useTrading((s) => s.submit);
  const failed = status === "failed";
  // A second click on the same rung inside 500 ms is a double submit.
  const lockout = useRef(createLockout(500)).current;

  const place = (side: "buy" | "sell", price: number) => {
    const rounded = roundPrice(price, precision);
    if (!lockout(`${side}:${rounded}`)) return;
    void submit({ symbol, side, type: "limit", price: rounded, qty });
  };

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
          <p className="pb-1 text-micro text-ev-faint" title="Sizes are generated from the quote, not broker depth">
            Indicative ladder — sizes simulated from the quote
          </p>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold uppercase tracking-wider text-ev-muted">Depth of Market</h2>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-micro text-ev-muted">
                <span>Lot:</span>
                <select
                  aria-label="Order size"
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                  className="rounded border border-ev-line bg-ev-panel px-1 py-0.5 text-micro text-ev-strong"
                >
                  {[0.1, 0.5, 1, 2, 5, 10].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-dense num text-ev-faint">{symbol}</span>
            </div>
          </div>

        {/* Bid/Ask Volume Imbalance Bar */}
        {mid !== null && (
          <div className="mt-2 space-y-1">
            <div className="flex justify-between text-micro text-ev-faint">
              <span className="text-ev-up-text font-medium">Bids {bidRatio}%</span>
              <span className="text-ev-down-text font-medium">Asks {100 - bidRatio}%</span>
            </div>
            <div className="flex h-1.5 w-full overflow-hidden rounded bg-ev-raised">
              <div className="bg-ev-up transition-all duration-300" style={{ width: `${bidRatio}%` }} />
              <div className="bg-ev-down transition-all duration-300" style={{ width: `${100 - bidRatio}%` }} />
            </div>
          </div>
        )}
      </div>

      {mid === null ? (
        <p role="status" className="px-3 py-6 text-base text-ev-faint">
          {failed ? (
            <>
              Quote unavailable.{" "}
              <button
                type="button"
                onClick={refresh}
                className="min-h-6 rounded px-1 text-ev-link underline"
              >
                Retry
              </button>
            </>
          ) : (
            "Waiting for a quote…"
          )}
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Table Header */}
          <div className="flex items-center justify-between border-b border-ev-raised bg-ev-panel px-3 py-1 text-micro font-semibold uppercase tracking-wider text-ev-faint">
            <span>Price</span>
            <span className="text-right">Size / Depth</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto text-dense num">
            {/* Asks (Sell Orders - descending toward mid) */}
            <ul aria-label="Asks">
              {[...asks].reverse().map((lvl) => (
                <Row
                  key={`a-${lvl.price}`}
                  level={lvl}
                  maxCum={maxCum}
                  maxSize={maxSize}
                  side="ask"
                  precision={precision}
                  onClick={() => place("sell", lvl.price)}
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
            <ul aria-label="Bids">
              {bids.map((lvl) => (
                <Row
                  key={`b-${lvl.price}`}
                  level={lvl}
                  maxCum={maxCum}
                  maxSize={maxSize}
                  side="bid"
                  precision={precision}
                  onClick={() => place("buy", lvl.price)}
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
  onClick,
}: {
  level: Level;
  maxCum: number;
  maxSize: number;
  side: "ask" | "bid";
  precision: number;
  onClick: () => void;
}) {
  const cumWidth = `${Math.min(100, (level.cum / maxCum) * 100)}%`;
  const sizeWidth = `${Math.min(100, (level.size / maxSize) * 60)}%`;

  return (
    <li>
    <button
      type="button"
      onClick={onClick}
      aria-label={`Place ${side === "ask" ? "sell" : "buy"} limit at ${level.price.toFixed(precision)}, size ${level.size.toFixed(2)}`}
      title={`Click to place ${side === "ask" ? "Sell" : "Buy"} Limit at ${level.price.toFixed(precision)}`}
      className="group relative flex min-h-6 w-full cursor-pointer select-none items-center justify-between px-3 py-0.5 text-left transition-colors hover:bg-white/[0.06]"
    >
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

      <span className={`relative font-semibold flex items-center gap-1.5 ${side === "ask" ? "text-ev-down-text" : "text-ev-up-text"}`}>
        <span>{level.price.toFixed(precision)}</span>
        <span className="hidden rounded border border-ev-line bg-ev-panel px-1 py-px text-[10px] font-medium text-ev-muted group-hover:inline-block group-focus-visible:inline-block">
          + {side === "ask" ? "Sell" : "Buy"}
        </span>
      </span>
      <div className="relative flex items-baseline gap-2 text-right">
        <span className="text-ev-strong font-medium">{level.size.toFixed(2)}</span>
        <span className="text-micro text-ev-faint w-12">{level.cum.toFixed(2)}</span>
      </div>
    </button>
    </li>
  );
}
