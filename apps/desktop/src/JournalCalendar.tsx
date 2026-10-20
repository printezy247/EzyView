import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dateKey } from "@ezyview/journal";
import type { JournalEntry } from "@ezyview/journal";
import { dayCounts, dayNets } from "./journalUi";

interface Props {
  entries: readonly JournalEntry[];
  /** Selected local day as a `dateKey` string; shared with the Reviews tab. */
  selectedDay: string;
  onSelectDay: (key: string) => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Green/red tint of one day's net, scaled to the busiest day in the month. */
function cellBackground(net: number, maxAbs: number): string | undefined {
  if (net === 0 || maxAbs <= 0) return undefined;
  const intensity = 0.15 + 0.55 * (Math.min(Math.abs(net), maxAbs) / maxAbs);
  return net > 0 ? `rgba(38, 166, 154, ${intensity.toFixed(3)})` : `rgba(239, 83, 80, ${intensity.toFixed(3)})`;
}

/**
 * Month heatmap of daily net P&L. Click a day to select it — the Reviews tab
 * opens on the same key, so "review yesterday" is one click from the grid.
 */
export function JournalCalendar({ entries, selectedDay, onSelectDay }: Props) {
  const today = new Date();
  const [year, setYear] = useState(() => today.getFullYear());
  const [month, setMonth] = useState(() => today.getMonth()); // 0-based

  const nets = useMemo(() => dayNets(entries), [entries]);
  const counts = useMemo(() => dayCounts(entries), [entries]);

  const maxAbs = useMemo(() => {
    let max = 0;
    for (const net of nets.values()) {
      if (Math.abs(net) > max) max = Math.abs(net);
    }
    return max;
  }, [nets]);

  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Mon-first offset: JS Sunday=0 → 6, Monday=1 → 0, …
  const leadingBlanks = (new Date(year, month, 1).getDay() + 6) % 7;

  const step = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  };

  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    onSelectDay(dateKey(Math.floor(today.getTime() / 1000)));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col p-3">
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => step(-1)}
          className="flex size-6 items-center justify-center rounded text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
        >
          <ChevronLeft size={14} aria-hidden />
        </button>
        <span className="min-w-40 text-center text-xs font-medium text-ev-strong">{monthLabel}</span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => step(1)}
          className="flex size-6 items-center justify-center rounded text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
        >
          <ChevronRight size={14} aria-hidden />
        </button>
        <button
          type="button"
          onClick={goToday}
          className="ml-auto rounded border border-ev-line px-2 py-0.5 text-[11px] text-ev-muted hover:text-ev-strong"
        >
          Today
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[10px] uppercase tracking-wider text-ev-faint">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const noon = new Date(year, month, day, 12);
          const key = dateKey(Math.floor(noon.getTime() / 1000));
          const net = nets.get(key);
          const count = counts.get(key) ?? 0;
          const selected = key === selectedDay;
          const isToday =
            day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(key)}
              aria-label={`${key}${net === undefined ? "" : `, net ${net.toFixed(2)}`}`}
              aria-pressed={selected}
              className={`flex h-14 flex-col items-start rounded border p-1 text-left hover:border-ev-line-strong ${
                selected ? "border-ev-accent" : "border-ev-line"
              } ${isToday && !selected ? "border-ev-line-strong" : ""}`}
              style={{ backgroundColor: net === undefined ? undefined : cellBackground(net, maxAbs) }}
            >
              <span className={`text-[11px] tabular-nums ${selected ? "font-semibold text-ev-strong" : "text-ev-text"}`}>
                {day}
              </span>
              {count > 0 && (
                <span className="mt-auto w-full truncate text-right text-[10px] tabular-nums text-ev-muted">
                  {count}
                  {net !== undefined && net !== 0 && (
                    <span className={net > 0 ? " text-ev-up" : " text-ev-down"}>
                      {" "}
                      {net > 0 ? "+" : ""}
                      {Math.abs(net) >= 1000 ? `${(net / 1000).toFixed(1)}k` : net.toFixed(0)}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {maxAbs > 0 && (
        <div className="mt-3 flex items-center gap-2 text-[10px] text-ev-faint">
          <span>Loss</span>
          <span
            aria-hidden
            className="h-2 w-24 rounded-sm"
            style={{
              background: "linear-gradient(to right, rgba(239,83,80,0.7), rgba(30,34,45,0.4), rgba(38,166,154,0.7))",
            }}
          />
          <span>Profit</span>
        </div>
      )}
    </div>
  );
}
