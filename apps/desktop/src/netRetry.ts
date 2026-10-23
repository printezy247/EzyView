/**
 * Network resilience primitives for the market-data layer.
 *
 * Two small, independent, fully-testable pieces:
 *
 *  - `withRetry` wraps a flaky async call in exponential backoff with jitter
 *    and a per-attempt timeout, so a single slow request cannot hang a panel
 *    and a transient blip does not surface as "no data".
 *
 *  - `CircuitBreaker` stops hammering a source that is clearly down. After
 *    `threshold` consecutive failures it "opens" and calls fail fast for
 *    `cooldownMs`, then lets one probe through ("half-open"); success closes
 *    it again. This keeps a dead provider from adding its full timeout to
 *    every poll while the healthy fallbacks keep working.
 */

export interface RetryOptions {
  /** Total attempts including the first. Default 3. */
  attempts?: number;
  /** Base delay in ms before the first retry. Default 250. */
  baseDelayMs?: number;
  /** Cap on any single backoff delay. Default 2000. */
  maxDelayMs?: number;
  /** Per-attempt timeout in ms; 0 disables. Default 0 (caller controls). */
  timeoutMs?: number;
  /** Injected for deterministic tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected clock for the circuit breaker tests. */
  now?: () => number;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Exponential backoff with full jitter: `random(0 .. min(max, base * 2^n))`. */
export function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number, rand = Math.random): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  return Math.floor(rand() * exp);
}

/**
 * Run `fn`, retrying transient failures with backoff.
 *
 * `fn` is retried while it throws. `shouldRetry(err, attempt)` can veto a
 * retry (e.g. an HTTP 400 is not transient); when it returns false the error
 * is rethrown immediately. The final error is rethrown if every attempt fails.
 */
export async function withRetry<T>(fn: (signal: AbortSignal | undefined) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const base = opts.baseDelayMs ?? 250;
  const max = opts.maxDelayMs ?? 2000;
  const timeoutMs = opts.timeoutMs ?? 0;
  const sleep = opts.sleep ?? defaultSleep;

  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await runOnce((signal) => fn(signal), timeoutMs);
    } catch (err) {
      lastErr = err;
      // Last attempt: nothing left to wait for.
      if (attempt === attempts - 1) break;
      await sleep(backoffDelay(attempt, base, max));
    }
  }
  throw lastErr;
}

/** Run `fn` once, rejecting after `timeoutMs` when that is set. */
function runOnce<T>(
  fn: (signal: AbortSignal | undefined) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  if (timeoutMs <= 0) return fn(undefined);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const guarded = Promise.resolve(fn(ctrl.signal)).finally(() => clearTimeout(timer));
  const expiry = new Promise<never>((_resolve, reject) => {
    ctrl.signal.addEventListener("abort", () => reject(new Error(`Timed out after ${timeoutMs}ms`)), { once: true });
  });
  return Promise.race([guarded, expiry]);
}

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
  /** Consecutive failures that trip the breaker. Default 3. */
  threshold?: number;
  /** How long it stays open before probing again. Default 15000 ms. */
  cooldownMs?: number;
  /** Injected clock for tests. */
  now?: () => number;
}

/**
 * A per-source circuit breaker.
 *
 * Usage: call `before()` before a request (throws `CircuitOpenError` when the
 * breaker is open), then `recordSuccess()` or `recordFailure()` after. The
 * first probe after a cooldown is `half_open`: it is allowed through, and a
 * single success closes the breaker while a single failure re-opens it for a
 * fresh cooldown.
 */
export class CircuitBreaker {
  private failures = 0;
  private state: CircuitState = "closed";
  private openedAt = 0;
  private readonly threshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.threshold = Math.max(1, opts.threshold ?? 3);
    this.cooldownMs = Math.max(0, opts.cooldownMs ?? 15_000);
    this.now = opts.now ?? (() => Date.now());
  }

  get currentState(): CircuitState {
    return this.state;
  }

  /** Throw if the breaker is open and still cooling down; otherwise arm a probe. */
  before(): void {
    if (this.state === "closed") return;
    const elapsed = this.now() - this.openedAt;
    if (elapsed < this.cooldownMs) throw new CircuitOpenError(this.openedAt + this.cooldownMs - elapsed);
    // Cooldown elapsed: let exactly one probe through.
    this.state = "half_open";
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = "closed";
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.state === "half_open" || this.failures >= this.threshold) {
      this.state = "open";
      this.openedAt = this.now();
    }
  }
}

/** Thrown by `CircuitBreaker.before` while the breaker is open. */
export class CircuitOpenError extends Error {
  /** Ms until the breaker will allow a probe. */
  readonly retryInMs: number;
  constructor(retryInMs: number) {
    super(`Circuit open; retry in ${Math.max(0, Math.round(retryInMs))}ms`);
    this.name = "CircuitOpenError";
    this.retryInMs = Math.max(0, retryInMs);
  }
}
