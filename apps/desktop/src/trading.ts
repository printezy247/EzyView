import { useEffect } from "react";
import { create } from "zustand";
import type { AccountInfo, Deal, Order, OrderRequest, Position } from "@ezyview/data-adapters";
import { PaperTradingEngine, PaperTradingError } from "@ezyview/paper-trading";
import type { PaperSnapshot } from "@ezyview/paper-trading";
import { market } from "./data";
import { accountKindOf, useMt5Accounts } from "./mt5Accounts";
import { getMt5, useMt5 } from "./mt5";
import { approvalTokens, gateAction } from "./tradingSafety";
import type { GateInput, GateResult } from "./tradingSafety";

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

/**
 * An MT5 action parked by the safety gate, waiting on the confirm dialog.
 * The token is consumed exactly once by `approve`.
 */
export type PendingAction =
  | { kind: "place"; request: OrderRequest; gate: GateResult; token: string }
  | { kind: "close"; symbol: string; qty?: number; gate: GateResult; token: string }
  | { kind: "cancel"; id: string; gate: GateResult; token: string }
  | { kind: "amend"; symbol: string; stopLoss?: number | null; takeProfit?: number | null; gate: GateResult; token: string }
  | { kind: "close-all"; rows: { symbol: string; qty: number }[]; gate: GateResult; token: string };

export interface TradingState {
  account: AccountInfo | null;
  positions: PanelPosition[];
  orders: Order[];
  deals: Deal[];
  /** Rejection from the last submit, cleared on the next successful one. */
  error: string | null;
  /** MT5 action awaiting the confirm dialog; null on paper and when idle. */
  pending: PendingAction | null;
  /** Informational result line, e.g. a dry-run validation. */
  note: string | null;
}

export interface TradingActions {
  /** Paper sends straight away; MT5 parks at the gate and returns false. */
  submit(request: OrderRequest): Promise<boolean>;
  cancel(id: string): Promise<boolean>;
  close(symbol: string, qty?: number): Promise<void>;
  /**
   * Move or clear an open position's stop and/or target. `null` clears a level,
   * `undefined` leaves it as it is — so dragging the stop on the chart does not
   * disturb the target.
   */
  amend(symbol: string, levels: { stopLoss?: number | null; takeProfit?: number | null }): Promise<boolean>;
  closeAll(): Promise<void>;
  /** Send the parked action once, after the user confirms. */
  approve(): Promise<boolean>;
  /** Drop the parked action and its token. */
  decline(): void;
  reset(): Promise<void>;
  clearError(): void;
}

function mt5Gate(action: Omit<GateInput, "accountKind">): GateResult {
  return gateAction(
    { ...action, accountKind: accountKindOf(useMt5Accounts.getState().session) },
    useMt5Accounts.getState().safety,
  );
}

function park(set: (patch: Partial<TradingState>) => void, gate: GateResult, pending: PendingAction): boolean {
  if (gate.decision === "block") {
    approvalTokens.consume(pending.token);
    set({ error: gate.reasons.join("; ") || "blocked by the safety rails", pending: null, note: null });
    return false;
  }
  set({ pending, error: null, note: null });
  return false;
}

/** The write path: raw transport so session + dry-run ride the body. */
async function sendMt5(action: PendingAction): Promise<string | null> {
  const transport = getMt5().transport;
  const options = { dryRun: useMt5Accounts.getState().safety.dryRun };
  switch (action.kind) {
    case "place":
      await transport.placeOrder(action.request, options);
      break;
    case "close":
      await transport.close(action.symbol, action.qty, options);
      break;
    case "cancel":
      await transport.cancel(action.id, options);
      break;
    case "amend":
      await transport.modify(action.symbol, action.stopLoss ?? undefined, action.takeProfit ?? undefined, options);
      break;
    case "close-all":
      // Serial on purpose: the bridge holds one MT5 lock, and two closes of
      // the same symbol racing would double-send.
      for (const row of action.rows) {
        // eslint-disable-next-line no-await-in-loop -- serial: one bridge lock, no same-symbol races
        await transport.close(row.symbol, row.qty, options);
      }
      break;
  }
  return options.dryRun ? "Validated at the bridge — dry-run, nothing was sent." : null;
}

