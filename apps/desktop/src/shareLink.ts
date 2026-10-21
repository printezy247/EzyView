/**
 * Chart share links: `<base>?share=<SYMBOL>:<resolution>`.
 *
 * The parameter sits in the query string, ahead of the HashRouter fragment,
 * so it survives route changes and is easy to strip after boot. Parsing is
 * hostile-input safe: it never throws and returns null unless both the symbol
 * and the interval pass strict checks.
 */
import type { Resolution } from "@ezyview/data-adapters";
import { RESOLUTION_GROUPS } from "./data";

export interface ShareTarget {
  symbol: string;
  resolution: Resolution;
}

const MAX_LENGTH = 512;
/** Optional `EXCHANGE:` prefix, as in the default `OANDA:XAUUSD`. */
const SYMBOL = /^([A-Z0-9_.-]{1,20}:)?[A-Z0-9.-]{1,20}$/;
const RESOLUTIONS: ReadonlySet<string> = new Set(RESOLUTION_GROUPS.flatMap((g) => g.items));

export function buildShareLink(base: string, meta: { symbol: string; resolution: string }): string {
  const params = new URLSearchParams({ share: `${meta.symbol}:${meta.resolution}` });
  return `${base}?${params.toString()}`;
}

export function parseShareLink(url: string): ShareTarget | null {
  if (url.length > MAX_LENGTH) return null;
  let value: string | null;
  try {
    value = new URL(url, "http://localhost").searchParams.get("share");
  } catch {
    return null;
  }
  if (!value) return null;
  // The interval is after the last colon; the symbol may itself hold one.
  const cut = value.lastIndexOf(":");
  if (cut < 1) return null;
  const symbol = value.slice(0, cut).toUpperCase();
  const resolution = value.slice(cut + 1);
  if (!SYMBOL.test(symbol) || !RESOLUTIONS.has(resolution)) return null;
  return { symbol, resolution: resolution as Resolution };
}
