import type { EpochSeconds } from "@ezyview/data-adapters";

/** The slice of `fetch` the live adapters use, so tests can inject a fake. */
export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** How a request should be retried when the provider is having a bad day. */
export interface RetryOptions {
  /** Total attempts including the first. Default 3. */
  attempts?: number;
  /** Base delay in ms before the first retry. Default 250. */
  baseDelayMs?: number;
  /** Cap on any single backoff delay. Default 2000. */
  maxDelayMs?: number;
  /** Injected for deterministic tests. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Exponential backoff with full jitter: `random(0 .. min(max, base * 2^n))`. */
export function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number, rand = Math.random): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  return Math.floor(rand() * exp);
}

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
export async function getJson(
  fetchFn: FetchLike,
  provider: string,
  url: string,
  options: RetryOptions = {},
): Promise<unknown> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const sleep = options.sleep ?? defaultSleep;
  let lastErr: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- retries are sequential by design
      return await getJsonOnce(fetchFn, provider, url);
    } catch (err) {
      lastErr = err;
      // A bad key or a missing endpoint will not fix itself: only a network
      // blip, a rate limit or a server error is worth another try.
      if (!isTransient(err)) break;
      if (attempt === attempts - 1) break;
      // oxlint-disable-next-line no-await-in-loop
      await sleep(backoffDelay(attempt, options.baseDelayMs ?? 250, options.maxDelayMs ?? 2000));
    }
  }
  throw lastErr;
}

/** One request, with the HTTP status turned into a ProviderError. */
async function getJsonOnce(fetchFn: FetchLike, provider: string, url: string): Promise<unknown> {
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

/** A failure worth another attempt: the network, a rate limit or a server error. */
function isTransient(err: unknown): boolean {
  if (!(err instanceof ProviderError)) return false;
  // 0 is the network error. 429 is the rate limit. 5xx is the provider's fault.
  return err.status === 0 || err.status === 429 || err.status >= 500;
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
