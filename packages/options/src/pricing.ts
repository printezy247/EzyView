export type OptionRight = "call" | "put";

export interface OptionInput {
  right: OptionRight;
  /** Underlying price. */
  spot: number;
  strike: number;
  /** Time to expiry in years. */
  years: number;
  /** Annualised volatility as a fraction (0.25 = 25%). */
  vol: number;
  /** Continuously compounded risk-free rate. */
  rate?: number;
  /** Continuous dividend yield. */
  div?: number;
}

export interface Greeks {
  delta: number;
  gamma: number;
  /** Per day. */
  theta: number;
  /** Per 1 volatility point (0.01). */
  vega: number;
  /** Per 1 rate point (0.01). */
  rho: number;
}

/** Standard normal CDF (Abramowitz–Stegun 26.2.17 via erf-free polynomial, |err| < 7.5e-8). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const tail = normPdf(x) * poly;
  return x >= 0 ? 1 - tail : tail;
}

export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function d1d2(o: OptionInput): { d1: number; d2: number } {
  const r = o.rate ?? 0;
  const q = o.div ?? 0;
  const sd = o.vol * Math.sqrt(o.years);
  const d1 = (Math.log(o.spot / o.strike) + (r - q + 0.5 * o.vol * o.vol) * o.years) / sd;
  return { d1, d2: d1 - sd };
}

const intrinsic = (o: OptionInput): number =>
  o.right === "call" ? Math.max(o.spot - o.strike, 0) : Math.max(o.strike - o.spot, 0);

const degenerate = (o: OptionInput): boolean => o.years <= 0 || o.vol <= 0 || o.spot <= 0 || o.strike <= 0;

/** Black-Scholes-Merton price for a European option. */
export function price(o: OptionInput): number {
  if (degenerate(o)) return intrinsic(o);
  const r = o.rate ?? 0;
  const q = o.div ?? 0;
  const { d1, d2 } = d1d2(o);
  const disc = Math.exp(-r * o.years);
  const fwd = Math.exp(-q * o.years);
  return o.right === "call"
    ? o.spot * fwd * normCdf(d1) - o.strike * disc * normCdf(d2)
    : o.strike * disc * normCdf(-d2) - o.spot * fwd * normCdf(-d1);
}

export function greeks(o: OptionInput): Greeks {
  if (degenerate(o)) {
    const itm = intrinsic(o) > 0;
    return { delta: itm ? (o.right === "call" ? 1 : -1) : 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  }
  const r = o.rate ?? 0;
  const q = o.div ?? 0;
  const { d1, d2 } = d1d2(o);
  const sqrtT = Math.sqrt(o.years);
  const disc = Math.exp(-r * o.years);
  const fwd = Math.exp(-q * o.years);
  const pdf = normPdf(d1);
  const call = o.right === "call";
  const delta = call ? fwd * normCdf(d1) : -fwd * normCdf(-d1);
  const gamma = (fwd * pdf) / (o.spot * o.vol * sqrtT);
  const decay = -(o.spot * fwd * pdf * o.vol) / (2 * sqrtT);
  const theta = call
    ? decay - r * o.strike * disc * normCdf(d2) + q * o.spot * fwd * normCdf(d1)
    : decay + r * o.strike * disc * normCdf(-d2) - q * o.spot * fwd * normCdf(-d1);
  const vega = o.spot * fwd * pdf * sqrtT;
  const rho = call ? o.strike * o.years * disc * normCdf(d2) : -o.strike * o.years * disc * normCdf(-d2);
  return { delta, gamma, theta: theta / 365, vega: vega / 100, rho: rho / 100 };
}

/**
 * Implied volatility by bisection (robust where Newton diverges near zero vega).
 * Returns null when the price is outside the no-arbitrage range.
 */
export function impliedVol(o: Omit<OptionInput, "vol">, marketPrice: number): number | null {
  const lo0 = 1e-4;
  const hi0 = 5;
  if (o.years <= 0 || marketPrice < price({ ...o, vol: lo0 }) - 1e-9 || marketPrice > price({ ...o, vol: hi0 })) return null;
  let lo = lo0;
  let hi = hi0;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (price({ ...o, vol: mid }) < marketPrice) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-8) break;
  }
  return (lo + hi) / 2;
}
