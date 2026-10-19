import { create } from "zustand";
import { entriesFromDeals, existingKeys } from "@ezyview/journal";
import type { JournalEntry, JournalNote } from "@ezyview/journal";
import type { Deal } from "@ezyview/data-adapters";

const STORAGE_KEY = "ezyview.journal.v1";

/** Screenshots are data URLs; a corrupted or hostile blob must not break boot. */
const MAX_ENTRIES = 500;
const MAX_NOTES = 500;

interface Persisted {
  entries: JournalEntry[];
  notes: JournalNote[];
}

function readState(): Persisted {
  if (typeof localStorage === "undefined") return { entries: [], notes: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { entries: [], notes: [] };
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries.slice(0, MAX_ENTRIES) : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes.slice(0, MAX_NOTES) : [],
    };
  } catch {
    // An unreadable journal costs the user nothing but its old contents.
    return { entries: [], notes: [] };
  }
}

function writeState(entries: JournalEntry[], notes: JournalNote[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries, notes }));
  } catch {
    // Quota: the last screenshots stay for this session only.
  }
}

const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export interface JournalState {
  entries: JournalEntry[];
  notes: JournalNote[];
  /** Free-text filter over symbol, tags, setup and note text. */
  query: string;
  setQuery(query: string): void;
  /** Adds a timestamped observation, optionally with the current chart image. */
  addNote(note: Omit<JournalNote, "id">): void;
  removeNote(id: string): void;
  removeEntry(id: string): void;
  updateEntry(id: string, patch: Partial<JournalEntry>): void;
  /** Pulls closed trades out of a deal history; returns how many were new. */
  importDeals(deals: readonly Deal[], source: JournalEntry["source"]): number;
  clear(): void;
}

const boot = readState();

export const useJournal = create<JournalState>((set, get) => ({
  entries: boot.entries,
  notes: boot.notes,
  query: "",

  setQuery(query) {
    set({ query });
  },

  addNote(note) {
    const next: JournalNote[] = [{ ...note, id: uid() }, ...get().notes].slice(0, MAX_NOTES);
    set({ notes: next });
    writeState(get().entries, next);
  },

  removeNote(id) {
    const next = get().notes.filter((note) => note.id !== id);
    set({ notes: next });
    writeState(get().entries, next);
  },

  removeEntry(id) {
    const next = get().entries.filter((entry) => entry.id !== id);
    set({ entries: next });
    writeState(next, get().notes);
  },

  updateEntry(id, patch) {
    const next = get().entries.map((entry) => (entry.id === id ? Object.assign({}, entry, patch) : entry));
    set({ entries: next });
    writeState(next, get().notes);
  },

  importDeals(deals, source) {
    const known = existingKeys(get().entries);
    const imported = entriesFromDeals(deals, source).filter((entry) => !known.has(entry.id));
    if (imported.length === 0) return 0;
    const next = [...imported, ...get().entries].slice(0, MAX_ENTRIES);
    set({ entries: next });
    writeState(next, get().notes);
    return imported.length;
  },

  clear() {
    set({ entries: [], notes: [] });
    writeState([], []);
  },
}));

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
