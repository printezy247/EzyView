import { useEffect } from "react";
import { create } from "zustand";
import type { AccountInfo, Deal, Order, OrderRequest, Position } from "@ezyview/data-adapters";
import { PaperTradingEngine, PaperTradingError } from "@ezyview/paper-trading";
import type { PaperSnapshot } from "@ezyview/paper-trading";
import { market } from "./data";
import { getMt5, useMt5 } from "./mt5";

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

/**
 * Rows both feeds can render.
 *
 * The paper engine posts a margin figure per position; MT5 does not, so the
 * panel reads it as optional.
 */
export type PanelPosition = Position & { margin?: number };

export interface TradingState {
  account: AccountInfo | null;
  positions: PanelPosition[];
  orders: Order[];
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
      // Same ticket, two venues: paper keeps its engine, MT5 hits the bridge.
      if (useMt5.getState().source === "mt5") await getMt5().trading.placeOrder(request);
      else await paperEngine.placeOrder(request);
      set({ error: null });
      await refreshInto(set);
      return true;
    } catch (err) {
      set({ error: message(err) });
      return false;
    }
  },

  async cancel(id) {
    try {
      if (useMt5.getState().source === "mt5") {
        await getMt5().trading.cancelOrder(id);
        await refreshInto(set);
        return true;
      }
      const cancelled = await paperEngine.cancelOrder(id);
      await refreshInto(set);
      return cancelled;
    } catch (err) {
      set({ error: message(err) });
      return false;
    }
  },

  async close(symbol, qty) {
    try {
      if (useMt5.getState().source === "mt5") await getMt5().trading.closePosition(symbol, qty);
      else await paperEngine.closePosition(symbol, qty);
      set({ error: null });
    } catch (err) {
      set({ error: message(err) });
    }
    await refreshInto(set);
  },

  async closeAll() {
    try {
      if (useMt5.getState().source === "mt5") {
        const broker = getMt5().trading;
        const open = await broker.getPositions();
        await Promise.all(open.map((position) => broker.closePosition(position.symbol, position.qty)));
      } else {
        await paperEngine.closeAll();
      }
      set({ error: null });
    } catch (err) {
      set({ error: message(err) });
    }
    await refreshInto(set);
  },

  async reset() {
    // The broker's balance is the broker's; a reset there only re-reads state.
    if (useMt5.getState().source === "mt5") {
      await refreshInto(set);
      return;
    }
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
  if (useMt5.getState().source === "mt5") {
    const broker = getMt5().trading;
    try {
      const [account, positions, orders, deals] = await Promise.all([
        broker.getAccount(),
        broker.getPositions(),
        broker.getOrders(),
        broker.getHistory(),
      ]);
      set({ account, positions, orders, deals });
      if (useMt5.getState().status !== "online") useMt5.setState({ status: "online", error: null });
    } catch (err) {
      // Keep the last good rows on screen and say why they stopped moving.
      set({ error: message(err) });
      useMt5.setState({ status: "error", error: message(err) });
    }
    return;
  }

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
 * Keep both accounts honest while the terminal is open.
 *
 * `symbolsKey` is the `|`-joined list rather than the array itself: the caller
 * rebuilds that array on every store refresh, and restarting the timer on each
 * one would turn a 1.5s poll into a self-sustaining loop.
 *
 * Demo quotes always feed the paper engine (so it stays current even while the
 * broker feed is on). On the broker feed, a second timer re-reads account,
 * positions, orders and deals from the bridge.
 */
export function useTradingTicks(symbolsKey: string): void {
  const source = useMt5((s) => s.source);

  useEffect(() => {
    const symbols = symbolsKey ? symbolsKey.split("|") : [];
    let cancelled = false;

    const tick = () => {
      for (const symbol of symbols) {
        void market.getQuote(symbol).then((quote) => {
          if (!cancelled && quote) paperEngine.updateQuote(symbol, quote.last);
        });
      }
    };

    const pollBroker = () => {
      if (source === "mt5" && !cancelled) void refreshInto(useTrading.setState as SetState);
    };

    tick();
    pollBroker();
    const paperTimer = setInterval(tick, 1500);
    const brokerTimer = source === "mt5" ? setInterval(pollBroker, 2000) : null;

    return () => {
      cancelled = true;
      clearInterval(paperTimer);
      if (brokerTimer) clearInterval(brokerTimer);
    };
  }, [symbolsKey, source]);
}
