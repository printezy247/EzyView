import { describe, expect, it } from "vitest";
import { draftSideForPrice, useOrderDraft } from "./orderDraft";

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
});
