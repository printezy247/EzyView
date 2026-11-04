import type { PersistStorage, StorageValue } from "zustand/middleware";
import type { PriceAlert } from "@ezyview/data-adapters";
import type { DrawingStyle, DrawingToolId } from "@ezyview/drawing-tools";
import type { PersistedWorkspace, AppTheme, Density } from "../layout";
import type { EventOptions } from "../eventOptions";
import type { ChartTemplate } from "../chartTemplates";
import { notice } from "../notice";
import { readDetached } from "../windows";
import type { PineScriptRecord, WatchEntry } from "./types";

/** Write one workspace blob, surviving a full disk. */
export function writeWorkspace(name: string, value: string): void {
  try {
    localStorage.setItem(name, value);
  } catch {
    // Quota exceeded. The corrupt-payload backup is the first thing to go.
    try {
      localStorage.removeItem(`${name}.corrupt`);
      localStorage.setItem(name, value);
    } catch {
      // Still full: the workspace stays in memory. Tell the user once so the
      // loss on quit is not a surprise.
      notice.alert("Storage is full — recent changes may be lost when you quit.");
    }
  }
}

/** Test seam: the quota-failure path must be observable without real storage. */
export const writeWorkspaceForTest = writeWorkspace;

/** The slice of the workspace that reaches localStorage. */
export type PersistedState = PersistedWorkspace & {
  pineScripts: Record<string, PineScriptRecord>;
  eventOptions: EventOptions;
  chartTemplates: ChartTemplate[];
  appTheme: AppTheme;
  density: Density;
  alerts: PriceAlert[];
  watchlist: WatchEntry[];
  favoriteTools: DrawingToolId[];
  drawingToolStyles: Partial<Record<DrawingToolId, DrawingStyle>>;
  stayInDrawingMode: boolean;
  lockAllDrawings: boolean;
};

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let queued: { name: string; value: StorageValue<PersistedState> } | null = null;

function flushWorkspace(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!queued) return;
  const { name, value } = queued;
  queued = null;
  try {
    writeWorkspace(name, JSON.stringify(value));
  } catch {
    // A value that cannot be serialised must not take the app down.
  }
}

if (typeof window !== "undefined") window.addEventListener("pagehide", flushWorkspace);

/**
 * Workspace persistence that survives the two ways localStorage hurts:
 * a truncated payload (which used to wipe every layout, drawing and script)
 * and a full disk (which used to throw out of the store's `set`).
 *
 * The state is serialised inside the debounce, not before it: a drawing
 * drag updates the store on every pointer move, and serialising the whole
 * workspace each time was the app's biggest source of jank.
 */
export const workspaceStorage: PersistStorage<PersistedState> = {
  getItem: (name) => {
    if (typeof localStorage === "undefined") return null;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(name);
    } catch {
      return null;
    }
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(raw) as StorageValue<PersistedState>;
      if (!parsed || typeof parsed !== "object" || !parsed.state) return null;
      return parsed;
    } catch {
      // Corrupt payload: keep a copy for support and start from defaults
      // instead of letting the next write destroy the good data.
      try {
        localStorage.setItem(`${name}.corrupt`, raw);
      } catch {
        // ignore
      }
      return null;
    }
  },
  setItem: (name, value) => {
    if (typeof localStorage === "undefined") return;
    if (readDetached(globalThis.location?.search ?? "")) return; // detached windows never write
    queued = { name, value };
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(flushWorkspace, 400);
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};
