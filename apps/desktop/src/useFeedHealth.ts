import { useSyncExternalStore } from "react";
import { feedHealth } from "./feedHealth";
import type { FeedStatus } from "./feedHealth";

export interface FeedHealthState {
  status: FeedStatus;
  message: string | null;
}

/**
 * The live health of one market-data source.
 *
 * A panel that polls a source uses this to say "stale" instead of showing
 * the last known price as if it were live.
 */
export function useFeedHealth(source: string): FeedHealthState {
  const status = useSyncExternalStore(
    feedHealth.subscribe,
    () => feedHealth.statusOf(source),
    () => "ok" as FeedStatus,
  );
  const message = useSyncExternalStore(
    feedHealth.subscribe,
    () => feedHealth.messageOf(source),
    () => null,
  );
  return { status, message };
}
