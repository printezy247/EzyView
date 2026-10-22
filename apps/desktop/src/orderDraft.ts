import { create } from "zustand";
import type { OrderSide, OrderType } from "@ezyview/data-adapters";

/**
 * A prefilled order the order ticket should show (set by the chart's
 * right-click menu). The ticket keeps its own form state, so it watches `seq`
 * and loads the draft when it changes. Nothing here places an order.
 */
export interface OrderDraft {
  seq: number;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  price: string;
  stopLoss?: string;
  takeProfit?: string;
}

interface OrderDraftState {
  draft: OrderDraft | null;
  setDraft(draft: Omit<OrderDraft, "seq">): void;
}

export const useOrderDraft = create<OrderDraftState>((set, get) => ({
  draft: null,
  setDraft: (draft) => set({ draft: { ...draft, seq: (get().draft?.seq ?? 0) + 1 } }),
}));

/** A limit order below the market is a buy, above it a sell; with no market price, buy. */
export function draftSideForPrice(price: number, last: number | null): OrderSide {
  return last !== null && price > last ? "sell" : "buy";
}

/** Sync a completed Long or Short Position drawing directly to the Order Ticket draft. */
export function syncPositionDrawingToOrderTicket(
  drawing: { tool: string; points: { price: number }[] },
  symbol: string,
  precision: number = 2,
): boolean {
  if (drawing.points.length < 3) return false;
  const entry = drawing.points[0]?.price;
  const stop = drawing.points[1]?.price;
  const target = drawing.points[2]?.price;
  if (
    entry === undefined ||
    stop === undefined ||
    target === undefined ||
    !Number.isFinite(entry) ||
    !Number.isFinite(stop) ||
    !Number.isFinite(target) ||
    entry <= 0 ||
    stop <= 0 ||
    target <= 0
  ) {
    return false;
  }

  const side: OrderSide = drawing.tool === "long_position" ? "buy" : "sell";
  useOrderDraft.getState().setDraft({
    symbol,
    side,
    type: "limit",
    price: entry.toFixed(precision),
    stopLoss: stop.toFixed(precision),
    takeProfit: target.toFixed(precision),
  });
  return true;
}
