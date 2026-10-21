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

interface TapeStore {
  /** Symbol -> bounded print log. Replaced (not mutated) so React re-renders. */
  tapes: Record<string, TapeEntry[]>;
  /** Append one print. */
  push(symbol: string, price: number, size: number): void;
  /** Forget one symbol's tape. */
  clear(symbol: string): void;
}

const buffers = new Map<string, TapeBuffer>();

export const useTape = create<TapeStore>((set, get) => ({
  tapes: {},
  push: (symbol, price, size) => {
    let buffer = buffers.get(symbol);
    if (!buffer) {
      buffer = new TapeBuffer(CAPACITY);
      buffers.set(symbol, buffer);
    }
    buffer.push({ symbol, price, size, ts: Date.now() });
    // A fresh array per push: the panel is a live feed, so it must re-render
    // even when the buffer only shifted one entry off the end.
    set({ tapes: { ...get().tapes, [symbol]: buffer.recent() } });
  },
  clear: (symbol) => {
    buffers.get(symbol)?.clear();
    buffers.delete(symbol);
    const { [symbol]: _dropped, ...rest } = get().tapes;
    set({ tapes: rest });
  },
}));
