/**
 * Time & Sales: a bounded log of prints, one per quote tick.
 *
 * The feed the app has is quotes, not a trade tape, so each quote becomes one
 * print whose side is inferred from the previous price. That is honest about
 * what the data supports and still gives a trader the thing a tape is for —
 * direction and pace at the current level. The buffer keeps memory flat no
 * matter how long a session runs.
 */

export type TapeSide = "buy" | "sell";

export interface TapeEntry {
  /** Monotonic id, unique across every tape in a session. */
  id: number;
  symbol: string;
  price: number;
  size: number;
  ts: number;
  side: TapeSide;
}

/** The fields a raw print carries before the tape assigns an id and a side. */
export interface RawPrint {
  symbol: string;
  price: number;
  size: number;
  ts: number;
}

let nextId = 1;

/**
 * Turn a raw print into a tape entry. An uptick is a buy, a downtick a sell,
 * and an unchanged price carries the previous direction forward (a flat print
 * is not a trade direction).
 */
export function tapeEntry(print: RawPrint, prevPrice: number | null, prevSide: TapeSide, id = nextId++): TapeEntry {
  const side: TapeSide = prevPrice === null ? prevSide : print.price > prevPrice ? "buy" : print.price < prevPrice ? "sell" : prevSide;
  return { ...print, id, side };
}

/** Fixed-capacity ring of prints, newest first on read. */
export class TapeBuffer {
  private entries: TapeEntry[] = [];
  private lastPrice: number | null = null;
  private lastSide: TapeSide = "buy";

  constructor(private readonly capacity: number) {
    if (capacity < 1) throw new Error("TapeBuffer capacity must be at least 1");
  }

  get size(): number {
    return this.entries.length;
  }

  push(print: RawPrint): void {
    const entry = tapeEntry(print, this.lastPrice, this.lastSide);
    this.lastPrice = print.price;
    this.lastSide = entry.side;
    this.entries.push(entry);
    if (this.entries.length > this.capacity) this.entries.splice(0, this.entries.length - this.capacity);
  }

  /** Newest first, as a fresh array the caller cannot use to mutate the tape. */
  recent(): TapeEntry[] {
    return [...this.entries].reverse();
  }

  clear(): void {
    this.entries = [];
    this.lastPrice = null;
    this.lastSide = "buy";
  }
}
