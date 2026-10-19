import { useEffect, useState } from "react";
import type { Quote } from "@ezyview/data-adapters";
import { market } from "./data";

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
 * Depth of market panel.
 *
 * The demo adapter has no order book, so levels are synthesized around the
 * quote: a deterministic ladder seeded off the last price. Real feeds replace
 * `buildLadder` with a book subscription without touching the rendering below.
 */
export function DepthOfMarket({ symbol, precision }: Props) {
  const [quote, setQuote] = useState<Quote | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      void market.getQuote(symbol).then((q) => {
        if (!cancelled) setQuote(q);
      });
    };
    tick();
    const t = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [symbol]);

  const mid = quote?.last ?? null;
  const asks = mid === null ? [] : buildLadder(mid, precision, "ask");
  const bids = mid === null ? [] : buildLadder(mid, precision, "bid");
  const maxCum = Math.max(1, ...asks.map((a) => a.cum), ...bids.map((b) => b.cum));

  return (
    <div className="flex w-44 shrink-0 flex-col border-l border-[#1e222d] bg-[#0e1117]">
      <div className="border-b border-[#1e222d] px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#787b86]">Depth</h2>
        <p className="mt-0.5 text-[10px] text-[#434651]">{symbol}</p>
      </div>

      {mid === null ? (
        <p className="px-3 py-6 text-xs text-[#434651]">Waiting for a quote…</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto text-[11px] tabular-nums">
          <ul>
            {asks.toReversed().map((lvl) => (
                <Row key={`a-${lvl.price}`} level={lvl} maxCum={maxCum} side="ask" precision={precision} />
              ))}
          </ul>

          <div className="border-y border-[#1e222d] bg-[#131722] px-2 py-1 text-center text-xs font-semibold text-white">
            {mid.toFixed(precision)}
          </div>

          <ul>
            {bids.map((lvl) => (
              <Row key={`b-${lvl.price}`} level={lvl} maxCum={maxCum} side="bid" precision={precision} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({
  level,
  maxCum,
  side,
  precision,
}: {
  level: Level;
  maxCum: number;
  side: "ask" | "bid";
  precision: number;
}) {
  const width = `${Math.min(100, (level.cum / maxCum) * 100)}%`;
  return (
    <li className="relative flex items-center justify-between px-2 py-0.5">
      <span
        className="absolute inset-y-0 left-0"
        style={{
          width,
          backgroundColor: side === "ask" ? "rgba(239, 83, 80, 0.14)" : "rgba(38, 166, 154, 0.14)",
        }}
        aria-hidden
      />
      <span className={`relative ${side === "ask" ? "text-[#ef5350]" : "text-[#26a69a]"}`}>
        {level.price.toFixed(precision)}
      </span>
      <span className="relative text-[#787b86]">{level.size.toFixed(3)}</span>
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
