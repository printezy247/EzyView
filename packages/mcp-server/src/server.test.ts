import { describe, expect, it } from "vitest";
import { handleMessage, PROTOCOL_VERSION } from "./server.js";

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const res = await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  const result = res!.result as { isError?: boolean; content: { text: string }[] };
  const text = result.content[0]!.text;
  return { isError: result.isError === true, data: result.isError ? text : JSON.parse(text) };
};

describe("mcp server protocol", () => {
  it("answers initialize and lists tools", async () => {
    const init = await handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize" });
    expect((init!.result as { protocolVersion: string }).protocolVersion).toBe(PROTOCOL_VERSION);
    const list = await handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const names = (list!.result as { tools: { name: string }[] }).tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["get_candles", "run_indicator", "price_option", "screen", "earnings"]));
  });

  it("stays silent on notifications and rejects unknown methods", async () => {
    expect(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    const res = await handleMessage({ jsonrpc: "2.0", id: 3, method: "nope" });
    expect(res!.error!.code).toBe(-32601);
    const bad = await handleMessage({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nope" } });
    expect(bad!.error!.code).toBe(-32602);
  });

  it("rejects non-object or malformed JSON-RPC envelopes with -32600", async () => {
    const cases = [null, 42, "hello", [1, 2], {}, { jsonrpc: "2.0", id: 1, method: "" }];
    const results = await Promise.all(cases.map((invalid) => handleMessage(invalid)));
    for (const res of results) {
      expect(res?.error?.code).toBe(-32600);
    }
  });
});

describe("mcp server tools", () => {
  it("returns candles and indicator values", async () => {
    const candles = await call("get_candles", { symbol: "BINANCE:BTCUSDT", limit: 30 });
    expect(candles.data.length).toBeGreaterThan(0);
    expect(candles.data.length).toBeLessThanOrEqual(30);
    const rsi = await call("run_indicator", { symbol: "BINANCE:BTCUSDT", indicator: "rsi", tail: 5 });
    expect(rsi.isError).toBe(false);
    expect(rsi.data.values).toHaveLength(5);
  });

  it("prices options and solves implied vol", async () => {
    const out = await call("price_option", { right: "call", spot: 100, strike: 100, days: 365, vol: 0.2, rate: 0.05, marketPrice: 10.4506 });
    expect(out.data.price).toBeCloseTo(10.4506, 3);
    expect(out.data.impliedVol).toBeCloseTo(0.2, 3);
  });

  it("reports tool errors in-band instead of throwing", async () => {
    const bad = await call("get_candles", {});
    expect(bad.isError).toBe(true);
    expect(bad.data).toContain("symbol");
    expect((await call("run_indicator", { symbol: "BINANCE:BTCUSDT", indicator: "zzz" })).isError).toBe(true);
  });

  it("screens, and serves calendar and earnings", async () => {
    const screened = await call("screen", { field: "rsi", min: 0, max: 100 });
    expect(Array.isArray(screened.data)).toBe(true);
    expect((await call("screen", { field: "not_a_field" })).isError).toBe(true);
    expect((await call("price_option", { right: "call", spot: -10, strike: 100, days: 30, vol: 0.2 })).isError).toBe(true);
    expect((await call("economic_calendar", { days: 3 })).isError).toBe(false);
    const e = await call("earnings", { symbol: "NASDAQ:AAPL" });
    expect(e.data.earnings.length).toBeGreaterThan(0);
  });

  it("enforces authentication on workspace inspection when EZYVIEW_MCP_TOKEN is configured", async () => {
    process.env.EZYVIEW_MCP_TOKEN = "secret123";
    try {
      // Unauthorized call fails with error
      const unauth = await call("get_workspace", {});
      expect(unauth.isError).toBe(true);
      expect(unauth.data).toContain("Unauthorized");

      // Valid token succeeds
      const auth = await call("get_workspace", { token: "secret123" });
      expect(auth.isError).toBe(false);
    } finally {
      delete process.env.EZYVIEW_MCP_TOKEN;
    }
  });

  it("fails closed on private tools when no token is configured, unless INSECURE=1", async () => {
    delete process.env.EZYVIEW_MCP_TOKEN;
    delete process.env.EZYVIEW_MCP_INSECURE;
    const tools = ["get_workspace", "get_journal", "list_alerts", "journal_review_pack"];
    const results = await Promise.all(tools.map((t) => call(t, {})));
    for (const res of results) {
      expect(res.isError).toBe(true);
      expect(res.data).toContain("Unauthorized");
    }
    process.env.EZYVIEW_MCP_INSECURE = "1";
    try {
      expect((await call("get_workspace", {})).isError).toBe(false);
    } finally {
      delete process.env.EZYVIEW_MCP_INSECURE;
    }
  });
});
