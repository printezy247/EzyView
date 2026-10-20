import { create } from "zustand";
import { entriesFromDeals, existingKeys } from "@ezyview/journal";
import type { JournalEntry, JournalNote } from "@ezyview/journal";
import type { Deal } from "@ezyview/data-adapters";

const STORAGE_KEY = "ezyview.journal.v1";

/** Screenshots are data URLs; a corrupted or hostile blob must not break boot. */
const MAX_ENTRIES = 500;
const MAX_NOTES = 500;
const MAX_REVIEWS = 200;

/** A saved daily/weekly review; `key` is a `dateKey` string. */
export interface SavedReview {
  id: string;
  key: string;
  period: "daily" | "weekly";
  text: string;
  savedAt: number;
}

/** Prop-firm risk limits; an absent field means "no limit set". */
export interface PropFirmLimits {
  dailyLossLimit?: number;
  maxDrawdownLimit?: number;
}

interface Persisted {
  entries: JournalEntry[];
  notes: JournalNote[];
  savedReviews: SavedReview[];
  propFirm: PropFirmLimits;
}

function emptyPersisted(): Persisted {
  return { entries: [], notes: [], savedReviews: [], propFirm: {} };
}

function readState(): Persisted {
  if (typeof localStorage === "undefined") return emptyPersisted();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyPersisted();
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries.slice(0, MAX_ENTRIES) : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes.slice(0, MAX_NOTES) : [],
      savedReviews: readReviews(parsed.savedReviews),
      propFirm: readPropFirm(parsed.propFirm),
    };
  } catch {
    // An unreadable journal costs the user nothing but its old contents.
    return emptyPersisted();
  }
}

/** Old blobs predate reviews: drop malformed rows, keep at most MAX_REVIEWS. */
function readReviews(value: unknown): SavedReview[] {
  if (!Array.isArray(value)) return [];
  const out: SavedReview[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const r = row as Partial<SavedReview>;
    if (typeof r.id !== "string" || typeof r.text !== "string" || typeof r.key !== "string") continue;
    if (r.period !== "daily" && r.period !== "weekly") continue;
    out.push({
      id: r.id,
      key: r.key,
      period: r.period,
      text: r.text,
      savedAt: typeof r.savedAt === "number" ? r.savedAt : 0,
    });
    if (out.length >= MAX_REVIEWS) break;
  }
  return out;
}

/** Only a positive number counts as a limit; anything else means "unset". */
function readPropFirm(value: unknown): PropFirmLimits {
  if (!value || typeof value !== "object") return {};
  const src = value as PropFirmLimits;
  const out: PropFirmLimits = {};
  if (typeof src.dailyLossLimit === "number" && src.dailyLossLimit > 0) out.dailyLossLimit = src.dailyLossLimit;
  if (typeof src.maxDrawdownLimit === "number" && src.maxDrawdownLimit > 0) out.maxDrawdownLimit = src.maxDrawdownLimit;
  return out;
}

/** Trim, drop empties, dedupe exact matches keeping first-seen order. */
function normalizeTags(tags: readonly string[] | undefined): string[] | undefined {
  if (!Array.isArray(tags)) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = typeof raw === "string" ? raw.trim() : "";
    if (tag === "" || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out.length > 0 ? out : undefined;
}

function writeState(state: Persisted): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota: the last screenshots stay for this session only.
  }
}

const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export interface JournalState {
  entries: JournalEntry[];
  notes: JournalNote[];
  savedReviews: SavedReview[];
  propFirm: PropFirmLimits;
  /** Free-text filter over symbol, tags, setup and note text. */
  query: string;
  setQuery(query: string): void;
  /** Adds a timestamped observation, optionally with the current chart image. */
  addNote(note: Omit<JournalNote, "id">): void;
  removeNote(id: string): void;
  /** Prepends a trade; tags are trimmed, deduped, and empties dropped. */
  addEntry(input: Omit<JournalEntry, "id">): void;
  removeEntry(id: string): void;
  updateEntry(id: string, patch: Partial<JournalEntry>): void;
  /** Flips one rule checkbox; no-op when the entry or index is missing. */
  toggleRule(entryId: string, ruleIndex: number): void;
  /** Saves a review, replacing any prior one with the same key + period. */
  saveReview(input: Omit<SavedReview, "id" | "savedAt">): void;
  removeReview(id: string): void;
  /** Shallow-merges limits; pass `undefined` to clear a field. */
  setPropFirm(patch: Partial<PropFirmLimits>): void;
  /** Pulls closed trades out of a deal history; returns how many were new. */
  importDeals(deals: readonly Deal[], source: JournalEntry["source"]): number;
  clear(): void;
}

const boot = readState();

