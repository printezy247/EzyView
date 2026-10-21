import { describe, expect, it } from "vitest";
import type { Candle } from "./types.js";
import { evaluateAlert, pushHistory, shouldTrigger } from "./alerts.js";
import type { AlertCondition, AlertFrequency, PriceAlert } from "./alerts.js";

const candle = (close: number, time = 1_700_000_000): Candle => ({
  time,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 100,
});

const alert = (condition: AlertCondition, frequency: AlertFrequency = "once"): PriceAlert => ({
  id: "a1",
  symbol: "BINANCE:BTCUSDT",
  message: "test",
  condition,
  frequency,
  state: "armed",
  createdAt: 0,
});

describe("shouldTrigger — level crossings", () => {
  it("fires on an upward crossing only", () => {
    const cond: AlertCondition = { kind: "crossing_up", value: 100 };
    expect(shouldTrigger(cond, 101, 99, [])).toBe(true);
    expect(shouldTrigger(cond, 99, 101, [])).toBe(false);
  });

  it("fires on a downward crossing only", () => {
    const cond: AlertCondition = { kind: "crossing_down", value: 100 };
    expect(shouldTrigger(cond, 99, 101, [])).toBe(true);
    expect(shouldTrigger(cond, 101, 99, [])).toBe(false);
  });

  it("fires either way for a bare crossing", () => {
    const cond: AlertCondition = { kind: "crossing", value: 100 };
    expect(shouldTrigger(cond, 101, 99, [])).toBe(true);
    expect(shouldTrigger(cond, 99, 101, [])).toBe(true);
  });

  it("does not fire without a previous price", () => {
    expect(shouldTrigger({ kind: "crossing", value: 100 }, 101, undefined, [])).toBe(false);
  });

  it("treats an exact touch from below as a crossing", () => {
    expect(shouldTrigger({ kind: "crossing_up", value: 100 }, 100, 99, [])).toBe(true);
  });
});

describe("shouldTrigger — threshold", () => {
  it("greater and less are strict", () => {
    expect(shouldTrigger({ kind: "greater", value: 100 }, 100.01, 100, [])).toBe(true);
    expect(shouldTrigger({ kind: "greater", value: 100 }, 100, 99, [])).toBe(false);
    expect(shouldTrigger({ kind: "less", value: 100 }, 99.99, 100, [])).toBe(true);
    expect(shouldTrigger({ kind: "less", value: 100 }, 100, 101, [])).toBe(false);
  });
});

describe("shouldTrigger — trend conditions", () => {
  it("moving_up needs every bar in the window higher", () => {
    expect(shouldTrigger({ kind: "moving_up", bars: 3 }, 110, 109, [100, 103, 106, 110])).toBe(true);
    expect(shouldTrigger({ kind: "moving_up", bars: 3 }, 104, 106, [100, 103, 106, 104])).toBe(false);
  });

  it("moving_down needs every bar in the window lower", () => {
    expect(shouldTrigger({ kind: "moving_down", bars: 3 }, 90, 93, [100, 97, 93, 90])).toBe(true);
    expect(shouldTrigger({ kind: "moving_down", bars: 3 }, 96, 93, [100, 97, 93, 96])).toBe(false);
  });

  it("refuses a trend condition with too little history", () => {
    expect(shouldTrigger({ kind: "moving_up", bars: 5 }, 110, 109, [100, 105, 110])).toBe(false);
  });

  it("channel exits compare price against mean ± mult·σ", () => {
    // Ten closes centred on 100 with a known spread.
    const history = [97, 98, 99, 100, 101, 102, 103, 100, 100, 100];
    // mean 100, σ ≈ 1.79 → a 2σ band is roughly 96.4 .. 103.6
    expect(shouldTrigger({ kind: "channel_exit_up", mult: 2 }, 104, 100, history)).toBe(true);
    expect(shouldTrigger({ kind: "channel_exit_up", mult: 2 }, 102, 100, history)).toBe(false);
    expect(shouldTrigger({ kind: "channel_exit_down", mult: 2 }, 96, 100, history)).toBe(true);
    expect(shouldTrigger({ kind: "channel_exit_down", mult: 2 }, 98, 100, history)).toBe(false);
  });

  it("a wider multiplier needs a bigger excursion", () => {
    const history = [97, 98, 99, 100, 101, 102, 103, 100, 100, 100];
    expect(shouldTrigger({ kind: "channel_exit_up", mult: 2 }, 104, 100, history)).toBe(true);
    expect(shouldTrigger({ kind: "channel_exit_up", mult: 4 }, 104, 100, history)).toBe(false);
  });

  it("refuses a channel exit with too little history", () => {
    expect(shouldTrigger({ kind: "channel_exit_up", mult: 2 }, 1e9, 1, [100])).toBe(false);
  });
});

