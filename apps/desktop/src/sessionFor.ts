/**
 * Which trading session a symbol belongs to, for the chart's break shading.
 *
 * This is a guess from the ticker, not an exchange calendar — the app has no
 * holiday feed. So the mapping is conservative: a venue it recognises maps to
 * its session, and anything unrecognised returns `null`, which the chart reads
 * as "shade nothing". Inventing a session for an unknown venue would draw
 * breaks at times nobody can justify.
 *
 * Crypto and spot FX both map to the round-the-clock session: neither has a
 * close, and shading a weekend break onto them would be a lie.
 */

const ROUND_THE_CLOCK = "crypto";

/** Venue prefix (or pair shape) -> session id. */
const VENUE_SESSIONS: Record<string, string> = {
  binance: ROUND_THE_CLOCK,
  coinbase: ROUND_THE_CLOCK,
  kraken: ROUND_THE_CLOCK,
  bitstamp: ROUND_THE_CLOCK,
  oanda: ROUND_THE_CLOCK,
  fx: ROUND_THE_CLOCK,
  nasdaq: "newyork",
  nyse: "newyork",
  amex: "newyork",
  arca: "newyork",
  cboe: "newyork",
  tsx: "newyork",
  lse: "london",
  lon: "london",
  xetra: "london",
  euronext: "london",
  tse: "tokyo",
  jpx: "tokyo",
  hkex: "tokyo",
  asx: "sydney",
};

/** A bare `AAA/BBB` pair is spot FX, which never closes. */
const PAIR = /^[A-Z]{3}\/[A-Z]{3}$/;

export function sessionForSymbol(symbol: string): string | null {
  const trimmed = symbol.trim();
  if (trimmed === "") return null;
  const upper = trimmed.toUpperCase();
  if (PAIR.test(upper)) return ROUND_THE_CLOCK;
  const colon = upper.indexOf(":");
  if (colon === -1) return null;
  const venue = upper.slice(0, colon).toLowerCase();
  return VENUE_SESSIONS[venue] ?? null;
}
