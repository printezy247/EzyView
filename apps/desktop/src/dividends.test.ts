import { describe, expect, it } from "vitest";

import { annualisedDividend, nextExDate, totalForYear } from "./dividends";

/**
 * The dividends calendar is arithmetic over a list of corporate actions, so
 * the interesting parts — the annualised run rate, the next ex-date, the year's
 * total — are pure functions with their own tests.
 */

const on = (iso: string): number => Math.floor(Date.parse(iso) / 1000);

const events = [
  { symbol: "AAPL", exDate: on("2026-02-13"), amount: 0.26, currency: "USD", source: "demo" },
  { symbol: "AAPL", exDate: on("2026-05-14"), amount: 0.26, currency: "USD", source: "demo" },
  { symbol: "AAPL", exDate: on("2026-08-13"), amount: 0.26, currency: "USD", source: "demo" },
  { symbol: "AAPL", exDate: on("2026-11-12"), amount: 0.26, currency: "USD", source: "demo" },
  { symbol: "AAPL", exDate: on("2025-11-13"), amount: 0.25, currency: "USD", source: "demo" },
];

describe("annualisedDividend", () => {
  it("is the paid total over a full-year window", () => {
    const window = events.filter((e) => e.exDate >= on("2026-01-01") && e.exDate < on("2027-01-01"));
    expect(annualisedDividend(window, on("2026-01-01"), on("2027-01-01"))).toBeCloseTo(1.04, 6);
  });

  it("scales a part-year window up to a year", () => {
    // Two payments of 0.26 in a 181-day window -> 0.52 * 365/181.
    const window = events.filter((e) => e.exDate >= on("2026-01-01") && e.exDate < on("2026-07-01"));
    const expected = 0.52 * (365 / 181);
    expect(annualisedDividend(window, on("2026-01-01"), on("2026-07-01"))).toBeCloseTo(expected, 6);
  });

  it("returns null when the window is empty, rather than claiming a zero yield", () => {
    expect(annualisedDividend([], on("2026-01-01"), on("2026-07-01"))).toBeNull();
  });

  it("returns null for a zero-length window", () => {
    expect(annualisedDividend(events, on("2026-01-01"), on("2026-01-01"))).toBeNull();
  });
});

describe("nextExDate", () => {
  it("finds the next ex-date on or after the cursor", () => {
    expect(nextExDate(events, on("2026-03-01"))).toBe(on("2026-05-14"));
  });

  it("returns a date exactly on the cursor", () => {
    expect(nextExDate(events, on("2026-05-14"))).toBe(on("2026-05-14"));
  });

  it("returns null when every ex-date has passed", () => {
    expect(nextExDate(events, on("2027-01-01"))).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(nextExDate([], on("2026-01-01"))).toBeNull();
  });
});

describe("totalForYear", () => {
  it("sums only the payments in that year", () => {
    expect(totalForYear(events, 2026)).toBeCloseTo(1.04, 6);
    expect(totalForYear(events, 2025)).toBeCloseTo(0.25, 6);
  });

  it("is zero for a year with no payments", () => {
    expect(totalForYear(events, 2024)).toBe(0);
  });
});
