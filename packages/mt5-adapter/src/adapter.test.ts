import { describe, expect, it, vi } from "vitest";
import { Mt5MarketData, Mt5Trading, createMt5 } from "./adapter";
import { McpClient, McpError } from "./mcp";
import { createTransport } from "./transport";
import type { Mt5Transport } from "./transport";

function fakeTransport(overrides: Partial<Mt5Transport> = {}): Mt5Transport {
  return {
    ping: async () => true,
    account: async () => ({
      login: 230066111,
      trade_mode: 0,
      leverage: 1000,
      currency: "USD",
      balance: 3300.83,
      equity: 3300.83,
      margin: 0,
      margin_free: 3300.83,
    }),
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

describe("Mt5MarketData", () => {
  const candles = {
    rates: [
      { time: 300, open: 3, high: 4, low: 2, close: 3.5, tick_volume: 10 },
      { time: 100, open: 1, high: 2, low: 0.5, close: 1.5, tick_volume: 5 },
      { time: 200, open: 2, high: 3, low: 1, close: 2.5, tick_volume: 7 },
    ],
  };

  it("returns bars sorted oldest first", async () => {
    const data = new Mt5MarketData(fakeTransport({ history: async () => candles }));
    const bars = await data.getHistory({ symbol: "XAUUSD", resolution: "1m", from: 0, to: 400, limit: 2 });
    expect(bars.map((b) => b.time)).toEqual([200, 300]);
  });

  it("never throws: a dead transport reads as empty", async () => {
    const data = new Mt5MarketData(
      fakeTransport({
        ping: async () => false,
        history: async () => {
          throw new Error("bridge down");
        },
        marketWatch: async () => {
          throw new Error("bridge down");
        },
      }),
    );
    await expect(data.getHistory({ symbol: "XAUUSD", resolution: "1m", from: 0, to: 1 })).resolves.toEqual([]);
    await expect(data.getQuote("XAUUSD")).resolves.toBeNull();
    await expect(data.searchSymbols("XAU")).resolves.toEqual([]);
    await expect(data.ping()).resolves.toBe(false);
  });

  it("finds one quote inside the market watch list", async () => {
    const data = new Mt5MarketData(
      fakeTransport({
        marketWatch: async () => ({
          symbols: [
            { symbol: "EURUSD", bid: 1.12, ask: 1.13, time: 100 },
            { symbol: "XAUUSD", bid: 4148.56, ask: 4148.86, time: 200 },
          ],
        }),
      }),
    );
    const quote = await data.getQuote("XAUUSD");
    expect(quote).toMatchObject({ symbol: "XAUUSD", last: 4148.71, bid: 4148.56 });
  });

  it("filters the market watch by ticker or description", async () => {
    const data = new Mt5MarketData(
      fakeTransport({
        marketWatch: async () => ({
          symbols: [
            { symbol: "XAUUSD", description: "Gold (Spot)", digits: 2 },
            { symbol: "EURUSD", description: "Euro vs US Dollar", digits: 5 },
          ],
        }),
      }),
    );
    expect((await data.searchSymbols("xau")).map((s) => s.symbol)).toEqual(["XAUUSD"]);
    expect((await data.searchSymbols("Euro")).map((s) => s.symbol)).toEqual(["EURUSD"]);
    expect(await data.searchSymbols("")).toHaveLength(2);
  });

  it("subscribes by polling and stops cleanly", async () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    const data = new Mt5MarketData(
      fakeTransport({ marketWatch: async () => ({ symbols: [{ symbol: "XAUUSD", bid: 1, ask: 2, time: 1 }] }) }),
    );
    const stop = await data.subscribe(["XAUUSD"], (q) => seen.push(q.last));
    await vi.advanceTimersByTimeAsync(1600);
    await stop();
    const after = seen.length;
    await vi.advanceTimersByTimeAsync(1600);
    expect(seen.length).toBe(after);
    expect(after).toBeGreaterThanOrEqual(2);
    vi.useRealTimers();
  });
});

describe("Mt5Trading", () => {
  it("reads the account and reports demo mode", async () => {
    const trading = new Mt5Trading(fakeTransport());
    const account = await trading.connect();
    expect(account.balance).toBe(3300.83);
    expect(account.leverage).toBeCloseTo(0.001, 6);
    expect(trading.mode).toBe("demo");
  });

  it("reports a live account as live", async () => {
    const trading = new Mt5Trading(fakeTransport({ account: async () => ({ login: 1, trade_mode: 1, balance: 50, equity: 50, margin: 0, margin_free: 50 }) }));
    await trading.connect();
    expect(trading.mode).toBe("live");
  });

  it("splits the envelope into positions and orders", async () => {
    const trading = new Mt5Trading(
      fakeTransport({
        openPositions: async () => ({
          positions: [{ symbol: "XAUUSD", type: 0, volume: 0.1, price_open: 4000, price_current: 4100, profit: 100, sl: 0, tp: 0, time: 10 }],
          orders: [{ ticket: 5, symbol: "XAUUSD", type: 0, volume_initial: 1, price_open: 3900, state: 1, time_setup: 11 }],
        }),
      }),
    );
    const positions = await trading.getPositions();
    const orders = await trading.getOrders();
    expect(positions[0]).toMatchObject({ symbol: "XAUUSD", side: "long", unrealizedPnl: 100 });
    expect(orders[0]).toMatchObject({ id: "5", status: "pending", price: 3900 });
  });

  it("surfaces a transport failure as an account error", async () => {
    const trading = new Mt5Trading(
      fakeTransport({
        account: async () => {
          throw new Error("no bridge");
        },
      }),
    );
    await expect(trading.getAccount()).rejects.toThrow("no bridge");
    // Reads that back the panels stay safe.
    await expect(trading.getPositions()).resolves.toEqual([]);
    await expect(trading.getOrders()).resolves.toEqual([]);
    await expect(trading.getHistory()).resolves.toEqual([]);
  });

  it("places an order, closes and cancels through the transport", async () => {
    const transport = fakeTransport();
    const trading = new Mt5Trading(transport);
    const order = await trading.placeOrder({ symbol: "XAUUSD", side: "buy", type: "market", qty: 0.1 });
    expect(order).toMatchObject({ id: "42", symbol: "XAUUSD", status: "filled" });
    await trading.cancelOrder("5");
    expect(transport.cancel).toHaveBeenCalledWith("5");
    await trading.closePosition("XAUUSD", 0.1);
    expect(transport.close).toHaveBeenCalledWith("XAUUSD", 0.1);
    await trading.modifyOrder("5", { stopLoss: 3900 });
    expect(transport.modify).toHaveBeenCalledWith("5", 3900, undefined);
  });
});

describe("bridge transport", () => {
  it("builds REST calls with the mapped timeframe", async () => {
    const calls: { url: string; method: string }[] = [];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET" });
      return new Response(JSON.stringify({ rates: [] }), { status: 200 });
    });
    const transport = createTransport({ kind: "bridge", bridgeUrl: "http://127.0.0.1:8765/", fetchFn });
    await transport.history({ symbol: "XAUUSD", resolution: "1D", from: 1, to: 2 });
    await transport.placeOrder({ symbol: "XAUUSD", side: "buy", type: "limit", qty: 1, price: 4000 });
    expect(calls[0]?.url).toBe("http://127.0.0.1:8765/history?symbol=XAUUSD&tf=D1&from=1&to=2");
    expect(calls[1]?.url).toBe("http://127.0.0.1:8765/order");
    expect(calls[1]?.method).toBe("POST");
  });

  it("reads an unreachable bridge as offline rather than throwing", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const transport = createTransport({ kind: "bridge", fetchFn });
    await expect(transport.ping()).resolves.toBe(false);
  });

  it("propagates bridge error bodies for the trading panel", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ error: "rejected (10013): no money" }), { status: 409 }));
    const transport = createTransport({ kind: "bridge", fetchFn });
    await expect(transport.placeOrder({ symbol: "XAUUSD", side: "buy", type: "market", qty: 1 })).rejects.toThrow(/no money/);
  });

  it("mints a session on /connect and stamps every later write with it", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      bodies.push(url.endsWith("/connect") ? { url } : JSON.parse(String(init?.body)));
      const payload = url.endsWith("/connect")
        ? { ok: true, session: "abc123", login: "4123", server: "MetaQuotes-Demo", demo: true, balance: 10000 }
        : { ok: true };
      return new Response(JSON.stringify(payload), { status: 200 });
    });
    const transport = createTransport({ kind: "bridge", fetchFn });
    const result = await transport.connect?.({ server: "MetaQuotes-Demo", login: "4123", password: "hunter2" });
    expect(result?.session).toBe("abc123");
    await transport.placeOrder({ symbol: "EURUSD", side: "buy", type: "market", qty: 0.1 });
    expect(bodies[1]).toMatchObject({ session: "abc123" });
  });

  it("keeps dry-run off the wire unless asked, and on when asked", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ ok: true, dry_run: true }), { status: 200 });
    });
    const transport = createTransport({ kind: "bridge", fetchFn });
    await transport.close("EURUSD", 0.1);
    await transport.close("EURUSD", 0.1, { dryRun: true });
    expect(bodies[0]?.dry_run).toBeUndefined();
    expect(bodies[1]?.dry_run).toBe(true);
  });

  it("drops the session on /disconnect so later writes carry no stamp", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/cancel")) bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ ok: true, session: "s1" }), { status: 200 });
    });
    const transport = createTransport({ kind: "bridge", fetchFn });
    await transport.connect?.({ server: "S", login: "1", password: "p" });
    await transport.cancel("41");
    await transport.disconnect?.();
    await transport.cancel("42");
    expect(bodies[0]).toMatchObject({ ticket: "41", session: "s1" });
    expect(bodies[1]).toMatchObject({ ticket: "42" });
    expect(bodies[1]?.session).toBeUndefined();
  });

  it("MCP transport refuses dry-run rather than silently sending", () => {
    const fetchFn = vi.fn(async () => new Response("", { status: 500 }));
    const transport = createTransport({ kind: "mcp", mcp: { url: "http://127.0.0.1:22346/mcp", key: "k" }, fetchFn });
    expect(transport.connect).toBeUndefined();
    expect(() =>
      transport.placeOrder({ symbol: "EURUSD", side: "buy", type: "market", qty: 0.1 }, { dryRun: true }),
    ).toThrow(/cannot dry-run/);
  });
});

