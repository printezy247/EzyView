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