export const useJournal = create<JournalState>((set, get) => {
  /** Persist the durable slice; the in-memory `query` never lands on disk. */
  const persist = (): void => {
    const s = get();
    writeState({ entries: s.entries, notes: s.notes, savedReviews: s.savedReviews, propFirm: s.propFirm });
  };

  return {
    entries: boot.entries,
    notes: boot.notes,
    savedReviews: boot.savedReviews,
    propFirm: boot.propFirm,
    query: "",

    setQuery(query) {
      set({ query });
    },

    addNote(note) {
      const next: JournalNote[] = [{ ...note, id: uid() }, ...get().notes].slice(0, MAX_NOTES);
      set({ notes: next });
      persist();
    },

    removeNote(id) {
      const next = get().notes.filter((note) => note.id !== id);
      set({ notes: next });
      persist();
    },

    addEntry(input) {
      const { tags, ...rest } = input;
      const clean = normalizeTags(tags);
      // Omit the tags key entirely when nothing survives dedupe.
      const entry: JournalEntry = { ...rest, id: uid(), ...(clean ? { tags: clean } : {}) };
      const next = [entry, ...get().entries].slice(0, MAX_ENTRIES);
      set({ entries: next });
      persist();
    },

    removeEntry(id) {
      const next = get().entries.filter((entry) => entry.id !== id);
      set({ entries: next });
      persist();
    },

    updateEntry(id, patch) {
      const next = get().entries.map((entry) => (entry.id === id ? Object.assign({}, entry, patch) : entry));
      set({ entries: next });
      persist();
    },

    toggleRule(entryId, ruleIndex) {
      const entries = get().entries;
      const idx = entries.findIndex((entry) => entry.id === entryId);
      const target = idx < 0 ? undefined : entries[idx];
      const rules = target?.rules;
      if (!target || !rules || ruleIndex < 0 || ruleIndex >= rules.length) return;
      const flipped = rules.map((rule, j) => (j === ruleIndex ? Object.assign({}, rule, { done: !rule.done }) : rule));
      const next = entries.slice();
      next[idx] = Object.assign({}, target, { rules: flipped });
      set({ entries: next });
      persist();
    },

    saveReview(input) {
      const savedAt = Math.floor(Date.now() / 1000);
      const existing = get().savedReviews;
      const at = existing.findIndex((r) => r.key === input.key && r.period === input.period);
      if (at >= 0) {
        const prev = existing[at];
        if (!prev) return;
        // Replace in place; the id survives so external references stay stable.
        const next = existing.map((r, i) => (i === at ? { ...input, id: prev.id, savedAt } : r));
        set({ savedReviews: next });
      } else {
        // Cap only when growing: a replacement above is in-place, so the match
        // can never be the row the cap drops. The write cap mirrors readReviews,
        // so a reload can never trim what this session just saved.
        set({ savedReviews: [{ ...input, id: uid(), savedAt }, ...existing].slice(0, MAX_REVIEWS) });
      }
      persist();
    },

    removeReview(id) {
      const next = get().savedReviews.filter((r) => r.id !== id);
      set({ savedReviews: next });
      persist();
    },

    setPropFirm(patch) {
      // Object.assign on a copy so `{ dailyLossLimit: undefined }` clears that field;
      // JSON.stringify then drops the undefined key on write.
      set({ propFirm: Object.assign({}, get().propFirm, patch) });
      persist();
    },

    importDeals(deals, source) {
      const known = existingKeys(get().entries);
      const imported = entriesFromDeals(deals, source).filter((entry) => !known.has(entry.id));
      if (imported.length === 0) return 0;
      const next = [...imported, ...get().entries].slice(0, MAX_ENTRIES);
      set({ entries: next });
      persist();
      return imported.length;
    },

    clear() {
      set({ entries: [], notes: [], savedReviews: [], propFirm: {} });
      persist();
    },
  };
});

/**
 * Chart snapshot for a note.
 *
 * The chart is plain canvases on an opaque background: composite every layer
 * (price panes, scale, volume) into one image so the note keeps what the user
 * was actually looking at.
 */
export function captureChart(): string | null {
  if (typeof document === "undefined") return null;
  const host = document.querySelector('[data-testid="chart-host"]');
  if (!(host instanceof HTMLElement)) return null;
  const canvases = [...host.querySelectorAll("canvas")].filter((c): c is HTMLCanvasElement => c instanceof HTMLCanvasElement);
  if (canvases.length === 0) return null;

  const hostRect = host.getBoundingClientRect();
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(hostRect.width));
  out.height = Math.max(1, Math.round(hostRect.height));
  const ctx = out.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#0e1117";
  ctx.fillRect(0, 0, out.width, out.height);
  for (const canvas of canvases) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    try {
      ctx.drawImage(canvas, rect.left - hostRect.left, rect.top - hostRect.top, rect.width, rect.height);
    } catch {
      // A zero-sized or backing-store-less layer is skipped, never fatal.
    }
  }
  try {
    return out.toDataURL("image/png");
  } catch {
    return null;
  }
}
