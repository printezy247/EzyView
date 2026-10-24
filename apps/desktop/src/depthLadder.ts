/**
 * Order-flow math shared by the DOM ladder and the tape readouts (Phase 7).
 *
 * The feed EzyView holds is quotes, not broker depth: the DOM ladder stays a
 * deterministic synthetic construction (hashed off price, no reshuffle per
 * tick) and any delta metric must say whether it saw real trade sizes or
 * inferred direction from quote ticks.
 */

export interface Level {
  price: number;
  size: number;
  /** Cumulative size from the best price inward, used for the depth bar. */
  cum: number;
}

export function buildLadder(
  mid: number,
  precision: number,
  side: "ask" | "bid",
  levels = 12,
): Level[] {
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

export interface TapeDelta {
  /** Signed sum of trade sizes (buys positive); null when no sizes were seen. */
  delta: number | null;
  /** Count of upticks and downticks in the window. */
  buyTicks: number;
  sellTicks: number;
  /** True when the feed reported at least one real trade size. */
  sized: boolean;
}

/**
 * Cumulative flow over tape entries (oldest→newest input order).
 *
 * With real trade sizes this is CVD over the window. Where the feed only
 * carries quotes (`size: 0`), delta is null and callers fall back to the raw
 * tick imbalance — labelled as tick counts, never dressed up as volume.
 */
export function tapeDelta<T extends { side: "buy" | "sell"; size: number }>(entries: readonly T[]): TapeDelta {
  let delta = 0;
  let buyTicks = 0;
  let sellTicks = 0;
  let sized = false;
  for (const e of entries) {
    if (e.side === "buy") buyTicks += 1;
    else sellTicks += 1;
    if (e.size > 0) {
      sized = true;
      delta += e.side === "buy" ? e.size : -e.size;
    }
  }
  return { delta: sized ? delta : null, buyTicks, sellTicks, sized };
}
