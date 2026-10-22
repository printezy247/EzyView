/** Pure trading helpers, kept out of the components so they can be tested. */

const FOREX_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD",
  "SGD", "HKD", "CNH", "SEK", "NOK", "TRY", "ZAR", "MXN",
]);

/** Standard contract multipliers for asset classes and symbols */
export function getContractMultiplier(symbol: string): number {
  if (!symbol) return 1;
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  // Gold / Precious metals
  if (s.startsWith("XAU") || s === "GOLD") return 100;
  if (s.startsWith("XAG") || s === "SILVER") return 5000;
  if (s.startsWith("XPT") || s === "PLATINUM") return 100;
  if (s.startsWith("XPD") || s === "PALLADIUM") return 100;

  if (s.length === 6) {
    const base = s.slice(0, 3);
    const quote = s.slice(3, 6);
    if (FOREX_CURRENCIES.has(base) && FOREX_CURRENCIES.has(quote)) {
      return 100_000;
    }
  }

  // Crypto / Equities / CFDs default 1
  return 1;
}

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
 * Properly incorporates `contractMultiplier` (e.g. 100 for Gold, 100,000 for standard FX lots).
 */
export function riskQty(i: {
  equity: number;
  entry: number;
  stop: number | undefined;
  side: "buy" | "sell";
  riskPct: number;
  maxQty: number;
  contractMultiplier?: number;
}): number | null {
  const { equity, entry, stop, side, riskPct, maxQty, contractMultiplier = 1 } = i;
  if (stop === undefined || !Number.isFinite(stop) || stop <= 0) return null;
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(equity) || equity <= 0) return null;
  if (side === "buy" ? stop >= entry : stop <= entry) return null;
  const mult = Number.isFinite(contractMultiplier) && contractMultiplier > 0 ? contractMultiplier : 1;
  const distance = Math.abs(entry - stop);
  if (distance <= 0) return null;
  const raw = (equity * riskPct) / 100 / (distance * mult);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return Math.min(raw, Math.max(0, maxQty));
}

/** Compute Risk-Reward ratio between entry, stop loss, and take profit. */
export function calculateRiskReward(p: {
  side: "buy" | "sell";
  entry: number;
  stop?: number;
  target?: number;
}): { risk: number; reward: number; ratio: number | null } {
  const { side, entry, stop, target } = p;
  if (!Number.isFinite(entry) || entry <= 0) return { risk: 0, reward: 0, ratio: null };
  const hasStop = stop !== undefined && Number.isFinite(stop) && stop > 0;
  const hasTarget = target !== undefined && Number.isFinite(target) && target > 0;

  if (!hasStop || !hasTarget) {
    return {
      risk: hasStop ? Math.abs(entry - stop!) : 0,
      reward: hasTarget ? Math.abs(target! - entry) : 0,
      ratio: null,
    };
  }

  const risk = Math.abs(entry - stop!);
  const reward = Math.abs(target! - entry);

  // Validate correct geometry relative to side
  const validDirection =
    side === "buy" ? stop! < entry && target! > entry : stop! > entry && target! < entry;
  if (!validDirection || risk === 0) {
    return { risk, reward, ratio: null };
  }

  return {
    risk,
    reward,
    ratio: Number((reward / risk).toFixed(2)),
  };
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
