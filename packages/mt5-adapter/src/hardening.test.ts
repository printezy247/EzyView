import { describe, expect, it, vi } from "vitest";
import { Mt5Trading } from "./adapter";
import { isLoopbackUrl, McpClient } from "./mcp";
import { createTransport } from "./transport";
import type { Mt5Transport } from "./transport";

function fake(overrides: Partial<Mt5Transport> = {}): Mt5Transport {
  return {
    ping: async () => true,
    account: async () => ({}),
    openPositions: async () => ({ positions: [], orders: [] }),
    deals: async () => ({ deals: [] }),
    marketWatch: async () => ({ symbols: [] }),
    history: async () => ({ rates: [] }),
    placeOrder: vi.fn(async () => ({ ticket: 42 })),
    close: vi.fn(async () => ({ ok: true })),
    cancel: vi.fn(async () => ({ ok: true })),
    modify: vi.fn(async () => ({ ok: true })),
    ...overrides,
  };
}
const mkt = { symbol: "EURUSD", side: "buy" as const, type: "market" as const };

describe("token redaction", () => {
  it("never leaks the token or a long body in errors", async () => {
    const fetchFn = vi.fn(async () => new Response("x".repeat(500) + " token=SECRET123", { status: 500 }));
    const t = createTransport({ kind: "bridge", bridgeToken: "SECRET123", fetchFn });
    const err = await t.account().catch((e: Error) => e);
    expect((err as Error).message).not.toContain("SECRET123");
    expect((err as Error).message.length).toBeLessThan(400);
  });
  it("redacts the token from thrown network errors", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      throw new Error(`failed ${url}`);
    });
    const t = createTransport({ kind: "bridge", bridgeToken: "SECRET123", fetchFn });
    const err = await t.account().catch((e: Error) => e);
    expect((err as Error).message).not.toContain("SECRET123");
  });
});

describe("placeOrder validation", () => {
  it.each([0, -1, NaN, Infinity, 1e9])("rejects qty %s", async (qty) => {
    const tr = new Mt5Trading(fake());
    await expect(tr.placeOrder({ ...mkt, qty })).rejects.toThrow(/qty/);
  });
  it("rejects non-finite price fields", async () => {
    const tr = new Mt5Trading(fake());
    await expect(tr.placeOrder({ ...mkt, type: "limit", qty: 1, price: NaN })).rejects.toThrow(/price/);
    await expect(tr.placeOrder({ ...mkt, qty: 1, stopLoss: Infinity })).rejects.toThrow(/stopLoss/);
  });
  it("rejects a duplicate clientOrderId, even after a failure", async () => {
    const placeOrder = vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValue({ ticket: 1 });
    const tr = new Mt5Trading(fake({ placeOrder }));
    await expect(tr.placeOrder({ ...mkt, qty: 1, clientOrderId: "a" })).rejects.toThrow("timeout");
    await expect(tr.placeOrder({ ...mkt, qty: 1, clientOrderId: "a" })).rejects.toThrow(/duplicate/i);
    expect(placeOrder).toHaveBeenCalledTimes(1);
  });
  it("rejects a duplicate while in flight", async () => {
    const tr = new Mt5Trading(fake({ placeOrder: () => new Promise((r) => setTimeout(() => r({ ticket: 1 }), 10)) }));
    const first = tr.placeOrder({ ...mkt, qty: 1, clientOrderId: "b" });
    await expect(tr.placeOrder({ ...mkt, qty: 1, clientOrderId: "b" })).rejects.toThrow(/duplicate/i);
    await first;
  });
});

describe("error propagation", () => {
  it("getPositions and closePosition surface failures", async () => {
    const tr = new Mt5Trading(fake({ openPositions: async () => { throw new Error("down"); } }));
    await expect(tr.getPositions()).rejects.toThrow("down");
    await expect(tr.closePosition("EURUSD")).rejects.toThrow("down");
  });
  it("closePosition throws when no position, and derives side from it", async () => {
    const tr = new Mt5Trading(fake());
    await expect(tr.closePosition("EURUSD")).rejects.toThrow(/no open position/i);
    const tr2 = new Mt5Trading(fake({ openPositions: async () => ({ positions: [{ symbol: "EURUSD", type: 1, volume: 2, price_open: 1, price_current: 1, profit: 0, sl: 0, tp: 0, time: 1 }] }) }));
    expect((await tr2.closePosition("EURUSD")).side).toBe("buy");
  });
  it("cancelOrder is false when the bridge says not ok", async () => {
    const tr = new Mt5Trading(fake({ cancel: async () => ({ ok: false }) }));
    expect(await tr.cancelOrder("5")).toBe(false);
  });
  it("modifyOrder does not echo fields it cannot apply", async () => {
    const tr = new Mt5Trading(fake());
    const o = await tr.modifyOrder("5", { stopLoss: 1, qty: 99, price: 5 });
    expect(o.qty).not.toBe(99);
    expect(o.price).toBeUndefined();
  });
});

describe("loopback check", () => {
  it.each([["http://127.0.0.1:1", true], ["http://[::1]:1/x", true], ["http://localhost:1", false], ["http://127.0.0.1.evil.com", false]])("%s", (u, ok) => {
    expect(isLoopbackUrl(u as string)).toBe(ok);
  });
  it("fetches with redirect: error", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    const c = new McpClient({ url: "http://127.0.0.1:1/mcp", fetchFn: fetch as never });
    await c.ping().catch(() => {});
    expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].redirect).toBe("error");
  });
});
