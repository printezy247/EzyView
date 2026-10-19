import { greeks, price } from "./pricing.js";
import type { Greeks, OptionRight } from "./pricing.js";

export interface ChainSide extends Greeks {
  right: OptionRight;
  strike: number;
  /** Theoretical mid price. */
  mid: number;
  bid: number;
  ask: number;
  iv: number;
  /** Open interest — synthetic, peaks at the money. */
  openInterest: number;
}

export interface ChainRow {
  strike: number;
  call: ChainSide;
  put: ChainSide;
}

export interface Expiry {
  /** Days to expiry. */
  days: number;
  rows: ChainRow[];
}

export interface ChainOptions {
  spot: number;
  /** Base at-the-money vol (fraction). */
  baseVol?: number;
  rate?: number;
  div?: number;
  /** Days to expiry for each expiration. */
  expiries?: number[];
  /** Strikes each side of the money. */
  strikesEachSide?: number;
}

/** Round strikes to a sensible grid for the spot's magnitude. */
export function strikeStep(spot: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(spot));
  const raw = magnitude / 20;
  return raw >= 1 ? Math.round(raw) : raw;
}

/** Volatility smile: a parabola in log-moneyness, with a slight put skew. */
export function smileVol(baseVol: number, spot: number, strike: number, years: number): number {
  const m = Math.log(strike / spot) / Math.sqrt(Math.max(years, 1 / 365));
  return Math.max(0.02, baseVol * (1 + 1.2 * m * m - 0.4 * m));
}

/**
 * Model-built chain. No market data feed is assumed: prices are Black-Scholes
 * values off a smile, with a synthetic spread. Swap in a real provider via the
 * same shapes when one exists.
 */
export function buildChain(opts: ChainOptions): Expiry[] {
  const { spot, baseVol = 0.3, rate = 0.04, div = 0, strikesEachSide = 8 } = opts;
  const expiries = opts.expiries ?? [7, 14, 30, 60, 90];
  const step = strikeStep(spot);
  const atm = Math.round(spot / step) * step;

  return expiries.map((days) => {
    const years = days / 365;
    const rows: ChainRow[] = [];
    for (let i = -strikesEachSide; i <= strikesEachSide; i++) {
      const strike = Number((atm + i * step).toFixed(6));
      if (strike <= 0) continue;
      const vol = smileVol(baseVol, spot, strike, years);
      const side = (right: OptionRight): ChainSide => {
        const input = { right, spot, strike, years, vol, rate, div };
        const mid = price(input);
        const half = Math.max(mid * 0.01, spot * 0.0002);
        return {
          right,
          strike,
          mid,
          bid: Math.max(mid - half, 0),
          ask: mid + half,
          iv: vol,
          openInterest: Math.round(5000 * Math.exp(-((i / strikesEachSide) ** 2) * 2)),
          ...greeks(input),
        };
      };
      rows.push({ strike, call: side("call"), put: side("put") });
    }
    return { days, rows };
  });
}
