import { create } from "zustand";
import { entriesFromDeals, existingKeys } from "@ezyview/journal";
import type { JournalEntry, JournalNote, TradePlan, TradePlanStatus } from "@ezyview/journal";
import type { Deal } from "@ezyview/data-adapters";
import { compositeCanvasesToPng } from "./chartImage";

const STORAGE_KEY = "ezyview.journal.v1";

/** Screenshots are data URLs; a corrupted or hostile blob must not break boot. */
const MAX_ENTRIES = 500;
const MAX_NOTES = 500;
const MAX_REVIEWS = 200;
const MAX_PLANS = 500;

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
  plans: TradePlan[];
}

function emptyPersisted(): Persisted {
  return { entries: [], notes: [], savedReviews: [], propFirm: {}, plans: [] };
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
      plans: readPlans(parsed.plans),
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

const PLAN_STATUSES = new Set<TradePlanStatus>(["planned", "executed", "missed", "cancelled"]);

/** Drop malformed plan rows, keep the newest MAX_PLANS valid ones. */
function readPlans(value: unknown): TradePlan[] {
  if (!Array.isArray(value)) return [];
  const out: TradePlan[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const p = row as Partial<TradePlan>;
    if (typeof p.id !== "string" || typeof p.symbol !== "string" || p.symbol.trim() === "") continue;
    if (p.side !== "long" && p.side !== "short") continue;
    if (p.status === undefined || !PLAN_STATUSES.has(p.status)) continue;
    if (typeof p.createdAt !== "number" || !Number.isFinite(p.createdAt)) continue;
    const plan: TradePlan = {
      id: p.id,
      symbol: p.symbol.trim(),
      side: p.side,
      createdAt: p.createdAt,
      status: p.status,
    };
    for (const field of ["entry", "stop", "target"] as const) {
      const level = p[field];
      if (typeof level === "number" && Number.isFinite(level)) plan[field] = level;
    }
    if (typeof p.setup === "string" && p.setup.trim() !== "") plan.setup = p.setup.trim();
    if (typeof p.thesis === "string" && p.thesis.trim() !== "") plan.thesis = p.thesis.trim();
    out.push(plan);
    if (out.length >= MAX_PLANS) break;
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

/**
 * Writes are debounced: the journal holds PNG screenshots as data URLs, so
 * serialising it on every checkbox tick meant copying megabytes of base64
 * on the main thread.
 */
let journalTimer: ReturnType<typeof setTimeout> | null = null;
let queuedState: Persisted | null = null;
/** Called when a save is refused by quota, so the UI can surface a warning. */
let onStorageIssue: (() => void) | null = null;

function writeState(state: Persisted): void {
  if (typeof localStorage === "undefined") return;
  queuedState = state;
  if (journalTimer) clearTimeout(journalTimer);
  journalTimer = setTimeout(() => {
    journalTimer = null;
    const next = queuedState;
    queuedState = null;
    if (!next) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Quota: the last screenshots stay for this session only — and the user
      // is told rather than finding data missing on next launch.
      onStorageIssue?.();
    }
  }, 400);
}

/** Write the pending journal out right now (used on quit and by the tests). */
export function flushJournal(): void {
  if (journalTimer) {
    clearTimeout(journalTimer);
    journalTimer = null;
  }
  const next = queuedState;
  queuedState = null;
  if (!next) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    onStorageIssue?.();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    if (!queuedState) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queuedState));
    } catch {
      onStorageIssue?.();
    }
  });
}

const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/**
 * The journal store, plus the session `storageIssue` flag the panel surfaces.
 */
export interface JournalState {
  entries: JournalEntry[];
  notes: JournalNote[];
  savedReviews: SavedReview[];
  propFirm: PropFirmLimits;
  plans: TradePlan[];
  /** Free-text filter over symbol, tags, setup and note text. */
  query: string;
  setQuery(query: string): void;
  /** Account-aware filter: only trades from this source ("any" = all). */
  sourceFilter: JournalEntry["source"] | "any";
  setSourceFilter(source: JournalEntry["source"] | "any"): void;
  /** Bulk edit: shallow-merges `patch` into every listed entry in one write. */
  updateEntries(ids: readonly string[], patch: Partial<JournalEntry>): void;
  /** Bulk delete in one write; returns how many rows went away. */
  removeEntries(ids: readonly string[]): number;
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
  addPlan(input: Omit<TradePlan, "id" | "createdAt" | "status"> & { createdAt?: number; status?: TradePlanStatus }): void;
  updatePlan(id: string, patch: Partial<Omit<TradePlan, "id" | "createdAt">>): void;
  removePlan(id: string): void;
  /** Pulls closed trades out of a deal history; returns how many were new. */
  importDeals(deals: readonly Deal[], source: JournalEntry["source"]): number;
  clear(): void;
  /** A save was refused by quota this session; the panel surfaces it. */
  storageIssue: boolean;
  dismissStorageIssue(): void;
}

const boot = readState();

export const useJournal = create<JournalState>((set, get) => {
  /** Persist the durable slice; the in-memory `query` never lands on disk. */
  onStorageIssue = () => set({ storageIssue: true });
  const persist = (): void => {
    const s = get();
    writeState({
      entries: s.entries,
      notes: s.notes,
      savedReviews: s.savedReviews,
      propFirm: s.propFirm,
      plans: s.plans,
    });
  };

  return {
    entries: boot.entries,
    notes: boot.notes,
    savedReviews: boot.savedReviews,
    propFirm: boot.propFirm,
    plans: boot.plans,
    query: "",
    sourceFilter: "any" as JournalEntry["source"] | "any",

    setQuery(query) {
      set({ query });
    },

    setSourceFilter(sourceFilter) {
      set({ sourceFilter });
    },

    updateEntries(ids, patch) {
      if (ids.length === 0) return;
      const wanted = new Set(ids);
      const next = get().entries.map((entry) => (wanted.has(entry.id) ? Object.assign({}, entry, patch) : entry));
      set({ entries: next });
      persist();
    },

    removeEntries(ids) {
      const wanted = new Set(ids);
      const before = get().entries.length;
      const next = get().entries.filter((entry) => !wanted.has(entry.id));
      if (next.length === before) return 0;
      set({ entries: next });
      persist();
      return before - next.length;
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

    addPlan(input) {
      const plan: TradePlan = {
        ...input,
        id: uid(),
        createdAt: input.createdAt ?? Math.floor(Date.now() / 1000),
        status: input.status ?? "planned",
      };
      set({ plans: [plan, ...get().plans].slice(0, MAX_PLANS) });
      persist();
    },

    updatePlan(id, patch) {
      const next = get().plans.map((plan) => (plan.id === id ? Object.assign({}, plan, patch) : plan));
      set({ plans: next });
      persist();
    },

    removePlan(id) {
      set({ plans: get().plans.filter((plan) => plan.id !== id) });
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
      set({ entries: [], notes: [], savedReviews: [], propFirm: {}, plans: [] });
      persist();
    },

    storageIssue: false,
    dismissStorageIssue() {
      set({ storageIssue: false });
    },
  };
});

/**
 * Chart snapshot for a note: find the live chart host and hand it to the
 * shared compositor (Phase 8 moved the pixel work to chartImage.ts so journal
 * capture and the export bridge share one implementation).
 */
export function captureChart(): string | null {
  if (typeof document === "undefined") return null;
  const host = document.querySelector('[data-testid="chart-host"]');
  if (!(host instanceof HTMLElement)) return null;
  return compositeCanvasesToPng(host);
}
