import type { Candle } from "./types.js";

export type AlertCondition =
  | { kind: "crossing"; value: number }
  | { kind: "crossing_up"; value: number }
  | { kind: "crossing_down"; value: number }
  | { kind: "greater"; value: number }
  | { kind: "less"; value: number }
  | { kind: "moving_up"; bars: number }
  | { kind: "moving_down"; bars: number }
  | { kind: "channel_exit_up"; mult: number }
  | { kind: "channel_exit_down"; mult: number };

export type AlertFrequency = "once" | "once_per_bar" | "once_per_bar_close";

export type AlertState = "armed" | "triggered";

export interface PriceAlert {
  id: string;
  symbol: string;
  /** Close-price source for the condition; kept simple for P2. */
  message: string;
  condition: AlertCondition;
  frequency: AlertFrequency;
  state: AlertState;
  createdAt: number;
  triggeredAt?: number;
  /** Last close the evaluator saw, so crossings do not re-fire. */
  lastPrice?: number;
  /** Last candle timestamp seen by the evaluator, so once_per_bar alerts re-arm on a new bar. */
  lastBarTime?: number;
  /** When set, the alert follows this horizontal drawing: moving the line moves the level, deleting the line deletes the alert. */
  drawingId?: string;
}

/**
 * Does `condition` fire at `price`, given the previous close?
 *
 * Pure and synchronous so it can be unit-tested without a chart.
 */
export function shouldTrigger(
  condition: AlertCondition,
  price: number,
  prevPrice: number | undefined,
  history: readonly number[],
): boolean {
  switch (condition.kind) {
    case "crossing":
      return crossed(prevPrice, price, condition.value);
    case "crossing_up":
      // Inclusive on the far side, so an exact touch of the level counts.
      return prevPrice !== undefined && prevPrice < condition.value && price >= condition.value;
    case "crossing_down":
      return prevPrice !== undefined && prevPrice > condition.value && price <= condition.value;
    case "greater":
      return price > condition.value;
    case "less":
      return price < condition.value;
    case "moving_up":
      return risingFor(history, condition.bars);
    case "moving_down":
      return fallingFor(history, condition.bars);
    case "channel_exit_up": {
      const bounds = channelBounds(history, condition.mult);
      return bounds !== null && price > bounds.upper;
    }
    case "channel_exit_down": {
      const bounds = channelBounds(history, condition.mult);
      return bounds !== null && price < bounds.lower;
    }
    default:
      return false;
  }
}

function crossed(prev: number | undefined, price: number, level: number): boolean {
  if (prev === undefined) return false;
  return (prev < level && price >= level) || (prev > level && price <= level);
}

function risingFor(history: readonly number[], bars: number): boolean {
  if (bars < 1 || history.length <= bars) return false;
  const start = history[history.length - 1 - bars];
  const end = history.at(-1);
  if (start === undefined || end === undefined) return false;
  for (let i = history.length - bars; i < history.length; i++) {
    if (history[i]! <= history[i - 1]!) return false;
  }
  return end > start;
}

function fallingFor(history: readonly number[], bars: number): boolean {
  if (bars < 1 || history.length <= bars) return false;
  for (let i = history.length - bars; i < history.length; i++) {
    if (history[i]! >= history[i - 1]!) return false;
  }
  return true;
}

/** Mean ± `mult` standard deviations over the supplied closes. */
function channelBounds(history: readonly number[], mult: number): { upper: number; lower: number } | null {
  if (history.length < 2) return null;
  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const variance = history.reduce((a, b) => a + (b - mean) ** 2, 0) / history.length;
  const sd = Math.sqrt(variance);
  return { upper: mean + mult * sd, lower: mean - mult * sd };
}

/** Rolling close history kept per alert, newest last. */
export interface AlertHistory {
  [alertId: string]: number[];
}

/**
 * Evaluate one alert against a new candle.
 *
 * Returns the updated alert (state, lastPrice, triggeredAt) or null if nothing
 * changed. `once` alerts stay triggered; `once_per_bar_close` only fires at a
 * bar boundary, so a mid-bar wick through the level will not alert early.
 */
export function evaluateAlert(
  alert: PriceAlert,
  history: readonly number[],
  candle: Candle,
  barClosed: boolean,
): PriceAlert | null {
  if (alert.state === "triggered" && alert.frequency === "once") return null;

  // Re-arm per-bar alerts when the candle timestamp advances to a new bar.
  const isNewBar = alert.lastBarTime !== undefined && candle.time > alert.lastBarTime;
  const effectiveState: AlertState =
    alert.state === "triggered" && alert.frequency !== "once" && isNewBar ? "armed" : alert.state;

  // If still triggered inside the same bar, update lastPrice/lastBarTime only if changed.
  if (effectiveState === "triggered") {
    if (alert.lastPrice === candle.close && alert.lastBarTime === candle.time) return null;
    return { ...alert, lastPrice: candle.close, lastBarTime: candle.time };
  }

  const price = candle.close;
  const fired = shouldTrigger(alert.condition, price, alert.lastPrice, history);

  const shouldHoldLastPrice = alert.frequency === "once_per_bar_close" && !barClosed && alert.lastPrice !== undefined;
  const nextPrice = shouldHoldLastPrice ? alert.lastPrice : price;

  const next: PriceAlert = {
    ...alert,
    state: effectiveState,
    lastPrice: nextPrice,
    lastBarTime: candle.time,
  };
  if (!fired) {
    return alert.lastPrice === nextPrice &&
      alert.state === effectiveState &&
      (alert.lastBarTime === undefined || alert.lastBarTime === candle.time)
      ? null
      : next;
  }

  // once_per_bar wants the trigger but does not need a bar boundary to record it.
  next.state = "triggered";
  next.triggeredAt = candle.time;
  if (alert.frequency === "once_per_bar_close" && !barClosed) {
    next.state = effectiveState;
    if (alert.triggeredAt === undefined) delete next.triggeredAt;
    else next.triggeredAt = alert.triggeredAt;
  }
  return next;
}

/** Append a close to an alert's history, trimming to the window we need. */
export function pushHistory(history: AlertHistory, alertId: string, close: number, keep = 200): AlertHistory {
  const prior = history[alertId] ?? [];
  const next = [...prior, close];
  return { ...history, [alertId]: next.length > keep ? next.slice(-keep) : next };
}
