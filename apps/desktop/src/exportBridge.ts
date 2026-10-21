import type { Candle } from "@ezyview/data-adapters";

/**
 * What a chart cell offers an exporter: a composited PNG, the bars the user
 * can see (replay-sliced), and the identity needed to name the file.
 *
 * The registry is module state, not store state: cells publish and withdraw
 * as they mount and unmount, and menus (Toolbar + Ctrl+K palette) read the
 * active one on demand. Everything is null-safe in node — vitest never has a
 * document, and an empty registry is the normal boot state.
 */
export interface ExportSource {
  /** Data URL of the composited chart image, or null when it cannot be built. */
  getPng: () => string | null;
  /** Bars currently shown on this cell (full history only when not replaying). */
  getCandles: () => readonly Candle[];
  meta: () => { symbol: string; resolution: string };
}

const sources = new Map<number, ExportSource>();
let activeId: number | null = null;
/** Bumped on every change so React can subscribe via useSyncExternalStore. */
let version = 0;
const listeners = new Set<() => void>();

function notify(): void {
  version += 1;
  for (const listener of listeners) listener();
}

/**
 * Publish a chart cell's export source under `id` (the layout cell index).
 * Returns the unregister function; it withdraws only its own registration.
 *
 * The active pointer is a cell index, not a source, so it survives
 * unregister: a layout switch unmounts cell N and mounts a new cell N while
 * `activeChart` stays N, and nothing re-sets focus. `getActiveExportSource`
 * already returns null for an empty slot.
 */
export function registerExportSource(id: number, src: ExportSource): () => void {
  sources.set(id, src);
  notify();
  return () => {
    // A later cell may have re-registered the id (layout remount); never
    // delete someone else's source.
    if (sources.get(id) === src) sources.delete(id);
    notify();
  };
}

/** Point every exporter at one cell (its layout index), or clear with null. */
export function setActiveExportSource(id: number | null): void {
  activeId = id;
  notify();
}

/** The active cell's source, or null when nothing usable is registered. */
export function getActiveExportSource(): ExportSource | null {
  if (activeId === null) return null;
  return sources.get(activeId) ?? null;
}

/** Change feed for `useSyncExternalStore`; fires on register/unregister/focus. */
export function subscribeExportSources(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Snapshot for `useSyncExternalStore`: a number that changes on any edit. */
export function getExportSourceVersion(): number {
  return version;
}
