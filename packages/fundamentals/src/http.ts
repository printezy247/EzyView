import type { EpochSeconds } from "@ezyview/data-adapters";

/** The slice of `fetch` the live adapters use, so tests can inject a fake. */
export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** A provider answered with an error (bad key, rate limit, plan without access). */
export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    message: string,
  ) {
    super(`${provider}: ${message}`);
    this.name = "ProviderError";
  }

  /** The key is wrong, or the free plan does not include this endpoint. */
  get denied(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/** GET a JSON document, turning HTTP failures into a ProviderError. */
export async function getJson(fetchFn: FetchLike, provider: string, url: string): Promise<unknown> {
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchFn(url);
  } catch (err) {
    throw new ProviderError(provider, 0, `network error (${err instanceof Error ? err.message : String(err)})`);
  }
  if (!res.ok) {
    const hint =
      res.status === 401
        ? "API key rejected"
        : res.status === 403
          ? "your plan does not include this data"
          : res.status === 429
            ? "rate limit reached, try again in a minute"
            : `HTTP ${res.status}`;
    throw new ProviderError(provider, res.status, hint);
  }
  return res.json();
}

/** Epoch seconds → "YYYY-MM-DD" (UTC). */
export const ymd = (epoch: EpochSeconds): string => new Date(epoch * 1000).toISOString().slice(0, 10);

/** "YYYY-MM-DD" → epoch seconds at UTC midnight, or null when missing/invalid. */
export function parseYmd(value: unknown): EpochSeconds | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const ms = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms / 1000;
}

/** Number from a provider field that may be a string, "None", "-" or null. */
export function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export type SymbolKind = "stock" | "crypto" | "forex";

const FIAT = new Set(["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD", "XAU", "XAG"]);

/** Rough class of an app symbol ("DEMO:AAPL", "BINANCE:BTCUSDT") for picking endpoints. */
export function classify(symbol: string): { ticker: string; kind: SymbolKind } {
  const ticker = (symbol.split(":").pop() ?? symbol).toUpperCase();
  if (/(USDT|USDC|BUSD)$/.test(ticker) || /^(BTC|ETH|SOL|XRP|DOGE|ADA|BNB)/.test(ticker)) return { ticker, kind: "crypto" };
  if (ticker.length === 6 && FIAT.has(ticker.slice(0, 3)) && FIAT.has(ticker.slice(3))) return { ticker, kind: "forex" };
  return { ticker, kind: "stock" };
}
