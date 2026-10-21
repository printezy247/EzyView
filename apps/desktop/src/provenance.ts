/**
 * Quote provenance: where a price came from, and how much it can be trusted.
 *
 * The chart shows a number with no context, and "42.10" from a demo feed looks
 * exactly like "42.10" from the broker. So every quote header carries a chip
 * that says which of the four it is. The states are about trust, not about
 * internals:
 *
 * - `live`    — a broker feed, ticking now.
 * - `delayed` — a broker feed that is connected but behind (or reconnecting).
 * - `demo`    — the built-in simulated feed. Never real money.
 * - `cached`  — the feed is down and this is the last price that arrived.
 *
 * Pure functions, so the rule is tested rather than eyeballed.
 */

/** How old a quote may be before a live feed counts as delayed. */
export const DELAY_AFTER_SECONDS = 15;

export type Provenance = "live" | "delayed" | "demo" | "cached";

/** The bridge's connection states, mirrored from the MT5 store. */
export type Mt5Status = "idle" | "connecting" | "online" | "error";

export interface ProvenanceInput {
  /** Which feed the app is on. */
  source: "mt5" | "ezyview";
  /** The bridge's connection state. */
  status: Mt5Status;
  /** Age of the last quote in seconds; omitted when unknown. */
  ageSeconds?: number;
}

/**
 * The provenance of the current price.
 *
 * Order matters: a feed that is not running stays `cached` however old the
 * quote is, and the demo feed is `demo` whatever its quotes look like — it is
 * not a delayed live feed, it is not live at all.
 */
export function provenanceOf({ source, status, ageSeconds }: ProvenanceInput): Provenance {
  if (source !== "mt5") return "demo";
  // Not running and not running well: nothing is arriving, so the price on
  // screen is the last one that did.
  if (status === "error" || status === "idle") return "cached";
  if (status === "connecting") return "delayed";
  if (ageSeconds !== undefined && ageSeconds > DELAY_AFTER_SECONDS) return "delayed";
  return "live";
}

/** Short label for the chip. */
export function provenanceLabel(p: Provenance): string {
  return p.toUpperCase();
}

/** Chip tone. `warn` is a warm amber, so a stale price never reads as good. */
export function provenanceTone(p: Provenance): "neutral" | "up" | "warn" {
  if (p === "live") return "up";
  if (p === "delayed" || p === "cached") return "warn";
  return "neutral";
}

/** One-line explanation for the chip's tooltip. */
export function provenanceTitle(p: Provenance): string {
  switch (p) {
    case "live":
      return "Live broker price.";
    case "delayed":
      return "Delayed price — the feed is behind or reconnecting.";
    case "demo":
      return "Simulated price from the built-in demo feed. Not real money.";
    case "cached":
      return "Last price received — the feed is not connected.";
  }
}
