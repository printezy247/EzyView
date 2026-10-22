import { describe, expect, it } from "vitest";
import { draftSideForPrice, syncPositionDrawingToOrderTicket, useOrderDraft } from "./orderDraft";

describe("order draft", () => {
  it("publishes a draft with a new sequence number each time", () => {
    useOrderDraft.getState().setDraft({ symbol: "OANDA:XAUUSD", side: "sell", type: "limit", price: "4165.89" });
    const first = useOrderDraft.getState().draft!;
    expect(first).toMatchObject({ symbol: "OANDA:XAUUSD", side: "sell", type: "limit", price: "4165.89" });
    useOrderDraft.getState().setDraft({ symbol: "OANDA:XAUUSD", side: "sell", type: "limit", price: "4165.89" });
    expect(useOrderDraft.getState().draft!.seq).toBeGreaterThan(first.seq);
  });

  it("picks the side that rests on the right side of the market", () => {
    expect(draftSideForPrice(4100, 4126)).toBe("buy"); // below market: buy limit
    expect(draftSideForPrice(4150, 4126)).toBe("sell"); // above market: sell limit
    expect(draftSideForPrice(4126, null)).toBe("buy"); // no reference price
  });

  it("syncs long position drawing directly to order draft", () => {
    const drawing = {
      tool: "long_position",
      points: [{ price: 2700 }, { price: 2690 }, { price: 2730 }],
    };
    const synced = syncPositionDrawingToOrderTicket(drawing, "XAUUSD", 2);
    expect(synced).toBe(true);
    const draft = useOrderDraft.getState().draft;
    expect(draft).toMatchObject({
      symbol: "XAUUSD",
      side: "buy",
      type: "limit",
      price: "2700.00",
      stopLoss: "2690.00",
      takeProfit: "2730.00",
    });
  });

  it("syncs short position drawing directly to order draft", () => {
    const drawing = {
      tool: "short_position",
      points: [{ price: 1.085 }, { price: 1.09 }, { price: 1.075 }],
    };
    const synced = syncPositionDrawingToOrderTicket(drawing, "EURUSD", 4);
    expect(synced).toBe(true);
    const draft = useOrderDraft.getState().draft;
    expect(draft).toMatchObject({
      symbol: "EURUSD",
      side: "sell",
      type: "limit",
      price: "1.0850",
      stopLoss: "1.0900",
      takeProfit: "1.0750",
    });
  });
});
