/**
 * Workspace snapshot: the file the desktop app keeps current so MCP clients
 * can read what the user has (layouts, alerts, watchlist, journal).
 *
 * The MCP server is a separate stdio process and cannot reach the app's
 * localStorage, so the app writes this JSON into its data folder and we read
 * it on demand. A missing or unreadable file is a normal state (app never
 * ran), reported to the model rather than thrown.
 */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { posix, win32 } from "node:path";

export const APP_ID = "com.printezy247.ezyview";
export const SNAPSHOT_FILE = "workspace-snapshot.json";

export interface SnapshotChart {
  symbol: string;
  resolution: string;
  chartType: string;
  indicators: string[];
  drawings: unknown[];
}

export interface SnapshotLayout {
  id: string;
  name: string;
  grid: string;
  active: boolean;
  charts: SnapshotChart[];
}

export interface WorkspaceSnapshot {
  format: "ezyview-workspace";
  version: 1;
  updatedAt: number;
  layouts: SnapshotLayout[];
  alerts: unknown[];
  watchlist: unknown[];
  journal: { entries: unknown[]; notes: unknown[] };
}

/** Where the desktop app's data folder lives on each OS (Tauri `app_data_dir`). */
export function defaultSnapshotPath(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  if (env.EZYVIEW_SNAPSHOT && env.EZYVIEW_SNAPSHOT.trim() !== "") return env.EZYVIEW_SNAPSHOT.trim();
  // Join with the separators of the platform being asked about, not the host's.
  const p = platform === "win32" ? win32 : posix;
  if (platform === "win32") {
    const appData = env.APPDATA && env.APPDATA.trim() !== "" ? env.APPDATA.trim() : p.join(home, "AppData", "Roaming");
    return p.join(appData, APP_ID, SNAPSHOT_FILE);
  }
  if (platform === "darwin") return p.join(home, "Library", "Application Support", APP_ID, SNAPSHOT_FILE);
  const xdg = env.XDG_DATA_HOME && env.XDG_DATA_HOME.trim() !== "" ? env.XDG_DATA_HOME.trim() : p.join(home, ".local", "share");
  return p.join(xdg, APP_ID, SNAPSHOT_FILE);
}

/** Structural check; anything else is "no usable snapshot". */
export function parseSnapshot(text: string): WorkspaceSnapshot | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const s = data as Record<string, unknown>;
  const journal = s.journal as Record<string, unknown> | undefined;
  if (s.format !== "ezyview-workspace" || s.version !== 1) return null;
  if (!Array.isArray(s.layouts) || !Array.isArray(s.alerts) || !Array.isArray(s.watchlist)) return null;
  if (!journal || !Array.isArray(journal.entries) || !Array.isArray(journal.notes)) return null;
  return data as WorkspaceSnapshot;
}

export async function loadSnapshot(path: string = defaultSnapshotPath()): Promise<WorkspaceSnapshot> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | null)?.code;
    if (code && code !== "ENOENT") {
      throw new Error(`Cannot read EzyView workspace snapshot at ${path} (${code}).`, { cause: err });
    }
    throw new Error(`No EzyView workspace snapshot at ${path}. Open the EzyView desktop app once so it can write one.`, { cause: err });
  }
  const snapshot = parseSnapshot(text);
  if (!snapshot) throw new Error(`Workspace snapshot at ${path} is not a valid EzyView snapshot.`);
  return snapshot;
}
