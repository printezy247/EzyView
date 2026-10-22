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

/**
 * Break-even spots: sign changes of the expiry curve between `lo` and `hi`.
 * A run of zeros reports once (where it starts), a curve that is zero
 * everywhere has none, and a zero at `hi` counts.
 */
export function breakevens(legs: Leg[], lo: number, hi: number, steps = 2000): number[] {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = lo + ((hi - lo) * i) / steps;
    xs.push(x);
    ys.push(expiryPnl(legs, x));
  }
  if (ys.every((y) => Math.abs(y) < 1e-9)) return [];
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const y = ys[i]!;
    if (Math.abs(y) < 1e-9) {
      if (i === 0 || Math.abs(ys[i - 1]!) >= 1e-9) out.push(xs[i]!);
    } else if (i > 0 && ys[i - 1]! * y < 0) {
      const prev = ys[i - 1]!;
      out.push(xs[i - 1]! + ((xs[i]! - xs[i - 1]!) * Math.abs(prev)) / (Math.abs(prev) + Math.abs(y)));
    }
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
