import { useEffect, useState } from "react";

import { formatClock } from "./chartView";
import { sessionState, utcOffsetLabel } from "@ezyview/chart-engine";

/**
 * The market clock: one chip per equity session showing whether it is open,
 * plus a UTC clock and the browser's offset. It lives in the chrome rather than
 * on a page because "is London still trading?" is a question you ask while
 * looking at a chart.
 *
 * A 30-second tick is plenty: the display is minute-resolution, and a session
 * boundary is the only thing that changes the answer.
 */
export function MarketClock() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // `getTimezoneOffset` is minutes *behind* UTC, so negate to get the offset.
  const offsetHours = -new Date(now).getTimezoneOffset() / 60;
  const sessions = sessionState(now);

  return (
    <div
      className="flex items-center gap-1.5 text-dense"
      aria-label="Market clock"
      title={`Times are UTC. Your local offset is ${utcOffsetLabel(offsetHours)}.`}
    >
      {sessions.map((s) => (
        <span
          key={s.id}
          className={
            s.open
              ? "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-micro font-medium text-ev-up-text"
              : "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-micro text-ev-faint"
          }
          title={`${s.label}: ${s.open ? "open" : "closed"}`}
          // The state is in the text, not only in the colour.
          aria-label={`${s.label} ${s.open ? "open" : "closed"}`}
        >
          <span
            className={s.open ? "size-1.5 rounded-full bg-ev-up" : "size-1.5 rounded-full bg-ev-faint"}
            aria-hidden
          />
          {s.label}
        </span>
      ))}
      <span className="num text-ev-muted" title="UTC time" data-volatile="clock">
        {formatClock(now, "UTC")}
      </span>
      <span className="text-ev-faint" title="Your local offset from UTC" data-volatile="clock">
        {utcOffsetLabel(offsetHours)}
      </span>
    </div>
  );
}
