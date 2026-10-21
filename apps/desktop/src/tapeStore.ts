import { create } from "zustand";

import { TapeBuffer, type TapeEntry } from "./tape";

/**
 * Live tape store, keyed by symbol.
 *
 * Deliberately separate from the workspace store: a tape is transient market
 * state, not something to persist — restoring yesterday's prints would be
 * misleading, and the buffer would bloat localStorage. One `TapeBuffer` per
 * symbol keeps memory bounded per instrument.
 */

const CAPACITY = 200;
export const MAX_TAPE_SYMBOLS = 50;

interface TapeStore {
  /** Symbol -> bounded print log. Replaced (not mutated) so React re-renders. */
  tapes: Record<string, TapeEntry[]>;
  /** Append one print. */
  push(symbol: string, price: number, size: number): void;
  /** Forget one symbol's tape. */
  clear(symbol: string): void;
}

export const EMPTY_TAPE: TapeEntry[] = [];

const buffers = new Map<string, TapeBuffer>();

export const useTape = create<TapeStore>((set, get) => ({
  tapes: {},
  push: (symbol, price, size) => {
    if (!Number.isFinite(price) || price <= 0) return;
    const safeSize = Number.isFinite(size) && size > 0 ? size : 1;
    let buffer = buffers.get(symbol);
    if (buffer) {
      // Refresh LRU position
      buffers.delete(symbol);
      buffers.set(symbol, buffer);
    } else {
      buffer = new TapeBuffer(CAPACITY);
      buffers.set(symbol, buffer);
    }
    buffer.push({ symbol, price, size: safeSize, ts: Date.now() });

    const nextTapes: Record<string, TapeEntry[]> = { ...get().tapes, [symbol]: buffer.recent() };
    while (buffers.size > MAX_TAPE_SYMBOLS) {
      const oldest = buffers.keys().next().value;
      if (oldest === undefined) break;
      buffers.get(oldest)?.clear();
      buffers.delete(oldest);
      delete nextTapes[oldest];
    }

    // A fresh array per push: the panel is a live feed, so it must re-render
    // even when the buffer only shifted one entry off the end.
    set({ tapes: nextTapes });
  },
  clear: (symbol) => {
    buffers.get(symbol)?.clear();
    buffers.delete(symbol);
    const { [symbol]: _dropped, ...rest } = get().tapes;
    set({ tapes: rest });
  },
}));

/** Reset all internal buffers and tape state (useful in tests). */
export function resetTapeStore(): void {
  for (const b of buffers.values()) b.clear();
  buffers.clear();
  useTape.setState({ tapes: {} });
}
