import { TOOL_ANCHORS } from "@ezyview/drawing-tools";
import type { DrawingStyle, DrawingToolId } from "@ezyview/drawing-tools";
import type { AlertHistory, PriceAlert } from "@ezyview/data-adapters";
import { isDataSourceChoice } from "../chartSource";
import { DEFAULT_WATCHLIST } from "./watchlist";
import type { WatchEntry } from "./types";

/** Only tools the app knows can be favorited; duplicates collapse. */
export function restoreFavoriteTools(raw: unknown, fallback: DrawingToolId[]): DrawingToolId[] {
  if (!Array.isArray(raw)) return fallback;
  const seen = new Set<DrawingToolId>();
  for (const value of raw) {
    if (typeof value !== "string" || !(value in TOOL_ANCHORS)) continue;
    seen.add(value as DrawingToolId);
  }
  return [...seen].slice(0, 24);
}

/**
 * A tool's remembered style must be a usable drawing style; anything else is
 * dropped rather than poisoning every future drawing of that tool.
 */
export function restoreToolStyles(
  raw: unknown,
  fallback: Partial<Record<DrawingToolId, DrawingStyle>>,
): Partial<Record<DrawingToolId, DrawingStyle>> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return fallback;
  const out: Partial<Record<DrawingToolId, DrawingStyle>> = {};
  for (const [tool, style] of Object.entries(raw)) {
    if (!(tool in TOOL_ANCHORS)) continue;
    if (typeof style !== "object" || style === null) continue;
    const s = style as Partial<DrawingStyle>;
    if (typeof s.color !== "string" || typeof s.width !== "number" || typeof s.lineStyle !== "string") continue;
    out[tool as DrawingToolId] = s as DrawingStyle;
  }
  return out;
}

const ALERT_STATES = new Set(["armed", "triggered"]);
const ALERT_FREQUENCIES = new Set(["once", "once_per_bar", "once_per_bar_close"]);

/** Same keys, and each key's closes equal element by element. */
export function historySame(a: AlertHistory, b: AlertHistory): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => {
    const x = a[k];
    const y = b[k];
    return y !== undefined && x !== undefined && x.length === y.length && x.every((n, i) => n === y[i]);
  });
}

/** Keep only well-formed alerts; a bad state/frequency would never evaluate right. */
export function restoreAlerts(raw: unknown, fallback: PriceAlert[]): PriceAlert[] {
  if (!Array.isArray(raw)) return fallback;
  return raw.filter((a): a is PriceAlert => {
    if (typeof a !== "object" || a === null) return false;
    const x = a as Partial<PriceAlert>;
    return (
      typeof x.id === "string" &&
      typeof x.symbol === "string" &&
      typeof x.condition === "object" &&
      x.condition !== null &&
      typeof x.state === "string" &&
      ALERT_STATES.has(x.state) &&
      typeof x.frequency === "string" &&
      ALERT_FREQUENCIES.has(x.frequency)
    );
  });
}

export function restoreAlertHistory(raw: unknown): AlertHistory {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: AlertHistory = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k === "__proto__") continue;
    if (Array.isArray(v)) {
      out[k] = v.filter((n): n is number => typeof n === "number" && Number.isFinite(n)).slice(-200);
    }
  }
  return out;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function restoreWatchlist(raw: unknown, fallback: WatchEntry[]): WatchEntry[] {
  const safeFallback = fallback.length > 0 ? fallback : DEFAULT_WATCHLIST;
  if (!Array.isArray(raw)) return safeFallback;
  const out: WatchEntry[] = [];
  for (const w of raw) {
    if (typeof w !== "object" || w === null) continue;
    const x = w as Partial<Record<keyof WatchEntry, unknown>>;
    if (typeof x.symbol !== "string" || typeof x.ticker !== "string") continue;
    // `auto` describes a chart, not a stored row: rows saved with it (or with
    // junk) keep following the global feed rather than pinning a stale venue.
    const source = isDataSourceChoice(x.source) && x.source !== "auto" ? x.source : undefined;
    out.push({
      symbol: x.symbol,
      ticker: x.ticker,
      description: typeof x.description === "string" ? x.description : x.ticker,
      assetClass: typeof x.assetClass === "string" ? x.assetClass : "",
      precision: typeof x.precision === "number" && Number.isFinite(x.precision) ? Math.max(0, Math.min(10, Math.trunc(x.precision))) : 2,
      price: num(x.price),
      changePct: num(x.changePct),
      ...(source ? { source } : {}),
    });
  }
  return out.length > 0 ? out : safeFallback;
}

