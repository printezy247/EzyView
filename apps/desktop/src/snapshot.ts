/**
 * Workspace snapshot for MCP clients.
 *
 * The MCP server is a separate process that cannot see localStorage, so the
 * desktop app keeps a JSON file current in its data folder (shape owned by
 * `packages/mcp-server/src/snapshot.ts`). The builder is pure; the sync below
 * is a debounced store subscription that only runs under Tauri.
 */
import type { JournalEntry, JournalNote } from "@ezyview/journal";
import { useJournal } from "./journal";
import type { Layout } from "./layout";
import { useWorkspace } from "./store";
import type { PriceAlert } from "@ezyview/data-adapters";
import type { WatchEntry } from "./store";

/** Newest-first caps keep the file small enough to rewrite on every change. */
const MAX_ENTRIES = 2000;
const MAX_NOTES = 500;

interface SnapshotInput {
  layouts: readonly Layout[];
  activeLayoutId: string;
  alerts: readonly PriceAlert[];
  watchlist: readonly WatchEntry[];
  entries: readonly JournalEntry[];
  notes: readonly JournalNote[];
}

/** Screenshots are base64 images: useful in the app, dead weight for an agent. */
const withoutScreenshots = <T extends { screenshots?: string[] }>(item: T): Omit<T, "screenshots"> => {
  const { screenshots: _dropped, ...rest } = item;
  return rest;
};

export function buildSnapshot(input: SnapshotInput, now: number = Date.now()) {
  return {
    format: "ezyview-workspace" as const,
    version: 1 as const,
    updatedAt: Math.floor(now / 1000),
    layouts: input.layouts.map((layout) => ({
      id: layout.id,
      name: layout.name,
      grid: layout.grid,
      active: layout.id === input.activeLayoutId,
      charts: layout.charts.map((chart) => ({
        symbol: chart.symbol,
        resolution: chart.resolution,
        chartType: chart.chartType,
        indicators: chart.indicators.map((i) => i.def.id),
        drawings: chart.drawings,
      })),
    })),
    alerts: input.alerts,
    watchlist: input.watchlist.map((w) => ({ symbol: w.symbol, price: w.price, changePct: w.changePct })),
    journal: {
      entries: input.entries.toSorted((a, b) => b.entryTime - a.entryTime).slice(0, MAX_ENTRIES).map(withoutScreenshots),
      notes: input.notes.toSorted((a, b) => b.time - a.time).slice(0, MAX_NOTES).map(withoutScreenshots),
    },
  };
}

const inTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function writeSnapshot(attempt = 0): Promise<boolean> {
  const ws = useWorkspace.getState();
  const journal = useJournal.getState();
  const json = JSON.stringify(
    buildSnapshot({
      layouts: ws.layouts,
      activeLayoutId: ws.activeLayoutId,
      alerts: ws.alerts,
      watchlist: ws.watchlist,
      entries: journal.entries,
      notes: journal.notes,
    }),
  );
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("write_snapshot", { json });
    return true;
  } catch {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      return writeSnapshot(attempt + 1);
    }
    return false;
  }
}

/**
 * Keep the snapshot file current. Writes are debounced (a drag fires the
 * store dozens of times a second) and failures are swallowed: the snapshot is
 * a convenience for agents and must never disturb the app.
 */
export function startSnapshotSync(debounceMs = 1500): () => void {
  if (!inTauri()) return () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void writeSnapshot(), debounceMs);
  };
  // Quote polls churn watchlist prices and alert history many times a minute;
  // only structural changes are worth rewriting the file for.
  const offWs = useWorkspace.subscribe((s, prev) => {
    const symbols = (state: typeof s) => state.watchlist.map((w) => w.symbol).join(",");
    if (
      s.layouts !== prev.layouts ||
      s.activeLayoutId !== prev.activeLayoutId ||
      s.alerts !== prev.alerts ||
      symbols(s) !== symbols(prev)
    ) {
      schedule();
    }
  });
  const offJournal = useJournal.subscribe(schedule);
  schedule();
  return () => {
    clearTimeout(timer);
    offWs();
    offJournal();
  };
}
