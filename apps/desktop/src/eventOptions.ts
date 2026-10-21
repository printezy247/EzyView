/**
 * Which chart events to draw: earnings dots, economic events, and which
 * impact levels. Saved with the workspace; read by the bottom bar, the
 * right-click menu and Settings → Appearance.
 */
import type { Impact } from "@ezyview/data-adapters";

export interface EventOptions {
  earnings: boolean;
  economic: boolean;
  impacts: { high: boolean; medium: boolean; low: boolean };
}

export const DEFAULT_EVENT_OPTIONS: EventOptions = {
  earnings: true,
  economic: true,
  impacts: { high: true, medium: false, low: false },
};

const IMPACT_ORDER = ["high", "medium", "low"] as const;

/** Options for `fundamentalOverlays` (exact impact list, per-source switches). */
export function toOverlayOptions(o: EventOptions): { showEarnings: boolean; showEvents: boolean; impacts: Impact[] } {
  return { showEarnings: o.earnings, showEvents: o.economic, impacts: IMPACT_ORDER.filter((i) => o.impacts[i]) };
}

/** False when the overlay would be empty whatever the data, so callers can skip the fetch. */
export function eventsActive(o: EventOptions): boolean {
  return o.earnings || (o.economic && IMPACT_ORDER.some((i) => o.impacts[i]));
}

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);

/** Rebuild from a storage blob; any missing or malformed field takes its default. */
export function restoreEventOptions(raw: unknown): EventOptions {
  if (typeof raw !== "object" || raw === null) return DEFAULT_EVENT_OPTIONS;
  const r = raw as Record<string, unknown>;
  const impacts = typeof r.impacts === "object" && r.impacts !== null ? (r.impacts as Record<string, unknown>) : {};
  const d = DEFAULT_EVENT_OPTIONS;
  return {
    earnings: bool(r.earnings, d.earnings),
    economic: bool(r.economic, d.economic),
    impacts: {
      high: bool(impacts.high, d.impacts.high),
      medium: bool(impacts.medium, d.impacts.medium),
      low: bool(impacts.low, d.impacts.low),
    },
  };
}
