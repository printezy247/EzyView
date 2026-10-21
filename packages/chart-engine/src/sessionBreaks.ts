import { MARKET_SESSIONS, clockFor, isOpen } from "./marketClock.js";

/**
 * Session breaks: which bars fall outside a trading session.
 *
 * This is the shading behind the candles — the visual equivalent of the gap
 * between Friday's close and Monday's open. It is expressed as a boolean per
 * bar so it can reuse the existing background-band primitive, and a bar time is
 * bucketed to its minute because the session table is minute-resolution.
 *
 * An unknown session id yields `null`/an empty array rather than a guess: with
 * nothing to shade, the chart simply draws no break, which is the safe default
 * for a symbol whose session nobody has declared.
 */

/** Is `epochSeconds` inside `sessionId`? `null` when the id is not a session. */
export function sessionFlagsAt(epochSeconds: number, sessionId: string): boolean | null {
  const session = MARKET_SESSIONS.find((s) => s.id === sessionId);
  if (!session) return null;
  const epochMs = epochSeconds * 1000;
  const clock = clockFor(epochMs);
  if (clock.isWeekend && session.id !== "crypto") return false;
  return isOpen(session, clock.minutes);
}

/**
 * One flag per bar time: `true` means the bar is a break.
 *
 * Empty when the session is unknown, so the caller paints nothing.
 */
export function sessionBreaks(times: readonly number[], sessionId: string): boolean[] {
  if (MARKET_SESSIONS.every((s) => s.id !== sessionId)) return [];
  return times.map((time) => !(sessionFlagsAt(time, sessionId) ?? false));
}
