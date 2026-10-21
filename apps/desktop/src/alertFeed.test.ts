import { describe, expect, it } from "vitest";
import type { PriceAlert } from "@ezyview/data-adapters";
import { alertSymbols, candleFromQuote } from "./alertFeed";

const alert = (id: string, symbol: string, state: PriceAlert["state"], frequency: PriceAlert["frequency"]): PriceAlert => ({
  id,
  symbol,
  message: "",
  condition: { kind: "greater", value: 1 },
  frequency,
  state,
  createdAt: 0,
});

describe("alert feed", () => {
  it("polls only symbols with an alert that can still fire, once each", () => {
    const alerts = [
      alert("1", "A", "armed", "once"),
      alert("2", "A", "armed", "once_per_bar"),
      alert("3", "B", "triggered", "once"),
      alert("4", "C", "triggered", "once_per_bar"),
    ];
    expect(alertSymbols(alerts)).toEqual(["A", "C"]);
  });

  it("turns a quote into a flat bar", () => {
    expect(candleFromQuote({ symbol: "A", last: 5, time: 100 })).toEqual({
      time: 100,
      open: 5,
      high: 5,
      low: 5,
      close: 5,
      volume: 0,
    });
  });
});
