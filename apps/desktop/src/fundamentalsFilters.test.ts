import { describe, expect, it } from "vitest";
import type { EconomicEvent } from "@ezyview/data-adapters";
import { currencyOptions, dateInputToEpoch, defaultDateRange } from "./FundamentalsTabs";

const event = (id: string, currency: string): EconomicEvent =>
  ({ id, currency, title: id, time: 0, impact: "low" }) as EconomicEvent;

describe("dateInputToEpoch", () => {
  it("maps a date input to local midnight", () => {
    const epoch = dateInputToEpoch("2026-10-21", "start");
    expect(epoch).toBe(Math.floor(new Date(2026, 9, 21).getTime() / 1000));
  });

  it("advances the end bound a day so the chosen day is fully included", () => {
    // filterEvents treats `to` as exclusive; the end of the chosen day is next local midnight.
    const epoch = dateInputToEpoch("2026-10-28", "end");
    expect(epoch).toBe(Math.floor(new Date(2026, 9, 29).getTime() / 1000));
  });

  it("treats empty or non-date input as unbounded", () => {
    expect(dateInputToEpoch("", "start")).toBeUndefined();
    expect(dateInputToEpoch("   ", "end")).toBeUndefined();
    expect(dateInputToEpoch("not-a-date", "start")).toBeUndefined();
    expect(dateInputToEpoch("2026-10", "start")).toBeUndefined();
  });

  it("rejects calendar-impossible dates instead of rolling them over", () => {
    expect(dateInputToEpoch("2026-02-31", "start")).toBeUndefined();
    expect(dateInputToEpoch("2026-13-01", "start")).toBeUndefined();
    expect(dateInputToEpoch("2026-00-10", "start")).toBeUndefined();
    expect(dateInputToEpoch("2026-04-31", "end")).toBeUndefined();
  });
});

describe("defaultDateRange", () => {
  it("spans today through today + 7 days in local YYYY-MM-DD", () => {
    const now = new Date(2026, 9, 21, 15, 30);
    expect(defaultDateRange(now)).toEqual({ from: "2026-10-21", to: "2026-10-28" });
  });

  it("rolls the pair across a month boundary", () => {
    expect(defaultDateRange(new Date(2026, 11, 28))).toEqual({ from: "2026-12-28", to: "2027-01-04" });
  });
});

describe("currencyOptions", () => {
  it("lists distinct currencies sorted, keeping the first-seen casing", () => {
    const out = currencyOptions([event("a", "USD"), event("b", "eur"), event("c", "usd"), event("d", "JPY")]);
    expect(out).toEqual(["eur", "JPY", "USD"]);
  });

  it("returns an empty list when there are no events", () => {
    expect(currencyOptions([])).toEqual([]);
  });
});
