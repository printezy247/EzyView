import { describe, expect, it } from "vitest";
import {
  ApprovalTokens,
  DailyRiskTracker,
  DEFAULT_SAFETY,
  dailyRiskTracker,
  gateAction,
  maskLogin,
  mt5KeyringName,
  parseSafety,
  scrub,
} from "./tradingSafety";
import type { SafetyConfig } from "./tradingSafety";

const rails = (over: Partial<SafetyConfig> = {}): SafetyConfig => ({ ...DEFAULT_SAFETY, ...over });

describe("gateAction", () => {
  it("blocks volume above the cap without opening a dialog", () => {
    const result = gateAction({ action: "place", symbol: "XAUUSD", volume: 2, accountKind: "demo" }, rails({ maxOrderVolume: 1 }));
    expect(result.decision).toBe("block");
    expect(result.reasons.join(" ")).toMatch(/exceeds the max order size/);
  });

  it("blocks non-positive volume", () => {
    expect(gateAction({ action: "place", volume: 0, accountKind: "demo" }, rails()).decision).toBe("block");
    expect(gateAction({ action: "place", volume: -1, accountKind: "demo" }, rails()).decision).toBe("block");
  });

  it("blocks symbols outside a non-empty allow-list, case-insensitively", () => {
    const config = rails({ symbolAllowList: ["eurusd"] });
    expect(gateAction({ action: "place", symbol: "EURUSD", volume: 0.1, accountKind: "demo" }, config).decision).toBe("confirm");
    expect(gateAction({ action: "place", symbol: "XAUUSD", volume: 0.1, accountKind: "demo" }, config).decision).toBe("block");
  });

  it("warns instead of blocking when the allow-list is empty", () => {
    const result = gateAction({ action: "place", symbol: "anything", volume: 0.1, accountKind: "demo" }, rails());
    expect(result.decision).toBe("confirm");
    expect(result.reasons.join(" ")).toMatch(/allow-list empty/);
  });

  it("every MT5 action confirms; real and unknown accounts confirm twice", () => {
    const demo = gateAction({ action: "place", volume: 0.1, accountKind: "demo" }, rails());
    expect(demo.decision).toBe("confirm");
    expect(demo.secondConfirm).toBe(false);

    const real = gateAction({ action: "place", volume: 0.1, accountKind: "real" }, rails());
    expect(real.decision).toBe("confirm");
    expect(real.secondConfirm).toBe(true);
    expect(real.reasons.join(" ")).toMatch(/REAL account/);

    const unknown = gateAction({ action: "place", volume: 0.1, accountKind: "unknown" }, rails());
    expect(unknown.decision).toBe("confirm");
    expect(unknown.secondConfirm).toBe(true);

    for (const action of ["close", "cancel", "modify"] as const) {
      expect(gateAction({ action, accountKind: "demo" }, rails()).decision).toBe("confirm");
    }
  });

  it("says dry-run on the wire so the dialog can show it", () => {
    const result = gateAction({ action: "place", volume: 0.1, accountKind: "demo" }, rails({ dryRun: true }));
    expect(result.dryRun).toBe(true);
    expect(result.reasons.join(" ")).toMatch(/not sent/);
  });

  it("blocks place orders when daily drawdown exceeds maxDailyLossPct", () => {
    const tracker = new DailyRiskTracker();
    tracker.initSession(10_000);
    // Drawdown of $600 on $10,000 = 6% loss
    const check = tracker.checkDailyDrawdown(9_400, 5);
    expect(check.tripped).toBe(true);
    expect(check.drawdownPct).toBe(6);

    dailyRiskTracker.reset();
    dailyRiskTracker.initSession(10_000);
    const result = gateAction(
      { action: "place", symbol: "EURUSD", volume: 0.1, accountKind: "demo", currentEquity: 9_400 },
      rails({ maxDailyLossPct: 5 }),
    );
    expect(result.decision).toBe("block");
    expect(result.reasons.join(" ")).toMatch(/daily drawdown circuit breaker tripped/);
    dailyRiskTracker.reset();
  });

  it("blocks orders during symbol cooldown window after a loss", () => {
    dailyRiskTracker.reset();
    const now = Date.now();
    dailyRiskTracker.recordClosedTrade("EURUSD", -150, now);

    const blocked = gateAction(
      { action: "place", symbol: "EURUSD", volume: 0.1, accountKind: "demo" },
      rails({ lossCooldownSeconds: 60 }),
    );
    expect(blocked.decision).toBe("block");
    expect(blocked.reasons.join(" ")).toMatch(/cooldown active for EURUSD/);

    // Another symbol is not blocked
    const allowed = gateAction(
      { action: "place", symbol: "GBPUSD", volume: 0.1, accountKind: "demo" },
      rails({ lossCooldownSeconds: 60 }),
    );
    expect(allowed.decision).toBe("confirm");
    dailyRiskTracker.reset();
  });
});

