/**
 * Which market-data sources are failing right now.
 *
 * The quote layer answers with `null` when a provider is down, which is the
 * right shape for a caller but hides the outage: a panel that shows the last
 * known price looks live while it is stale. This keeps the reason per source
 * so the panels can say "stale" instead of pretending.
 */

export type FeedStatus = "ok" | "failed";

interface FeedState {
  status: FeedStatus;
  message: string | null;
  failures: number;
  /** When the failure was first seen, for "broken for N s" labels. */
  since: number;
}

const states = new Map<string, FeedState>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function stateOf(source: string): FeedState {
  const key = source.trim();
  let state = states.get(key);
  if (!state) {
    state = { status: "ok", message: null, failures: 0, since: 0 };
    states.set(key, state);
  }
  return state;
}

/** Note that a source failed. The first reason is kept until it recovers. */
export function recordFeedFailure(source: string, message: string): void {
  const key = source.trim();
  if (!key) return;
  const state = stateOf(key);
  const first = state.status === "ok";
  states.set(key, {
    status: "failed",
    message: state.message ?? message,
    failures: state.failures + 1,
    since: first ? Date.now() : state.since,
  });
  notify();
}

/** Note that a source answered again. */
export function recordFeedSuccess(source: string): void {
  const key = source.trim();
  if (!key) return;
  const state = stateOf(key);
  if (state.status === "ok") return;
  states.set(key, { status: "ok", message: null, failures: 0, since: 0 });
  notify();
}

export const feedHealth = {
  statusOf(source: string): FeedStatus {
    if (!source.trim()) return "ok";
    return stateOf(source).status;
  },
  messageOf(source: string): string | null {
    if (!source.trim()) return null;
    return stateOf(source).message;
  },
  failuresOf(source: string): number {
    if (!source.trim()) return 0;
    return stateOf(source).failures;
  },
  /** True when the source failed and has not recovered. */
  isDown(source: string): boolean {
    return feedHealth.statusOf(source) === "failed";
  },
  /** Subscribe to health changes; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  reset(): void {
    states.clear();
    notify();
  },
};
