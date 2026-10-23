/**
 * Symbol-search ranking.
 *
 * A plain `includes` filter returns matches in registry order, so typing "apl"
 * buries AAPL behind every incidental substring hit. This scores each symbol
 * against the query — exact ticker beats prefix beats substring beats a loose
 * subsequence — so the obvious answer is always first. Pure and dependency-free
 * so it is trivially testable and reusable across adapters.
 */

/** Ticker/description pair the ranker scores. */
export interface SearchableSymbol {
  ticker: string;
  description: string;
}

/** Higher is better; -1 means "does not match at all". */
export function scoreSymbol(query: string, symbol: SearchableSymbol): number {
  const q = query.trim().toLowerCase();
  if (q === "") return 0;
  const ticker = symbol.ticker.toLowerCase();
  const desc = symbol.description.toLowerCase();

  if (ticker === q) return 100;
  if (ticker.startsWith(q)) return 80;
  if (ticker.includes(q)) return 60;
  if (desc.startsWith(q)) return 40;
  if (desc.includes(q)) return 30;
  // Loose subsequence: every query char appears in order ("apl" → "AAPL").
  if (isSubsequence(q, ticker) || isSubsequence(q, desc)) return 10;
  return -1;
}

/** True when every char of `q` appears in `text` in order (not necessarily adjacent). */
function isSubsequence(q: string, text: string): boolean {
  let i = 0;
  for (const ch of text) {
    if (ch === q[i]) i += 1;
    if (i === q.length) return true;
  }
  return q.length === 0;
}

/**
 * Rank `items` against `query`, best first. Unmatched items are dropped; an
 * empty query returns the input unchanged. Ties keep their original order
 * (the sort is stable).
 */
export function rankSymbols<T extends SearchableSymbol>(query: string, items: readonly T[]): T[] {
  const scored = items
    .map((item) => ({ item, score: scoreSymbol(query, item) }))
    .filter((entry) => entry.score >= 0);
  // Sort descending by score; stable sort keeps registry order among equals.
  return scored.sort((a, b) => b.score - a.score).map((entry) => entry.item);
}
