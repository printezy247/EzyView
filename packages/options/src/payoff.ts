import { price } from "./pricing.js";
import type { OptionRight } from "./pricing.js";

export interface Leg {
  right: OptionRight;
  strike: number;
  /** +1 long, -1 short, any non-zero multiple allowed. */
  qty: number;
  /** Premium paid (long) or received (short) per unit. */
  premium: number;
}

/** Profit/loss at expiry for a multi-leg position, per unit of underlying. */
export function expiryPnl(legs: Leg[], spot: number): number {
  return legs.reduce((sum, leg) => {
    const payoff = leg.right === "call" ? Math.max(spot - leg.strike, 0) : Math.max(leg.strike - spot, 0);
    return sum + leg.qty * (payoff - leg.premium);
  }, 0);
}

/** Break-even spots: sign changes of the expiry curve between `lo` and `hi`. */
export function breakevens(legs: Leg[], lo: number, hi: number, steps = 2000): number[] {
  const out: number[] = [];
  let prevX = lo;
  let prev = expiryPnl(legs, lo);
  for (let i = 1; i <= steps; i++) {
    const x = lo + ((hi - lo) * i) / steps;
    const y = expiryPnl(legs, x);
    if (prev === 0) out.push(prevX);
    else if (prev * y < 0) out.push(prevX + ((x - prevX) * Math.abs(prev)) / (Math.abs(prev) + Math.abs(y)));
    prevX = x;
    prev = y;
  }
  return out;
}

/** Theoretical position value today (before expiry) at a given spot/vol. */
export function positionValue(
  legs: Leg[],
  at: { spot: number; years: number; vol: number; rate?: number; div?: number },
): number {
  return legs.reduce((sum, leg) => sum + leg.qty * (price({ ...at, right: leg.right, strike: leg.strike }) - leg.premium), 0);
}