describe("ApprovalTokens", () => {
  it("consumes a minted token exactly once", () => {
    const tokens = new ApprovalTokens();
    const token = tokens.mint();
    expect(tokens.outstanding).toBe(1);
    expect(tokens.consume(token)).toBe(true);
    expect(tokens.consume(token)).toBe(false);
    expect(tokens.outstanding).toBe(0);
  });

  it("refuses foreign and empty tokens", () => {
    const tokens = new ApprovalTokens();
    expect(tokens.consume("never-issued")).toBe(false);
    expect(tokens.consume(null)).toBe(false);
    expect(tokens.consume(undefined)).toBe(false);
    expect(tokens.consume("")).toBe(false);
  });

  it("revokes everything on disconnect", () => {
    const tokens = new ApprovalTokens();
    const a = tokens.mint();
    tokens.mint();
    tokens.revokeAll();
    expect(tokens.outstanding).toBe(0);
    expect(tokens.consume(a)).toBe(false);
  });

  it("mints distinct tokens", () => {
    const tokens = new ApprovalTokens();
    expect(tokens.mint()).not.toBe(tokens.mint());
  });
});

describe("maskLogin", () => {
  it("keeps only the tail visible", () => {
    expect(maskLogin("12345678")).toBe("••••5678");
    expect(maskLogin(12345678)).toBe("••••5678");
    expect(maskLogin("abc")).toBe("•••");
    expect(maskLogin("")).toBe("");
    expect(maskLogin(null)).toBe("");
  });
});

describe("mt5KeyringName", () => {
  it("builds the mt5:<login>@<server> account name", () => {
    expect(mt5KeyringName("MetaQuotes-Demo", "4123")).toBe("mt5:4123@MetaQuotes-Demo");
  });

  it("mirrors the Rust charset guard", () => {
    expect(mt5KeyringName("Bad Server", "4123")).toBeNull();
    expect(mt5KeyringName("S", "")).toBeNull();
    expect(mt5KeyringName("", "1")).toBeNull();
    expect(mt5KeyringName("S", "x@y")).toBeNull();
    expect(mt5KeyringName("S".repeat(129), "1")).toBeNull();
  });
});

describe("scrub", () => {
  it("redacts password-shaped keys at any depth", () => {
    const input = { login: "1", password: "hunter2", nested: { api_key: "k", ok: 1 }, list: [{ secret: "s" }] };
    expect(scrub(input)).toEqual({
      login: "1",
      password: "***",
      nested: { api_key: "***", ok: 1 },
      list: [{ secret: "***" }],
    });
  });

  it("leaves null-ish secret values alone", () => {
    expect(scrub({ password: null, token: undefined })).toEqual({ password: null, token: undefined });
  });
});

describe("parseSafety", () => {
  it("falls back to defaults for junk", () => {
    expect(parseSafety(null)).toEqual(DEFAULT_SAFETY);
    expect(parseSafety("nope")).toEqual(DEFAULT_SAFETY);
    expect(parseSafety({ maxOrderVolume: -2, symbolAllowList: "x" })).toEqual(DEFAULT_SAFETY);
  });

  it("trims and keeps valid entries", () => {
    const result = parseSafety({ maxOrderVolume: 0.5, symbolAllowList: [" EURUSD ", "", 7], dryRun: true });
    expect(result).toEqual({
      maxOrderVolume: 0.5,
      symbolAllowList: ["EURUSD"],
      dryRun: true,
      maxDailyLossPct: 0,
      lossCooldownSeconds: 0,
    });
  });
});
