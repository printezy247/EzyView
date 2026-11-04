import type { EventStripHit, EventStripMarker } from "@ezyview/chart-engine";
import { Chip } from "./ui";

const IMPACT_TONE = { high: "down", medium: "warn", low: "neutral", none: "neutral" } as const;

const fmtTime = (epoch: number): string =>
  new Date(epoch * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const fmtMoney = (n: number): string =>
  n >= 1_000_000_000 ? `$${(n / 1_000_000_000).toFixed(1)}B` : `$${Math.round(n / 1_000_000).toFixed(0)}M`;

function DetailRow({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-dense">
      <span className="text-ev-faint">{label}</span>
      <span className={tone === "up" ? "num text-ev-up-text" : tone === "down" ? "num text-ev-down-text" : "num text-ev-strong"}>
        {value}
      </span>
    </div>
  );
}

function EventDetail({ m }: { m: EventStripMarker }) {
  if (m.kind === "earnings") {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <Chip tone="accent">Earnings{m.quarter ? ` · ${m.quarter}` : ""}</Chip>
          <span className="text-micro text-ev-faint">{fmtTime(m.time)}</span>
        </div>
        {m.eps !== undefined && m.eps !== null && (
          <DetailRow label="EPS" value={m.eps.toFixed(2)} tone={m.estimate != null ? (m.eps >= m.estimate ? "up" : "down") : undefined} />
        )}
        {m.estimate !== undefined && m.estimate !== null && <DetailRow label="Estimate" value={m.estimate.toFixed(2)} />}
        {m.revenue !== undefined && m.revenue !== null && <DetailRow label="Revenue" value={fmtMoney(m.revenue)} />}
        {m.source && <p className="text-micro text-ev-faint">via {m.source}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Chip tone={IMPACT_TONE[m.impact ?? "high"]}>{m.impact ?? "high"} impact</Chip>
        {m.currency && <span className="text-micro text-ev-faint">{m.currency}</span>}
        <span className="text-micro text-ev-faint">{fmtTime(m.time)}</span>
      </div>
      {m.actual != null && <DetailRow label="Actual" value={m.actual} />}
      {m.forecast != null && <DetailRow label="Forecast" value={m.forecast} />}
      {m.previous != null && <DetailRow label="Previous" value={m.previous} />}
      {(m.source || m.url) && (
        <p className="text-micro text-ev-faint">
          via {m.source ?? "calendar"}
          {m.url && (
            <>
              {" · "}
              <a href={m.url} target="_blank" rel="noreferrer" className="underline hover:text-ev-strong">
                source
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * Hover/pin body for a bottom-strip chip: one event's full detail, or the
 * cluster's member list. Pure content — `HoverCard` owns the positioning.
 */
export function EventStripCard({ hit }: { hit: EventStripHit }) {
  if (hit.count === 1) return <EventDetail m={hit.markers[0]!} />;
  return (
    <div className="space-y-1.5">
      <p className="text-dense text-ev-muted">
        {hit.count} events at {fmtTime(hit.markers[0]!.time)}
      </p>
      <ul className="max-h-48 space-y-1 overflow-y-auto">
        {hit.markers.slice(0, 8).map((m, i) => (
          <li key={`${m.time}-${m.title}-${i}`} className="border-t border-ev-raised pt-1 first:border-0 first:pt-0">
            <p className="text-dense font-medium text-ev-strong">{m.title}</p>
            <EventDetail m={m} />
          </li>
        ))}
      </ul>
      {hit.count > 8 && <p className="text-micro text-ev-faint">+{hit.count - 8} more — zoom in to separate them</p>}
    </div>
  );
}