/** JSON-RPC test double: one canned handler map, one captured header log. */
function serve(handlers: Record<string, unknown>, status = 200) {
  const seen: { headers: Record<string, string> }[] = [];
  const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string; id?: number };
    seen.push({ headers });
    if (status !== 200) return new Response("", { status });
    const message = { jsonrpc: "2.0", id: body.id, result: handlers[body.method ?? ""] };
    return new Response(JSON.stringify(message), {
      status: 200,
      headers: { "content-type": "application/json", "mcp-session-id": "session-1" },
    });
  });
  return { fetchFn, seen };
}

describe("McpClient", () => {
  const KEY = "abc123";

  it("handshakes once, then rides the session header", async () => {
    const { fetchFn, seen } = serve({
      initialize: { protocolVersion: "2025-06-18" },
      "notifications/initialized": {},
      "tools/call": { content: [{ type: "text", text: JSON.stringify({ login: 7 }) }] },
    });
    const client = new McpClient({ url: "http://127.0.0.1:22346/mcp", key: KEY, fetchFn });
    const account = await client.call<{ login: number }>("get_trading_account_info");
    expect(account.login).toBe(7);
    expect(seen).toHaveLength(3);
    expect(seen[0]?.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(seen[0]?.headers["mcp-session-id"]).toBeUndefined();
    expect(seen[1]?.headers["mcp-session-id"]).toBe("session-1");
    expect(seen[2]?.headers["mcp-session-id"]).toBe("session-1");
    // Repeated calls must not re-handshake.
    await client.call("get_trading_account_info");
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it("explains a rejected key with a usable message", async () => {
    const { fetchFn } = serve({}, 401);
    const client = new McpClient({ url: "http://127.0.0.1:22346/mcp", key: "wrong", fetchFn });
    await expect(client.call("get_trading_account_info")).rejects.toBeInstanceOf(McpError);
    await expect(client.ping()).resolves.toBe(false);
  });

  it("raises tool-level failures as errors", async () => {
    const { fetchFn } = serve({
      initialize: {},
      "tools/call": { isError: true, content: [{ type: "text", text: "unknown symbol" }] },
    });
    const client = new McpClient({ url: "http://127.0.0.1:22346/mcp", key: KEY, fetchFn });
    await expect(client.call("get_chart_history")).rejects.toThrow("unknown symbol");
  });

  it("parses SSE frames as well as plain JSON", async () => {
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string; id?: number };
      if (body.method === "initialize") {
        return new Response('data: {"jsonrpc":"2.0","id":1,"result":{}}\n', {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      }
      return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ text: '{"rates":[]}' }] } })}\n`, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    });
    const client = new McpClient({ url: "http://127.0.0.1:22346/mcp", fetchFn });
    await expect(client.call("get_chart_history")).resolves.toEqual({ rates: [] });
  });
});

describe("createMt5", () => {
  it("wires one transport behind both adapter faces", () => {
    const adapter = createMt5({ kind: "bridge", bridgeUrl: "http://127.0.0.1:9999" });
    expect(adapter.data.id).toBe("mt5");
    expect(adapter.trading.id).toBe("mt5");
    expect(adapter.data).not.toBe(adapter.trading);
    expect(adapter.transport).toBeDefined();
  });
});
