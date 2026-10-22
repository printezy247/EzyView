/** Pure trading helpers, kept out of the components so they can be tested. */

/** Round to the symbol's decimal places, dropping float noise (1.1003000000000001). */
export function roundPrice(price: number, precision: number): number {
  return Number(price.toFixed(precision));
}

/**
 * Break-even is offered only once the mark is past entry in the profit
 * direction, and only if it would tighten an existing stop (never loosen it).
 */
export function canBreakEven(p: {
  side: "long" | "short" | "flat";
  entry: number;
  mark: number;
  stopLoss?: number;
}): boolean {
  if (![p.entry, p.mark].every(Number.isFinite)) return false;
  if (p.side === "flat") return false;
  const long = p.side === "long";
  if (long ? p.mark <= p.entry : p.mark >= p.entry) return false;
  if (p.stopLoss === undefined) return true;
  return long ? p.stopLoss < p.entry : p.stopLoss > p.entry;
}

/**
 * Quantity that risks `riskPct` of equity between entry and stop. Null when
 * the stop is missing, not a positive number, or on the wrong side of entry.
 */
export function riskQty(i: {
  equity: number;
  entry: number;
  stop: number | undefined;
  side: "buy" | "sell";
  riskPct: number;
  maxQty: number;
}): number | null {
  const { equity, entry, stop, side, riskPct, maxQty } = i;
  if (stop === undefined || !Number.isFinite(stop) || stop <= 0) return null;
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(equity) || equity <= 0) return null;
  if (side === "buy" ? stop >= entry : stop <= entry) return null;
  const raw = (equity * riskPct) / 100 / Math.abs(entry - stop);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return Math.min(raw, Math.max(0, maxQty));
}

/** Returns true if `key` may fire now; false while it is inside the lockout window. */
export function createLockout(ms: number, now: () => number = Date.now) {
  const last = new Map<string, number>();
  return (key: string): boolean => {
    const t = now();
    const prev = last.get(key);
    if (prev !== undefined && t - prev < ms) return false;
    last.set(key, t);
    return true;
  };
}
