import { describe, expect, it } from "vitest";
import { buildChain, strikeStep } from "./chain.js";
import { breakevens, expiryPnl } from "./payoff.js";
import type { Leg } from "./payoff.js";
import { greeks, impliedVol, normCdf, price } from "./pricing.js";

const base = { spot: 100, strike: 100, years: 1, vol: 0.2, rate: 0.05 } as const;

describe("pricing", () => {
  it("matches the textbook value (S=K=100, T=1, r=5%, σ=20%)", () => {
    expect(price({ ...base, right: "call" })).toBeCloseTo(10.4506, 3);
    expect(price({ ...base, right: "put" })).toBeCloseTo(5.5735, 3);
  });

  it("satisfies put-call parity", () => {
    const c = price({ ...base, strike: 95, right: "call", div: 0.01 });
    const p = price({ ...base, strike: 95, right: "put", div: 0.01 });
    const parity = 100 * Math.exp(-0.01) - 95 * Math.exp(-0.05);
    expect(c - p).toBeCloseTo(parity, 6);
  });

  it("returns intrinsic value at expiry or zero vol", () => {
    expect(price({ ...base, years: 0, strike: 90, right: "call" })).toBe(10);
    expect(price({ ...base, vol: 0, strike: 110, right: "put" })).toBe(10);
  });

  it("has sane greeks that agree with finite differences", () => {
    const g = greeks({ ...base, right: "call" });
    const h = 0.01;
    const up = price({ ...base, spot: 100 + h, right: "call" });
    const dn = price({ ...base, spot: 100 - h, right: "call" });
    expect(g.delta).toBeCloseTo((up - dn) / (2 * h), 4);
    expect(g.gamma).toBeCloseTo((up + dn - 2 * price({ ...base, right: "call" })) / (h * h), 3);
    expect(g.delta).toBeGreaterThan(0.5);
    expect(g.theta).toBeLessThan(0);
    expect(greeks({ ...base, right: "put" }).delta).toBeLessThan(0);
  });

  it("round-trips implied vol and rejects impossible prices", () => {
    const { vol: _vol, ...rest } = { ...base, right: "call" as const };
    const mkt = price({ ...rest, vol: 0.37 });
    expect(impliedVol(rest, mkt)).toBeCloseTo(0.37, 5);
    expect(impliedVol(rest, 0)).toBeNull();
    expect(impliedVol(rest, 1000)).toBeNull();
  });

  it("normCdf is symmetric", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 7);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normCdf(-1.3) + normCdf(1.3)).toBeCloseTo(1, 7);
  });
});

describe("chain", () => {
  it("builds ordered rows centred on spot with a smile", () => {
    const chain = buildChain({ spot: 200, expiries: [30] });
    const rows = chain[0]!.rows;
    expect(rows).toHaveLength(17);
    const strikes = rows.map((r) => r.strike);
    expect(strikes).toEqual([...strikes].sort((a, b) => a - b));
    const mid = rows[8]!;
    expect(Math.abs(mid.strike - 200)).toBeLessThanOrEqual(strikeStep(200));
    expect(rows[0]!.call.iv).toBeGreaterThan(mid.call.iv);
    expect(rows[0]!.call.mid).toBeGreaterThan(rows[16]!.call.mid);
    expect(mid.call.bid).toBeLessThan(mid.call.ask);
  });

  it("picks a grid that scales with price", () => {
    expect(strikeStep(65000)).toBe(500);
    expect(strikeStep(1.1)).toBeCloseTo(0.05, 10);
  });
});

describe("payoff", () => {
  const straddle: Leg[] = [
    { right: "call", strike: 100, qty: 1, premium: 5 },
    { right: "put", strike: 100, qty: 1, premium: 4 },
  ];

  it("computes expiry P&L and break-evens", () => {
    expect(expiryPnl(straddle, 100)).toBe(-9);
    expect(expiryPnl(straddle, 120)).toBe(11);
    const be = breakevens(straddle, 50, 150);
    expect(be).toHaveLength(2);
    expect(be[0]).toBeCloseTo(91, 1);
    expect(be[1]).toBeCloseTo(109, 1);
  });
});
