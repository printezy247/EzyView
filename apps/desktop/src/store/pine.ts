import type { PineScriptRecord, PineScriptVersion, WorkspaceStore } from "./types";

type SliceSet = (
  partial: Partial<WorkspaceStore> | ((s: WorkspaceStore) => Partial<WorkspaceStore> | WorkspaceStore),
) => void;

type PineSliceKeys = "pineScripts" | "savePineScript" | "restorePineScriptVersion" | "deletePineScript" | "setPineResult";

/** Pine-script slice: saved sources with their archived versions and last run. */
export function createPineSlice(set: SliceSet, _get: () => WorkspaceStore): Pick<WorkspaceStore, PineSliceKeys> {
  return {
    pineScripts: {},

      savePineScript: (id, name, source) =>
        set((s) => {
          const existing = s.pineScripts[id];
          // Re-saving the same source must not spam the history: only a
          // changed head archives the one it replaces (newest first, capped).
          const versions =
            existing && existing.source !== source
              ? archiveVersion(existing.versions, existing.source)
              : existing?.versions;
          return {
            pineScripts: {
              ...s.pineScripts,
              // Keep the last run's output when only the source changed.
              [id]: {
                id,
                name,
                source,
                options: existing?.options ?? null,
                plots: existing?.plots ?? [],
                orders: existing?.orders ?? [],
                error: existing?.error ?? null,
                // Spread so a record without the snapshot stays without it.
                ...(existing?.inputs !== undefined ? { inputs: existing.inputs } : {}),
                ...(versions !== undefined ? { versions } : {}),
              },
            },
          };
        }),

      restorePineScriptVersion: (id, index) =>
        set((s) => {
          const existing = s.pineScripts[id];
          const entry = existing?.versions?.[index];
          // Unknown id, out-of-range index, or a pre-versioning record: no-op.
          if (!existing || !entry) return s;
          return {
            pineScripts: {
              ...s.pineScripts,
              [id]: {
                ...existing,
                // The current head exists nowhere else — archive it before the
                // restore overwrites it (same prepend+cap as a save).
                ...(existing.source !== entry.source
                  ? { versions: archiveVersion(existing.versions, existing.source) }
                  : {}),
                source: entry.source,
              },
            },
          };
        }),

      deletePineScript: (id) =>
        set((s) => {
          const next = { ...s.pineScripts };
          delete next[id];
          return { pineScripts: next };
        }),

      setPineResult: (id, result) =>
        set((s) => {
          if (!result) return {};
          const existing = s.pineScripts[id];
          // A run writes the live buffer into the record; archive the head it
          // replaces so a later same-source save cannot destroy it.
          const versions =
            existing && existing.source !== result.source
              ? archiveVersion(existing.versions, existing.source)
              : existing?.versions;
          return {
            pineScripts: {
              ...s.pineScripts,
              [id]: {
                ...existing,
                ...result,
                id,
                // Spread so a pre-versioning record stays without the key.
                ...(versions !== undefined ? { versions } : {}),
              },
            },
          };
        }),
  };
}

/** How many superseded sources a script keeps in its version list. */
const MAX_PINE_VERSIONS = 20;

function archiveVersion(
  versions: PineScriptVersion[] | undefined,
  prevSource: string,
): PineScriptVersion[] {
  return [
    { source: prevSource, savedAt: Math.floor(Date.now() / 1000) },
    ...(versions ?? []),
  ].slice(0, MAX_PINE_VERSIONS);
}

/**
 * Rebuild the saved-scripts map from a storage blob. Blobs written before
 * versioning lack `versions`/`inputs` (left absent, not invented), and any
 * entry missing the required id/name/source strings is dropped rather than
 * throwing — a corrupt save must never brick startup.
 */
export function restorePineScripts(raw: unknown): Record<string, PineScriptRecord> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, PineScriptRecord> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    // A literal "__proto__" key on `out` would fire Object.prototype's
    // inherited setter and retarget the map's prototype instead of creating
    // an own key — drop it like any other invalid entry.
    if (id === "__proto__") continue;
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    const rec = value as Partial<PineScriptRecord>;
    if (typeof rec.id !== "string" || typeof rec.name !== "string" || typeof rec.source !== "string") continue;
    const versions = Array.isArray(rec.versions)
      ? rec.versions.filter(
          (v): v is PineScriptVersion =>
            typeof v === "object" && v !== null && typeof v.source === "string" && typeof v.savedAt === "number",
        )
      : undefined;
    out[id] = {
      id: rec.id,
      name: rec.name,
      source: rec.source,
      options:
        typeof rec.options === "object" && rec.options !== null && !Array.isArray(rec.options)
          ? rec.options
          : null,
      plots: Array.isArray(rec.plots) ? rec.plots : [],
      orders: Array.isArray(rec.orders) ? rec.orders : [],
      error: typeof rec.error === "string" ? rec.error : null,
      ...(rec.inputs !== undefined && typeof rec.inputs === "object" && rec.inputs !== null
        ? { inputs: rec.inputs }
        : {}),
      ...(versions !== undefined ? { versions } : {}),
    };
  }
  return out;
}

