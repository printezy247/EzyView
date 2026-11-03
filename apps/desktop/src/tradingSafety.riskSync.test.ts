import { beforeEach, describe, expect, it } from "vitest";
import { DailyRiskTracker, RiskSessionSync, dailyRiskTracker, gateAction } from "./tradingSafety";
import type { SafetyConfig } from "./tradingSafety";

const rails = (over: Partial<SafetyConfig> = {}): SafetyConfig => ({
  maxOrderVolume: 1,
  symbolAllowList: [],
  dryRun: false,
  maxDailyLossPct: 5,
  lossCooldownSeconds: 60,
  ...over,
});

beforeEach(() => {
  dailyRiskTracker.reset();
});

describe("RiskSessionSync", () => {
  it("captures the starting balance once, so a later loss cannot reset the base", () => {
    const sync = new RiskSessionSync();
    sync.sync({ balance: 10_000 }, []);
    // The account has lost money: the base must stay at 10,000.
    sync.sync({ balance: 9_000 }, []);
    const check = dailyRiskTracker.checkDailyDrawdown(9_000, 5);
    expect(check.tripped).toBe(true);
    expect(check.drawdownPct).toBe(10);
    sync.reset();
  });

  it("records a closed loss once, not on every sync of the same deal", () => {
    const sync = new RiskSessionSync();
    const deal = { id: "d1", symbol: "EURUSD", pnl: -100, time: 1_700_000_000 };
    sync.sync({ balance: 10_000 }, [deal]);
    sync.sync({ balance: 10_000 }, [deal]);
    sync.sync({ balance: 10_000 }, [deal]);
    const cooldown = dailyRiskTracker.isSymbolInCooldown("EURUSD", 60, 1_700_000_000 * 1000);
    expect(cooldown.inCooldown).toBe(true);
    sync.reset();
  });

  it("ignores profitable deals", () => {
    const sync = new RiskSessionSync();
    sync.sync({ balance: 10_000 }, [{ id: "d2", symbol: "EURUSD", pnl: 250, time: 1_700_000_000 }]);
    const cooldown = dailyRiskTracker.isSymbolInCooldown("EURUSD", 60, 1_700_000_000 * 1000);
    expect(cooldown.inCooldown).toBe(false);
    sync.reset();
  });

  it("tolerates a missing account or a broken balance", () => {
    const sync = new RiskSessionSync();
    sync.sync(null, []);
    sync.sync({ balance: 0 }, []);
    sync.sync({ balance: Number.NaN }, []);
    expect(dailyRiskTracker.checkDailyDrawdown(1, 5).tripped).toBe(false);
    sync.reset();
  });

  it("reset clears the base balance and the loss history", () => {
    const sync = new RiskSessionSync();
    sync.sync({ balance: 10_000 }, [{ id: "d3", symbol: "EURUSD", pnl: -100, time: 1_700_000_000 }]);
    sync.reset();
    expect(dailyRiskTracker.checkDailyDrawdown(1, 5).tripped).toBe(false);
    expect(dailyRiskTracker.isSymbolInCooldown("EURUSD", 60, 1_700_000_000 * 1000).inCooldown).toBe(false);
  });
});

describe("the drawdown breaker fires once the tracker is fed", () => {
  it("blocks a place order after the daily loss limit is hit", () => {
    const sync = new RiskSessionSync();
    sync.sync({ balance: 10_000 }, []);
    sync.sync({ balance: 9_400 }, []);
    const result = gateAction(
      { action: "place", symbol: "EURUSD", volume: 0.1, accountKind: "demo", currentEquity: 9_400 },
      rails(),
    );
    expect(result.decision).toBe("block");
    expect(result.reasons.join(" ")).toMatch(/daily drawdown circuit breaker tripped/);
    sync.reset();
  });

  it("blocks a new entry on a symbol that just lost within the cooldown", () => {
    const sync = new RiskSessionSync();
    const now = Math.floor(Date.now() / 1000);
    sync.sync({ balance: 10_000 }, [{ id: "d4", symbol: "XAUUSD", pnl: -120, time: now }]);
    const result = gateAction({ action: "place", symbol: "XAUUSD", volume: 0.1, accountKind: "demo" }, rails());
    expect(result.decision).toBe("block");
    expect(result.reasons.join(" ")).toMatch(/cooldown active for XAUUSD/);
    sync.reset();
  });
});

describe("DailyRiskTracker", () => {
  it("a new day resets the session", () => {
    const tracker = new DailyRiskTracker();
    tracker.initSession(1_000);
    tracker.recordClosedTrade("EURUSD", -50);
    expect(tracker.isSymbolInCooldown("EURUSD", 60).inCooldown).toBe(true);
  });
});
