/**
 * Workspace backup: one JSON snapshot of every localStorage namespace the app
 * persists, plus a restore path that parks a corrupt destination before
 * overwriting it (the same `.corrupt` convention the workspace store uses).
 *
 * Import is additive: a namespace the backup does not carry is left untouched,
 * so restoring an older backup cannot silently erase newer journal notes.
 */

/** Every localStorage key a backup carries, in stable order. */
export const BACKUP_KEYS = [
  "ezyview.workspace",
  "ezyview.journal.v1",
  "ezyview.mt5.v1",
  "ezyview.paper-account.v1",
  "ezyview.mt5.accounts.v1",
  "ezyview.mt5.safety.v1",
  "ezyview.drawingTemplates",
  "ezyview.recentSymbols",
  "ezyview.notify.v1",
  "ezyview.sound.v1",
  "ezyview.volume.v1",
] as const;

export interface WorkspaceBackup {
  app: "ezyview";
  kind: "workspace-backup";
  version: 1;
  createdAt: number;
  /** Raw saved blobs, keyed exactly as they sit in localStorage. */
  state: Record<string, string>;
}

const corruptKeyOf = (key: string): string => `${key}.corrupt`;

/** `.corrupt` payloads parked earlier by a failed import or a failed save. */
export function parkedCorruptKeys(): string[] {
  if (typeof localStorage === "undefined") return [];
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.endsWith(".corrupt")) out.push(key);
  }
  return out.sort();
}

export function downloadCorruptBackup(key: string): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(key);
}

/** Drop a parked `.corrupt` payload; true when something was actually removed. */
export function dismissParkedCorrupt(key: string): boolean {
  const existed = (typeof localStorage !== "undefined" && localStorage.getItem(key)) !== null;
  if (existed) localStorage.removeItem(key);
  return existed;
}

/** Snapshot the current namespaces into a serialisable envelope. */
export function readWorkspaceBackup(): WorkspaceBackup {
  const state: Record<string, string> = {};
  if (typeof localStorage !== "undefined") {
    for (const key of BACKUP_KEYS) {
      const value = localStorage.getItem(key);
      if (value !== null) state[key] = value;
    }
  }
  return {
    app: "ezyview",
    kind: "workspace-backup",
    version: 1,
    createdAt: Math.floor(Date.now() / 1000),
    state,
  };
}

/** Serialise the snapshot for download. */
export function serializeWorkspaceBackup(backup: WorkspaceBackup): string {
  return JSON.stringify(backup, null, 2);
}

/** Parse and validate a backup envelope; the payload keys are not re-validated — applying a blob is what the underlying stores already guard. */
export function parseWorkspaceBackup(raw: string): { backup: WorkspaceBackup } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "Not valid JSON" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { error: "Not a backup file" };
  const obj = parsed as Record<string, unknown>;
  if (obj.app !== "ezyview" || obj.kind !== "workspace-backup") {
    return { error: "Not an EzyView workspace backup" };
  }
  if (obj.version !== 1) return { error: `Unsupported backup version: ${String(obj.version)}` };
  const state = obj.state;
  if (!state || typeof state !== "object" || Array.isArray(state)) return { error: "Backup has no saved state" };
  const clean: Record<string, string> = {};
  for (const key of BACKUP_KEYS) {
    const value = (state as Record<string, unknown>)[key];
    if (typeof value === "string") clean[key] = value;
  }
  const createdAt = typeof obj.createdAt === "number" && Number.isFinite(obj.createdAt) ? obj.createdAt : 0;
  return { backup: { app: "ezyview", kind: "workspace-backup", version: 1, createdAt, state: clean } };
}

export interface ApplyResult {
  /** Keys restored. */
  applied: string[];
  /** Keys the backup did not carry; existing data is preserved. */
  absent: string[];
}

/**
 * Restore every backup key. A destination whose current value cannot be parsed
 * is parked to `${key}.corrupt` first, so a bad import can be undone.
 */
export function applyWorkspaceBackup(backup: WorkspaceBackup): ApplyResult {
  const result: ApplyResult = { applied: [], absent: [] };
  if (typeof localStorage === "undefined") return result;
  for (const key of BACKUP_KEYS) {
    const snapshot = backup.state[key];
    if (snapshot === undefined) {
      result.absent.push(key);
      continue;
    }
    const current = localStorage.getItem(key);
    if (current !== null) {
      try {
        JSON.parse(current);
      } catch {
        localStorage.setItem(corruptKeyOf(key), current);
      }
    }
    localStorage.setItem(key, snapshot);
    result.applied.push(key);
  }
  return result;
}
