import { useEffect } from "react";
import { create } from "zustand";
import type { AccountInfo, Deal, OrderRequest } from "@ezyview/data-adapters";
import { PaperTradingEngine, PaperTradingError } from "@ezyview/paper-trading";
import type { PaperOrder, PaperPosition, PaperSnapshot } from "@ezyview/paper-trading";
import { market } from "./data";

const STORAGE_KEY = "ezyview.paper-account.v1";

/** Read a saved account, or null for anything unreadable or malformed. */
function readSnapshot(): PaperSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as Partial<PaperSnapshot>;
    return typeof candidate.balance === "number" && Array.isArray(candidate.positions)
      ? (candidate as PaperSnapshot)
      : null;
  } catch {
    // A corrupt file should cost the user nothing: start over.
    return null;
  }
}

/**
 * The terminal's one paper account.
 *
 * Held outside React so quotes from any panel can fold into it without first
 * making a round trip through a store action.
 */
export const paperEngine = (() => {
  const stored = readSnapshot();
  return stored ? PaperTradingEngine.restore(stored) : new PaperTradingEngine();
})();

function persist(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(paperEngine.snapshot()));
  } catch {
    // Quota or private mode: the account simply resets on the next reload.
  }
}

function message(err: unknown): string {
  if (err instanceof PaperTradingError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export interface TradingState {
  account: AccountInfo | null;
  positions: PaperPosition[];
  orders: PaperOrder[];
  deals: Deal[];
  /** Rejection from the last submit, cleared on the next successful one. */
  error: string | null;
}

export interface TradingActions {
  submit(request: OrderRequest): Promise<boolean>;
  cancel(id: string): Promise<boolean>;
  close(symbol: string, qty?: number): Promise<void>;
  closeAll(): Promise<void>;
  reset(): Promise<void>;
  clearError(): void;
}

export const useTrading = create<TradingState & TradingActions>((set) => ({
  account: null,
  positions: [],
  orders: [],
  deals: [],
  error: null,

  async submit(request) {
    try {
      await paperEngine.placeOrder(request);
      set({ error: null });
      await refreshInto(set);
      return true;
    } catch (err) {
      set({ error: message(err) });
      return false;
    }
  },

  async cancel(id) {
    const cancelled = await paperEngine.cancelOrder(id);
    await refreshInto(set);
    return cancelled;
  },

  async close(symbol, qty) {
    try {
      await paperEngine.closePosition(symbol, qty);
      set({ error: null });
    } catch (err) {
      set({ error: message(err) });
    }
    await refreshInto(set);
  },

  async closeAll() {
    await paperEngine.closeAll();
    await refreshInto(set);
  },

  async reset() {
    paperEngine.reset();
    set({ error: null });
    await refreshInto(set);
  },

  clearError() {
    set({ error: null });
  },
}));

type SetState = (patch: Partial<TradingState>) => void;

/** Pull everything the panels read in one pass, so no view sees half a fill. */
async function refreshInto(set: SetState): Promise<void> {
  const [account, positions, orders, deals] = await Promise.all([
    paperEngine.getAccount(),
    paperEngine.getPositions(),
    paperEngine.getOrders(),
    paperEngine.getHistory(),
  ]);
  set({ account, positions, orders, deals });
}

// One hook for every fill, exit and stop-out: the panels just re-read state.
paperEngine.onUpdate = () => {
  persist();
  void refreshInto(useTrading.setState as SetState);
};

// Boot from whatever the last session left behind.
void refreshInto(useTrading.setState as SetState);

/**
 * Feed ticks from the demo adapter into the engine.
 *
 * `symbolsKey` is the `|`-joined list rather than the array itself: the caller
 * rebuilds that array on every store refresh, and restarting the timer on each
 * one would turn a 1.5s poll into a self-sustaining loop.
 *
 * Polling rather than push keeps the paper account working against any feed
 * that answers `getQuote`, which is how every adapter here behaves.
 */
export function usePaperTicks(symbolsKey: string): void {
  useEffect(() => {
    if (!symbolsKey) return;
    const symbols = symbolsKey.split("|");
    let cancelled = false;

    const tick = () => {
      for (const symbol of symbols) {
        void market.getQuote(symbol).then((quote) => {
          if (!cancelled && quote) paperEngine.updateQuote(symbol, quote.last);
        });
      }
    };

    tick();
    const timer = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [symbolsKey]);
}