describe("evaluateAlert", () => {
  it("arms on a normal candle", () => {
    const a = alert({ kind: "greater", value: 100 });
    const out = evaluateAlert(a, [], candle(90), false);
    expect(out?.state).toBe("armed");
    expect(out?.lastPrice).toBe(90);
  });

  it("returns null when nothing changed", () => {
    const a = { ...alert({ kind: "greater", value: 100 }), lastPrice: 90 };
    expect(evaluateAlert(a, [], candle(90), false)).toBeNull();
  });

  it("triggers and stamps the bar time", () => {
    const a = { ...alert({ kind: "greater", value: 100 }), lastPrice: 99 };
    const out = evaluateAlert(a, [], candle(105, 1_700_000_042), false);
    expect(out?.state).toBe("triggered");
    expect(out?.triggeredAt).toBe(1_700_000_042);
  });

  it("a `once` alert stays triggered and never re-fires", () => {
    const a = { ...alert({ kind: "greater", value: 100 }), state: "triggered" as const, triggeredAt: 5 };
    expect(evaluateAlert(a, [], candle(200), true)).toBeNull();
  });

  it("`once_per_bar_close` holds the trigger until the bar closes", () => {
    const a = { ...alert({ kind: "greater", value: 100 }, "once_per_bar_close"), lastPrice: 99 };
    const midBar = evaluateAlert(a, [], candle(150), false);
    expect(midBar?.state).toBe("armed");
    const closed = evaluateAlert(a, [], candle(150, 1_700_000_084), true);
    expect(closed?.state).toBe("triggered");
  });

  it("re-arms a `once_per_bar` alert on a new bar timestamp and can fire again", () => {
    const a0 = alert({ kind: "greater", value: 100 }, "once_per_bar");
    // Fires on bar 1000
    const a1 = evaluateAlert(a0, [], candle(105, 1000), false)!;
    expect(a1.state).toBe("triggered");
    expect(a1.lastBarTime).toBe(1000);
    // Same bar 1000: stays triggered, does not re-fire
    const sameBar = evaluateAlert(a1, [], candle(110, 1000), false);
    expect(sameBar?.state).toBe("triggered");
    // Next bar 1060 where condition is false: re-arms to "armed"
    const rearmed = evaluateAlert(sameBar ?? a1, [], candle(95, 1060), false)!;
    expect(rearmed.state).toBe("armed");
    // Next bar 1120 where condition is true again: fires again!
    const refired = evaluateAlert(rearmed, [], candle(108, 1120), false)!;
    expect(refired.state).toBe("triggered");
    expect(refired.triggeredAt).toBe(1120);
  });
});

describe("pushHistory", () => {
  it("appends newest-last and trims to the window", () => {
    let h = pushHistory({}, "a1", 1);
    h = pushHistory(h, "a1", 2);
    h = pushHistory(h, "a1", 3, 2);
    expect(h.a1).toEqual([2, 3]);
  });

  it("keeps alerts independent", () => {
    let h = pushHistory({}, "a1", 1);
    h = pushHistory(h, "a2", 9);
    expect(h.a1).toEqual([1]);
    expect(h.a2).toEqual([9]);
  });
});
