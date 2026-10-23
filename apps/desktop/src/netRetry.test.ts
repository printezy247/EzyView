import { describe, expect, it } from "vitest";
import { CircuitBreaker, CircuitOpenError, backoffDelay, withRetry } from "./netRetry";

const noSleep = (): Promise<void> => Promise.resolve();

describe("backoffDelay", () => {
  it("grows exponentially and is capped", () => {
    // rand() = 1 returns the full exponential (floored).
    expect(backoffDelay(0, 100, 5000, () => 1)).toBe(100);
    expect(backoffDelay(1, 100, 5000, () => 1)).toBe(200);
    expect(backoffDelay(2, 100, 5000, () => 1)).toBe(400);
    // Past the cap it stops growing.
    expect(backoffDelay(10, 100, 5000, () => 1)).toBe(5000);
  });

  it("applies full jitter between 0 and the exponential", () => {
    expect(backoffDelay(3, 100, 5000, () => 0)).toBe(0);
    expect(backoffDelay(3, 100, 5000, () => 0.5)).toBe(400); // 0.5 * 800
  });
});

describe("withRetry", () => {
  it("returns the first success without retrying", async () => {
    let calls = 0;
    const value = await withRetry(async () => {
      calls += 1;
      return "ok";
    }, { sleep: noSleep });
    expect(value).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries transient failures then succeeds", async () => {
    let calls = 0;
    const value = await withRetry(async () => {
      calls += 1;
      if (calls < 3) throw new Error("blip");
      return "ok";
    }, { attempts: 3, sleep: noSleep });
    expect(value).toBe("ok");
    expect(calls).toBe(3);
  });

  it("rethrows the last error after exhausting attempts", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls += 1;
        throw new Error("always");
      }, { attempts: 3, sleep: noSleep }),
    ).rejects.toThrow("always");
    expect(calls).toBe(3);
  });

  it("times out a hanging call when timeoutMs is set", async () => {
    await expect(
      withRetry(() => new Promise((resolve) => setTimeout(resolve, 500)), {
        attempts: 1,
        timeoutMs: 20,
        sleep: noSleep,
      }),
    ).rejects.toThrow(/Timed out/);
  });
});

describe("CircuitBreaker", () => {
  it("stays closed below the failure threshold", () => {
    let t = 0;
    const cb = new CircuitBreaker({ threshold: 3, cooldownMs: 100, now: () => t });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.currentState).toBe("closed");
    expect(() => cb.before()).not.toThrow();
  });

  it("opens after the threshold and fails fast until the cooldown elapses", () => {
    let t = 0;
    const cb = new CircuitBreaker({ threshold: 2, cooldownMs: 100, now: () => t });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.currentState).toBe("open");
    expect(() => cb.before()).toThrow(CircuitOpenError);
    // Still cooling down.
    t = 50;
    expect(() => cb.before()).toThrow(CircuitOpenError);
  });

  it("half-opens after the cooldown, closes on success", () => {
    let t = 0;
    const cb = new CircuitBreaker({ threshold: 1, cooldownMs: 100, now: () => t });
    cb.recordFailure();
    expect(cb.currentState).toBe("open");
    t = 150;
    expect(() => cb.before()).not.toThrow(); // probe allowed
    expect(cb.currentState).toBe("half_open");
    cb.recordSuccess();
    expect(cb.currentState).toBe("closed");
  });

  it("re-opens on a failed probe", () => {
    let t = 0;
    const cb = new CircuitBreaker({ threshold: 1, cooldownMs: 100, now: () => t });
    cb.recordFailure();
    t = 150;
    cb.before(); // probe
    cb.recordFailure();
    expect(cb.currentState).toBe("open");
    t = 160;
    expect(() => cb.before()).toThrow(CircuitOpenError);
  });
});