export const useTrading = create<TradingState & TradingActions>((set, get) => ({
  account: null,
  positions: [],
  orders: [],
  deals: [],
  error: null,
  pending: null,
  note: null,

  async submit(request) {
    // Same ticket, two venues: paper keeps its engine, MT5 passes the gate.
    if (useMt5.getState().source !== "mt5") {
      try {
        await paperEngine.placeOrder(request);
        set({ error: null, note: null });
        await refreshInto(set);
        return true;
      } catch (err) {
        set({ error: message(err) });
        return false;
      }
    }
    const gate = mt5Gate({ action: "place", symbol: request.symbol, volume: request.qty });
    return park(set, gate, { kind: "place", request, gate, token: approvalTokens.mint() });
  },

  async cancel(id) {
    if (useMt5.getState().source !== "mt5") {
      try {
        const cancelled = await paperEngine.cancelOrder(id);
        await refreshInto(set);
        return cancelled;
      } catch (err) {
        set({ error: message(err) });
        return false;
      }
    }
    const gate = mt5Gate({ action: "cancel" });
    return park(set, gate, { kind: "cancel", id, gate, token: approvalTokens.mint() });
  },

  async close(symbol, qty) {
    if (useMt5.getState().source !== "mt5") {
      try {
        await paperEngine.closePosition(symbol, qty);
        set({ error: null });
      } catch (err) {
        set({ error: message(err) });
      }
      await refreshInto(set);
      return;
    }
    const gate = mt5Gate({ action: "close", symbol, volume: qty });
    park(set, gate, { kind: "close", symbol, qty, gate, token: approvalTokens.mint() });
  },

  async amend(symbol, levels) {
    if (useMt5.getState().source !== "mt5") {
      try {
        await paperEngine.setLevels(symbol, levels);
        set({ error: null, note: null });
        await refreshInto(set);
        return true;
      } catch (err) {
        set({ error: message(err) });
        return false;
      }
    }
    // Amending an open position is a write like any other, so it parks at the
    // gate rather than going straight to the bridge.
    const gate = mt5Gate({ action: "modify", symbol });
    return park(set, gate, { kind: "amend", symbol, ...levels, gate, token: approvalTokens.mint() });
  },

  async closeAll() {
    if (useMt5.getState().source !== "mt5") {
      try {
        await paperEngine.closeAll();
        set({ error: null });
      } catch (err) {
        set({ error: message(err) });
      }
      await refreshInto(set);
      return;
    }
    let rows: { symbol: string; qty: number }[] = [];
    try {
      const open = await getMt5().trading.getPositions();
      rows = open.map((position) => ({ symbol: position.symbol, qty: position.qty }));
    } catch (err) {
      set({ error: message(err) });
      return;
    }
    if (rows.length === 0) {
      set({ note: "Nothing to close.", error: null });
      return;
    }
    const maxRowVol = Math.max(...rows.map((r) => r.qty));
    const gate = mt5Gate({ action: "close", symbol: rows[0]?.symbol, volume: maxRowVol });
    park(set, gate, { kind: "close-all", rows, gate, token: approvalTokens.mint() });
  },

  async approve() {
    const pending = get().pending;
    if (!pending) return false;
    if (!approvalTokens.consume(pending.token)) {
      set({ pending: null, error: "This confirmation has expired." });
      return false;
    }
    set({ pending: null });
    try {
      const note = await sendMt5(pending);
      set({ error: null, note });
      await refreshInto(set);
      return true;
    } catch (err) {
      set({ error: message(err) });
      return false;
    }
  },

  decline() {
    const pending = get().pending;
    if (pending) approvalTokens.consume(pending.token);
    set({ pending: null });
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
  const current = useTrading.getState();
  if (
    current.account?.equity === account?.equity &&
    current.account?.balance === account?.balance &&
    current.positions.length === positions.length &&
    current.orders.length === orders.length &&
    current.deals.length === deals.length &&
    current.positions.every((p, i) => p.symbol === positions[i]?.symbol && p.unrealizedPnl === positions[i]?.unrealizedPnl)
  ) {
    return;
  }
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
