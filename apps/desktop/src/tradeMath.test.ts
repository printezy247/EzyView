import { describe, expect, it } from "vitest";
import {
  calculateRiskReward,
  canBreakEven,
  createLockout,
  getContractMultiplier,
  riskQty,
  roundPrice,
} from "./tradeMath";

describe("getContractMultiplier", () => {
  it("resolves gold and metals multipliers", () => {
    expect(getContractMultiplier("XAUUSD")).toBe(100);
    expect(getContractMultiplier("GOLD")).toBe(100);
    expect(getContractMultiplier("XAGUSD")).toBe(5000);
    expect(getContractMultiplier("SILVER")).toBe(5000);
  });

  it("resolves standard forex pairs to 100,000", () => {
    expect(getContractMultiplier("EURUSD")).toBe(100_000);
    expect(getContractMultiplier("GBPUSD")).toBe(100_000);
    expect(getContractMultiplier("USDJPY")).toBe(100_000);
  });

  it("defaults crypto and stocks to 1", () => {
    expect(getContractMultiplier("BTCUSDT")).toBe(1);
    expect(getContractMultiplier("AAPL")).toBe(1);
    expect(getContractMultiplier("SPY")).toBe(1);
    expect(getContractMultiplier("")).toBe(1);
  });
});

describe("roundPrice", () => {
  it("removes float noise at the symbol precision", () => {
    expect(roundPrice(1.1 + 0.0001 * 3, 4)).toBe(1.1003);
    expect(roundPrice(2000.123456, 2)).toBe(2000.12);
  });
});

describe("canBreakEven", () => {
  it("long: needs mark above entry and a stop below entry", () => {
    expect(canBreakEven({ side: "long", entry: 100, mark: 101 })).toBe(true);
    expect(canBreakEven({ side: "long", entry: 100, mark: 99 })).toBe(false);
    expect(canBreakEven({ side: "long", entry: 100, mark: 101, stopLoss: 99 })).toBe(true);
    expect(canBreakEven({ side: "long", entry: 100, mark: 101, stopLoss: 100 })).toBe(false);
    expect(canBreakEven({ side: "long", entry: 100, mark: 105, stopLoss: 102 })).toBe(false);
  });
  it("short: mirrored", () => {
    expect(canBreakEven({ side: "short", entry: 100, mark: 99 })).toBe(true);
    expect(canBreakEven({ side: "short", entry: 100, mark: 101 })).toBe(false);
    expect(canBreakEven({ side: "short", entry: 100, mark: 99, stopLoss: 101 })).toBe(true);
    expect(canBreakEven({ side: "short", entry: 100, mark: 95, stopLoss: 98 })).toBe(false);
  });
});

describe("riskQty", () => {
  const base = { equity: 10_000, entry: 100, riskPct: 1, side: "buy" as const, maxQty: 1_000 };
  it("sizes risk / distance", () => {
    expect(riskQty({ ...base, stop: 99 })).toBe(100);
  });
  it("scales with contract multiplier for gold and forex", () => {
    // 1% risk on $10,000 = $100 risk.
    // Gold: entry 2700, stop 2690 ($10 distance). Multiplier = 100.
    // Risk per 1 lot = $10 * 100 = $1,000.
    // Intended lot size = $100 / $1,000 = 0.10 lots.
    const goldQty = riskQty({
      equity: 10_000,
      entry: 2700,
      stop: 2690,
      side: "buy",
      riskPct: 1,
      maxQty: 100,
      contractMultiplier: 100,
    });
    expect(goldQty).toBeCloseTo(0.1, 4);

    // Forex: EURUSD entry 1.0850, stop 1.0800 (50 pips / 0.0050). Multiplier = 100,000.
    // Risk per 1 lot = 0.0050 * 100,000 = $500.
    // Intended lot size = $100 / $500 = 0.20 lots.
    const fxQty = riskQty({
      equity: 10_000,
      entry: 1.085,
      stop: 1.08,
      side: "buy",
      riskPct: 1,
      maxQty: 100,
      contractMultiplier: 100_000,
    });
    expect(fxQty).toBeCloseTo(0.2, 4);
  });
  it("rejects missing, non-finite, non-positive or wrong-side stops", () => {
    expect(riskQty({ ...base, stop: undefined })).toBeNull();
    expect(riskQty({ ...base, stop: NaN })).toBeNull();
    expect(riskQty({ ...base, stop: 0 })).toBeNull();
    expect(riskQty({ ...base, stop: 101 })).toBeNull();
    expect(riskQty({ ...base, side: "sell", stop: 99 })).toBeNull();
    expect(riskQty({ ...base, side: "sell", stop: 101 })).toBe(100);
  });
  it("caps the size", () => {
    expect(riskQty({ ...base, stop: 99.99, maxQty: 50 })).toBe(50);
  });
});

describe("calculateRiskReward", () => {
  it("calculates long risk reward ratio", () => {
    const res = calculateRiskReward({
      side: "buy",
      entry: 100,
      stop: 95,
      target: 110,
    });
    expect(res.risk).toBe(5);
    expect(res.reward).toBe(10);
    expect(res.ratio).toBe(2);
  });

  it("calculates short risk reward ratio", () => {
    const res = calculateRiskReward({
      side: "sell",
      entry: 100,
      stop: 105,
      target: 85,
    });
    expect(res.risk).toBe(5);
    expect(res.reward).toBe(15);
    expect(res.ratio).toBe(3);
  });

  it("returns null ratio when invalid geometry or missing levels", () => {
    expect(calculateRiskReward({ side: "buy", entry: 100, stop: 105, target: 110 }).ratio).toBeNull();
    expect(calculateRiskReward({ side: "buy", entry: 100, stop: 95 }).ratio).toBeNull();
  });
});

describe("createLockout", () => {
  it("blocks the same key inside the window only", () => {
    let t = 0;
    const lock = createLockout(500, () => t);
    expect(lock("a")).toBe(true);
    expect(lock("a")).toBe(false);
    expect(lock("b")).toBe(true);
    t = 501;
    expect(lock("a")).toBe(true);
  });
});
