import { describe, expect, it } from "vitest";
import { DEFAULT_SAFETY, gateAction, parseSafety } from "./tradingSafety";
import type { SafetyConfig } from "./tradingSafety";

const rails = (over: Partial<SafetyConfig> = {}): SafetyConfig => ({ ...DEFAULT_SAFETY, ...over });

describe("default safety rails", () => {
  it("ships the daily-loss breaker and the loss cooldown switched on", () => {
    expect(DEFAULT_SAFETY.maxDailyLossPct).toBeGreaterThan(0);
    expect(DEFAULT_SAFETY.lossCooldownSeconds).toBeGreaterThan(0);
  });

  it("keeps a conservative order-size cap and dry-run off (paper/demo still trades)", () => {
    expect(DEFAULT_SAFETY.maxOrderVolume).toBeLessThanOrEqual(1);
    expect(DEFAULT_SAFETY.dryRun).toBe(false);
  });

  it("warns that the allow-list is empty rather than pretending it is set", () => {
    const result = gateAction({ action: "place", symbol: "EURUSD", volume: 0.1, accountKind: "demo" }, rails());
    expect(result.decision).toBe("confirm");
    expect(result.reasons.join(" ")).toMatch(/allow-list empty/);
  });
});

describe("parseSafety", () => {
  it("falls back to the protective defaults when the stored blob is unusable", () => {
    const parsed = parseSafety({ maxDailyLossPct: "nonsense", lossCooldownSeconds: -5 });
    expect(parsed.maxDailyLossPct).toBe(DEFAULT_SAFETY.maxDailyLossPct);
    expect(parsed.lossCooldownSeconds).toBe(DEFAULT_SAFETY.lossCooldownSeconds);
  });

  it("keeps an explicitly stored 0 (the user turned the breaker off on purpose)", () => {
    const parsed = parseSafety({ maxDailyLossPct: 0, lossCooldownSeconds: 0 });
    expect(parsed.maxDailyLossPct).toBe(0);
    expect(parsed.lossCooldownSeconds).toBe(0);
  });

  it("never returns a negative cap", () => {
    expect(parseSafety({ maxOrderVolume: -3 }).maxOrderVolume).toBe(DEFAULT_SAFETY.maxOrderVolume);
  });
});
