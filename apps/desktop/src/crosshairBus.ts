/**
 * Crosshair sync across EzyView windows (main + detached charts).
 *
 * BroadcastChannel reaches every same-origin window of the app. A message
 * names the symbol it was hovering so a receiver only mirrors it onto charts
 * showing the same instrument; `null` time/price means the pointer left.
 */

const CHANNEL = "ezyview.crosshair.v1";

export interface CrosshairMessage {
  symbol: string;
  time: number | null;
  price: number | null;
}

/** Distinguishes our own echoes from other windows' messages. */
export const WINDOW_ID = Math.random().toString(36).slice(2);

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Validate a raw channel payload from another window; anything odd is ignored. */
export function parseCrosshairMessage(data: unknown, selfId: string = WINDOW_ID): CrosshairMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const m = data as Record<string, unknown>;
  if (m.from === selfId || typeof m.symbol !== "string" || m.symbol === "" || m.symbol.length > 64) return null;
  if (m.time === null && m.price === null) return { symbol: m.symbol, time: null, price: null };
  if (!finite(m.time) || !finite(m.price)) return null;
  return { symbol: m.symbol, time: m.time, price: m.price };
}

let channel: BroadcastChannel | null | undefined;
const open = (): BroadcastChannel | null => {
  if (channel === undefined) channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
  return channel;
};

let pendingPayload: { symbol: string; time: number | null; price: number | null } | null = null;
let rafHandle: number | null = null;

export function publishCrosshair(symbol: string, time: number | null, price: number | null): void {
  if (!symbol || symbol.length > 64) return;
  if (typeof requestAnimationFrame !== "function") {
    open()?.postMessage({ from: WINDOW_ID, symbol, time, price });
    return;
  }
  pendingPayload = { symbol, time, price };
  if (rafHandle === null) {
    rafHandle = requestAnimationFrame(() => {
      rafHandle = null;
      const p = pendingPayload;
      pendingPayload = null;
      if (p) open()?.postMessage({ from: WINDOW_ID, ...p });
    });
  }
}

export function subscribeCrosshair(onMessage: (m: CrosshairMessage) => void): () => void {
  const ch = open();
  if (!ch) return () => {};
  const handler = (e: MessageEvent) => {
    const parsed = parseCrosshairMessage(e.data);
    if (parsed) onMessage(parsed);
  };
  ch.addEventListener("message", handler);
  return () => ch.removeEventListener("message", handler);
}
