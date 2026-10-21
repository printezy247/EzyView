import { describe, expect, it } from "vitest";

import { convert, crossRate, formatAmount, normalizePair } from "./currency";

/**
 * The converter is arithmetic over a rate map, so it is unit-tested directly;
 * no network, no clock, no React. The map shape matches what a quote provider
 * returns: USD per one unit of the currency.
 */

const rates = { USD: 1, EUR: 0.92, GBP: 0.79, JPY: 152.5, CHF: 0.88 };

describe("crossRate", () => {
  it("is 1 for a currency against itself", () => {
    expect(crossRate(rates, "EUR", "EUR")).toBe(1);
  });

  it("divides the two USD rates", () => {
    // 1 EUR -> 0.92 USD; 1 GBP -> 0.79 USD; so 1 EUR -> 0.92/0.79 GBP.
    expect(crossRate(rates, "EUR", "GBP")).toBeCloseTo(0.92 / 0.79, 6);
  });

  it("inverts a rate when going the other way", () => {
    expect(crossRate(rates, "GBP", "EUR")).toBeCloseTo(0.79 / 0.92, 6);
  });

  it("returns null when a currency is unknown", () => {
    expect(crossRate(rates, "EUR", "XXX")).toBeNull();
    expect(crossRate(rates, "YYY", "EUR")).toBeNull();
  });

  it("returns null for a non-positive rate rather than dividing by zero", () => {
    expect(crossRate({ ...rates, ZZZ: 0 }, "EUR", "ZZZ")).toBeNull();
  });
});

describe("convert", () => {
  it("converts through the cross rate", () => {
    // A rate is USD per one unit, so USD -> EUR divides by the EUR rate.
    expect(convert(rates, 100, "USD", "EUR")).toBeCloseTo(100 / 0.92, 6);
    expect(convert(rates, 100, "EUR", "USD")).toBeCloseTo(92, 6);
  });

  it("is the identity for the same currency", () => {
    expect(convert(rates, 42.5, "JPY", "JPY")).toBe(42.5);
  });

  it("returns null when the pair is unknown, instead of a silently wrong number", () => {
    expect(convert(rates, 10, "USD", "XXX")).toBeNull();
  });
});

describe("normalizePair", () => {
  it("uppercases and splits on the usual separators", () => {
    expect(normalizePair("eur/usd")).toEqual(["EUR", "USD"]);
    expect(normalizePair("EUR-USD")).toEqual(["EUR", "USD"]);
    expect(normalizePair("eur usd")).toEqual(["EUR", "USD"]);
  });

  it("returns null when the input is not a pair", () => {
    expect(normalizePair("EUR")).toBeNull();
    expect(normalizePair("EURO")).toBeNull();
    expect(normalizePair("")).toBeNull();
  });
});

describe("formatAmount", () => {
  it("keeps two decimals for a normal amount", () => {
    expect(formatAmount(1234.567, 2)).toBe("1,234.57");
  });

  it("raises precision to at least four decimals for a sub-unit amount", () => {
    // 0.5 at 2 decimals would round to "0.50" and lose the value entirely.
    expect(formatAmount(0.0012, 2)).toBe("0.0012");
    expect(formatAmount(0.001234, 6)).toBe("0.001234");
  });

  it("uses the requested precision", () => {
    expect(formatAmount(1.5, 0)).toBe("2");
  });
});
