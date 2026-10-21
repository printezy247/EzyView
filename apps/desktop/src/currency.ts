/**
 * Currency conversion, as pure arithmetic over a rate map.
 *
 * Rates are quoted the way providers return them: the value of one unit of the
 * currency in USD (`USD` itself is 1). Cross rates are therefore a division,
 * and every function here returns `null` for a pair it cannot price rather than
 * inventing a number — a converter that silently shows the wrong figure is
 * worse than one that says it does not know.
 */

export type Rates = Record<string, number>;

/** USD per one unit of `from`, expressed in `to`. `null` if either is unpriced. */
export function crossRate(rates: Rates, from: string, to: string): number | null {
  if (from === to) return rates[from] === undefined ? null : 1;
  const a = rates[from];
  const b = rates[to];
  if (a === undefined || b === undefined) return null;
  if (a <= 0 || b <= 0) return null;
  return a / b;
}

/** `amount` of `from` in `to`. `null` when the pair cannot be priced. */
export function convert(rates: Rates, amount: number, from: string, to: string): number | null {
  const rate = crossRate(rates, from, to);
  return rate === null ? null : amount * rate;
}

/**
 * Split a user-typed pair into its two codes. Accepts `/`, `-`, `_` or space,
 * and the concatenated form (`EURUSD`) when both halves are known codes.
 */
export function normalizePair(input: string): [string, string] | null {
  const cleaned = input.trim().toUpperCase();
  if (cleaned === "") return null;
  const parts = cleaned.split(/[/\-_\s]+/).filter(Boolean);
  if (parts.length === 2 && parts[0]!.length === 3 && parts[1]!.length === 3) {
    return [parts[0]!, parts[1]!];
  }
  if (parts.length === 1 && cleaned.length === 6) return [cleaned.slice(0, 3), cleaned.slice(3)];
  return null;
}

/**
 * Format an amount for display. Sub-unit values get more decimals, because at
 * that scale the fourth decimal *is* the information (a JPY amount in BTC, say).
 */
export function formatAmount(value: number, precision: number): string {
  const decimals = Math.abs(value) > 0 && Math.abs(value) < 1 ? Math.max(4, precision) : precision;
  return value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
