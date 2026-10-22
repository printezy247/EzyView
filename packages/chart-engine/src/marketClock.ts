/**
 * The market clock: which equity sessions are open, when the next one changes,
 * and a UTC-offset label for anything that has to name a timezone.
 *
 * Everything here is pure date math over an instant, so the whole module is
 * testable without touching the system clock and can drive both the header
 * chip and the chart's session shading from one table.
 */

export interface MarketSession {
  id: string;
  label: string;
  /** Minutes past UTC midnight when the session opens. */
  openUtc: number;
  /** Minutes past UTC midnight when the session closes. Equal to `openUtc` for
   * a round-the-clock market. */
  closeUtc: number;
}

/**
 * The four equity sessions plus crypto, in the order they open across the day.
 * Windows are the conventional ones; a venue's own holiday calendar is out of
 * scope for a clock that has to work offline.
 */
export const MARKET_SESSIONS: readonly MarketSession[] = [
  { id: "sydney", label: "Sydney", openUtc: 22 * 60, closeUtc: 7 * 60 },
  { id: "tokyo", label: "Tokyo", openUtc: 0, closeUtc: 6 * 60 },
  { id: "london", label: "London", openUtc: 8 * 60, closeUtc: 16 * 60 + 30 },
  { id: "newyork", label: "New York", openUtc: 14 * 60 + 30, closeUtc: 21 * 60 },
  { id: "crypto", label: "Crypto", openUtc: 0, closeUtc: 0 },
] as const;

export interface ClockReading {
  /** Minutes past UTC midnight. */
  minutes: number;
  /** 0 = Sunday … 6 = Saturday, matching `Date#getUTCDay`. */
  weekday: number;
  isWeekend: boolean;
}

/** Read one instant as UTC minutes-past-midnight plus its weekday. */
export function clockFor(epochMs: number): ClockReading {
  const d = new Date(epochMs);
  const weekday = d.getUTCDay();
  return { minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), weekday, isWeekend: weekday === 0 || weekday === 6 };
}

/**
 * Is `minutes` inside the session window? Handles the window that crosses UTC
 * midnight (Sydney), where "inside" means after the open *or* before the close.
 */
export function isOpen(session: MarketSession, minutes: number): boolean {
  if (session.openUtc === session.closeUtc) return true;
  if (session.openUtc < session.closeUtc) return minutes >= session.openUtc && minutes < session.closeUtc;
  return minutes >= session.openUtc || minutes < session.closeUtc;
}

export interface SessionStatus extends MarketSession {
  open: boolean;
}

/**
 * Every session's state at one instant. Equity sessions go dark for the
 * weekend; crypto does not, because it does not have one.
 */
export function sessionState(epochMs: number): SessionStatus[] {
  const clock = clockFor(epochMs);
  return MARKET_SESSIONS.map((session): SessionStatus => {
    const weekendClosed = clock.isWeekend && session.id !== "crypto";
    return {
      id: session.id,
      label: session.label,
      openUtc: session.openUtc,
      closeUtc: session.closeUtc,
      open: !weekendClosed && isOpen(session, clock.minutes),
    };
  });
}

export interface Transition {
  kind: "open" | "close";
  at: number;
}

/**
 * The next change of state for one session. Scans forward minute by minute for
 * up to eight days, which covers the longest weekend gap; a round-the-clock
 * session never transitions, so it reports the next midnight.
 */
export function nextTransition(session: MarketSession, fromMs: number, maxDays = 8): Transition {
  const startOpen = sessionState(fromMs).find((s) => s.id === session.id)?.open ?? false;
  if (session.openUtc === session.closeUtc) {
    const d = new Date(fromMs);
    const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
    return { kind: "open", at: midnight };
  }
  const limit = fromMs + maxDays * 86_400_000;
  // A minute is the resolution the table is expressed in, so stepping by one is
  // exact and cheap (11 520 iterations worst case).
  for (let t = fromMs + 60_000; t <= limit; t += 60_000) {
    const nowOpen = sessionState(t).find((s) => s.id === session.id)?.open ?? false;
    if (nowOpen !== startOpen) return { kind: nowOpen ? "open" : "close", at: t };
  }
  return { kind: startOpen ? "close" : "open", at: limit };
}

/** `UTC+2`, `UTC-5`, `UTC+5:30`, or plain `UTC` for zero. */
export function utcOffsetLabel(hours: number): string {
  if (hours === 0) return "UTC";
  const sign = hours > 0 ? "+" : "-";
  const abs = Math.abs(hours);
  const whole = Math.floor(abs);
  let minutes = Math.round((abs - whole) * 60);
  let h = whole;
  if (minutes >= 60) {
    h += 1;
    minutes = 0;
  }
  return minutes === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${String(minutes).padStart(2, "0")}`;
}
