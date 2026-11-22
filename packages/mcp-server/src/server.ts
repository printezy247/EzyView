import crypto from "node:crypto";
import { createRequire } from "node:module";
import { DemoMarketAdapter } from "@ezyview/data-adapters";
import type { MarketDataAdapter, Resolution } from "@ezyview/data-adapters";
import { createMt5, DEFAULT_BRIDGE_URL } from "@ezyview/mt5-adapter";
import {
  DemoCalendarAdapter,
  DemoFundamentalsAdapter,
  runScreener,
  scanUniverse,
} from "@ezyview/fundamentals";
import type { ScreenerField } from "@ezyview/fundamentals";
import { getIndicator, catalog } from "@ezyview/indicators";
import { composeReview, computeStats, dateKey, reviewWindow } from "@ezyview/journal";
import type { JournalEntry, JournalNote } from "@ezyview/journal";
import { buildChain, greeks, impliedVol, price } from "@ezyview/options";
import type { OptionRight } from "@ezyview/options";
import { loadSnapshot } from "./snapshot.js";

/** Protocol revision we speak; clients negotiate down to it. */
export const PROTOCOL_VERSION = "2025-06-18";
// Read the version from package.json so releases never drift from the binary.
const pkgVersion =
  (createRequire(import.meta.url)("../package.json") as { version?: string }).version ?? "0.0.0";
export const SERVER_INFO = { name: "ezyview", version: pkgVersion };

export interface RpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface RpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

type Args = Record<string, unknown>;

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(args: Args): Promise<unknown> | unknown;
}

const market = new DemoMarketAdapter();
const calendar = new DemoCalendarAdapter();
const fundamentals = new DemoFundamentalsAdapter();

/**
 * Market data resolution: the MT5 bridge when it is running, the bundled demo
 * feed otherwise. Probed at most once per minute so a dead bridge does not add
 * a timeout to every tool call, and a bridge that comes up later is picked up.
 */
let mt5: ReturnType<typeof createMt5> | null = null;
let mt5ProbeAt = 0;
let mt5Alive = false;
const MT5_PROBE_MS = 60_000;

async function marketAdapter(): Promise<MarketDataAdapter> {
  const now = Date.now();
  if (now - mt5ProbeAt > MT5_PROBE_MS) {
    mt5ProbeAt = now;
    try {
      mt5 ??= createMt5({
        kind: "bridge",
        bridgeUrl: process.env.EZYVIEW_MT5_BRIDGE_URL ?? DEFAULT_BRIDGE_URL,
        bridgeToken: process.env.EZYVIEW_MT5_BRIDGE_TOKEN,
      });
      mt5Alive = await mt5.data.ping();
    } catch {
      mt5Alive = false;
    }
  }
  return mt5Alive && mt5 ? mt5.data : market;
}

const str = (a: Args, key: string, maxLen = 256): string => {
  const v = a[key];
  if (typeof v !== "string" || v === "") throw new Error(`"${key}" must be a non-empty string`);
  if (v.length > maxLen) throw new Error(`"${key}" exceeds maximum length of ${maxLen}`);
  return v;
};
const num = (a: Args, key: string, fallback?: number): number => {
  const v = a[key];
  if (v === undefined && fallback !== undefined) return fallback;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`"${key}" must be a number`);
  return v;
};
const posNum = (a: Args, key: string, fallback?: number): number => {
  const v = num(a, key, fallback);
  if (v <= 0) throw new Error(`"${key}" must be positive`);
  return v;
};

const VALID_SCREENER_FIELDS = new Set<ScreenerField>([
  "price",
  "changePct",
  "volume",
  "fromHighPct",
  "rsi",
]);

/** Bar length per resolution, for history windows (mirrors the desktop's map). */
const RES_SECONDS: Record<string, number> = {
  "1t": 60,
  "1s": 1,
  "5s": 5,
  "15s": 15,
  "30s": 30,
  "1m": 60,
  "3m": 180,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "2h": 7200,
  "4h": 14400,
  "6h": 21600,
  "8h": 28800,
  "12h": 43200,
  "1D": 86400,
  "1W": 604800,
  "1M": 2592000,
};

function historyRequest(symbol: string, resolution: Resolution, limit: number) {
  const step = RES_SECONDS[resolution] ?? 3600;
  const to = Math.floor(Date.now() / step) * step;
  return { symbol, resolution, from: to - step * limit, to, limit };
}

/**
 * Private-data tools fail closed: a token is required unless the operator
 * explicitly opts out with EZYVIEW_MCP_INSECURE=1.
 */
function checkAuth(a: Args): void {
  const requiredToken = process.env.EZYVIEW_MCP_TOKEN;
  if (!requiredToken) {
    if (process.env.EZYVIEW_MCP_INSECURE === "1") return;
    throw new Error(
      "Unauthorized: set EZYVIEW_MCP_TOKEN (or EZYVIEW_MCP_INSECURE=1 to allow unauthenticated access)",
    );
  }
  if (typeof a.token !== "string") {
    throw new Error("Unauthorized: Invalid or missing EZYVIEW_MCP_TOKEN");
  }
  const tokenBuf = Buffer.from(a.token);
  const reqBuf = Buffer.from(requiredToken);
  if (tokenBuf.length !== reqBuf.length || !crypto.timingSafeEqual(tokenBuf, reqBuf)) {
    throw new Error("Unauthorized: Invalid or missing EZYVIEW_MCP_TOKEN");
  }
}

const object = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
});

const TOOLS: Tool[] = [
  {
    name: "list_symbols",
    description: "Search the symbol universe. Empty query lists everything.",
    inputSchema: object({ query: { type: "string" } }),
    run: async (a) =>
      (await marketAdapter()).searchSymbols(typeof a.query === "string" ? a.query : ""),
  },
  {
    name: "get_quote",
    description:
      "Latest quote (last price, change, bid/ask) for a symbol from the active feed — MT5 bridge when running, else demo.",
    inputSchema: object({ symbol: { type: "string" } }, ["symbol"]),
    run: async (a) => {
      const quote = await (await marketAdapter()).getQuote(str(a, "symbol"));
      if (!quote) throw new Error(`no quote for "${String(a.symbol)}"`);
      return quote;
    },
  },
  {
    name: "get_candles",
    description:
      "OHLCV candles for a symbol (most recent last). Uses the MT5 bridge when it is running, else the demo feed — check which via the quote's source or ask the user.",
    inputSchema: object(
      {
        symbol: { type: "string" },
        resolution: { type: "string", description: "1m 5m 15m 1h 4h 1D 1W" },
        limit: { type: "number" },
      },
      ["symbol"],
    ),
    run: async (a) => {
      const limit = Math.min(Math.max(1, Math.floor(num(a, "limit", 100))), 1000);
      const resolution = (typeof a.resolution === "string" ? a.resolution : "1D") as Resolution;
      return (await marketAdapter()).getHistory(
        historyRequest(str(a, "symbol"), resolution, limit),
      );
    },
  },
  {
    name: "feed_status",
    description:
      "Which market-data feed tools are using right now: the MT5 bridge when it answers, else the bundled demo feed.",
    inputSchema: object({}),
    run: async () => ({ feed: (await marketAdapter()).id === "mt5" ? "mt5" : "demo" }),
  },
  {
    name: "list_indicators",
    description: "Every indicator EzyView ships, with parameters.",
    inputSchema: object({}),
    run: () =>
      catalog().map((d) => ({ id: d.id, name: d.name, family: d.family, params: d.params })),
  },
  {
    name: "run_indicator",
    description:
      "Compute an indicator over recent candles. Returns the last `tail` values per plot.",
    inputSchema: object(
      {
        symbol: { type: "string" },
        indicator: { type: "string" },
        resolution: { type: "string" },
        params: { type: "object" },
        tail: { type: "number" },
      },
      ["symbol", "indicator"],
    ),
    run: async (a) => {
      const def = getIndicator(str(a, "indicator"));
      if (!def) throw new Error(`unknown indicator "${String(a.indicator)}"`);
      const adapter = await marketAdapter();
      const candles = await adapter.getHistory(
        historyRequest(
          str(a, "symbol"),
          (typeof a.resolution === "string" ? a.resolution : "1D") as Resolution,
          500,
        ),
      );
      if (candles.length === 0) throw new Error(`no data for "${String(a.symbol)}"`);
      const defaults = Object.fromEntries(def.params.map((p) => [p.id, p.default]));
      const given = (a.params && typeof a.params === "object" ? a.params : {}) as Record<
        string,
        number | boolean | string
      >;
      const result = def.compute(
        {
          open: candles.map((c) => c.open),
          high: candles.map((c) => c.high),
          low: candles.map((c) => c.low),
          close: candles.map((c) => c.close),
          volume: candles.map((c) => c.volume),
        },
        { ...defaults, ...given },
      );
      const tail = Math.min(Math.max(1, Math.floor(num(a, "tail", 20))), 500);
      const slice = <T>(xs: T[]): T[] => xs.slice(-tail);
      return {
        id: result.id,
        name: result.name,
        times: slice(candles.map((c) => c.time)),
        values: slice(result.values),
        plots: Object.fromEntries(
          Object.entries(result.plots ?? {}).map(([k, v]) => [k, slice(v)]),
        ),
      };
    },
  },
  {
    name: "price_option",
    description:
      "Black-Scholes price and greeks for a European option; optionally the implied vol of a market price.",
    inputSchema: object(
      {
        right: { type: "string", enum: ["call", "put"] },
        spot: { type: "number" },
        strike: { type: "number" },
        days: { type: "number", description: "days to expiry" },
        vol: { type: "number", description: "annual vol as a fraction, e.g. 0.25" },
        rate: { type: "number" },
        marketPrice: { type: "number", description: "if set, also solve implied vol" },
      },
      ["right", "spot", "strike", "days", "vol"],
    ),
    run: (a) => {
      const right = str(a, "right") as OptionRight;
      if (right !== "call" && right !== "put") throw new Error('"right" must be "call" or "put"');
      const spot = posNum(a, "spot");
      const strike = posNum(a, "strike");
      const days = posNum(a, "days");
      const vol = posNum(a, "vol");
      const rate = num(a, "rate", 0.04);
      if (Math.abs(rate) > 5) throw new Error('"rate" out of range');
      const base = { right, spot, strike, years: days / 365, rate };
      const input = { ...base, vol };
      const out: Record<string, unknown> = { price: price(input), greeks: greeks(input) };
      if (a.marketPrice !== undefined) out.impliedVol = impliedVol(base, posNum(a, "marketPrice"));
      return out;
    },
  },
  {
    name: "option_chain",
    description:
      "Model-built option chain (Black-Scholes off a volatility smile) around a spot price.",
    inputSchema: object(
      { spot: { type: "number" }, baseVol: { type: "number" }, days: { type: "number" } },
      ["spot"],
    ),
    run: (a) =>
      buildChain({
        spot: posNum(a, "spot"),
        baseVol: posNum(a, "baseVol", 0.3),
        expiries: [posNum(a, "days", 30)],
      }),
  },
  {
    name: "screen",
    description:
      "Screen the symbol universe by price, change %, volume, distance from high or RSI.",
    inputSchema: object({
      field: { type: "string", enum: ["price", "changePct", "volume", "fromHighPct", "rsi"] },
      min: { type: "number" },
      max: { type: "number" },
      sortBy: { type: "string" },
      descending: { type: "boolean" },
    }),
    run: async (a) => {
      const rows = await scanUniverse(await marketAdapter());
      let field: ScreenerField | undefined;
      if (a.field !== undefined) {
        if (typeof a.field !== "string" || !VALID_SCREENER_FIELDS.has(a.field as ScreenerField)) {
          throw new Error(`"field" must be one of: ${[...VALID_SCREENER_FIELDS].join(", ")}`);
        }
        field = a.field as ScreenerField;
      }
      const sortByRaw = typeof a.sortBy === "string" ? a.sortBy : "changePct";
      if (!VALID_SCREENER_FIELDS.has(sortByRaw as ScreenerField)) {
        throw new Error(`"sortBy" must be one of: ${[...VALID_SCREENER_FIELDS].join(", ")}`);
      }
      return runScreener(rows, {
        filters: field
          ? [
              {
                field,
                min: typeof a.min === "number" ? a.min : undefined,
                max: typeof a.max === "number" ? a.max : undefined,
              },
            ]
          : [],
        sortBy: sortByRaw as ScreenerField,
        descending: a.descending !== false,
      });
    },
  },
  {
    name: "economic_calendar",
    description: "Economic events in the next N days (default 7).",
    inputSchema: object({
      days: { type: "number" },
      currency: { type: "string" },
      impact: { type: "string" },
    }),
    run: (a) => {
      const days = Math.min(Math.max(1, num(a, "days", 7)), 365);
      const now = Math.floor(Date.now() / 1000);
      return calendar.getCalendar(now, now + days * 86400, {
        currency: typeof a.currency === "string" ? a.currency.slice(0, 16) : undefined,
        impact:
          a.impact === "high" || a.impact === "medium" || a.impact === "low" ? a.impact : undefined,
      });
    },
  },
  {
    name: "earnings",
    description: "Quarterly earnings history/estimates and key ratios for a symbol.",
    inputSchema: object({ symbol: { type: "string" } }, ["symbol"]),
    run: async (a) => {
      const symbol = str(a, "symbol");
      return {
        earnings: await fundamentals.getEarnings(symbol),
        profile: await fundamentals.getProfile(symbol),
      };
    },
  },
  {
    name: "get_workspace",
    description:
      "The user's EzyView layouts: each chart's symbol, interval, chart type, indicator ids and drawings. Read from the desktop app's workspace snapshot.",
    inputSchema: object({
      token: { type: "string", description: "Auth token required if EZYVIEW_MCP_TOKEN is set" },
    }),
    run: async (a) => {
      checkAuth(a);
      const snap = await loadSnapshot();
      const ageSeconds = Math.max(0, Math.floor(Date.now() / 1000) - snap.updatedAt);
      return { updatedAt: snap.updatedAt, ageSeconds, layouts: snap.layouts };
    },
  },
  {
    name: "list_alerts",
    description:
      "The user's price alerts (condition, state, symbol) and watchlist, from the desktop app's snapshot.",
    inputSchema: object({ symbol: { type: "string" }, token: { type: "string" } }),
    run: async (a) => {
      checkAuth(a);
      const snap = await loadSnapshot();
      const symbol = typeof a.symbol === "string" && a.symbol !== "" ? a.symbol : null;
      const matches = (row: unknown) =>
        typeof row === "object" &&
        row !== null &&
        (symbol === null || (row as { symbol?: string }).symbol === symbol);
      return { alerts: snap.alerts.filter(matches), watchlist: snap.watchlist.filter(matches) };
    },
  },
  {
    name: "get_journal",
    description:
      "Trading journal entries and notes with aggregate stats (win rate, net P&L, expectancy). Optional symbol filter and limit (newest first).",
    inputSchema: object({
      symbol: { type: "string" },
      limit: { type: "number" },
      token: { type: "string" },
    }),
    run: async (a) => {
      checkAuth(a);
      const snap = await loadSnapshot();
      const symbol = typeof a.symbol === "string" && a.symbol !== "" ? a.symbol : null;
      const limit = Math.min(1000, Math.max(0, Math.floor(num(a, "limit", 50))));
      const entries = (snap.journal.entries as JournalEntry[])
        .filter((e) => typeof e === "object" && e !== null && typeof e.entryTime === "number")
        .filter((e) => symbol === null || e.symbol === symbol)
        .sort((x, y) => y.entryTime - x.entryTime);
      const notes = ((snap.journal.notes ?? []) as JournalNote[])
        .filter((n) => typeof n === "object" && n !== null)
        .filter((n) => symbol === null || !n.symbol || n.symbol === symbol);
      return {
        stats: computeStats(entries),
        entries: entries.slice(0, limit),
        notes: notes.slice(0, limit),
      };
    },
  },
  {
    name: "journal_review_pack",
    description:
      "Everything needed to write a daily or weekly trading review: the app's deterministic summary, stats, trades and notes for the window containing the given date (YYYY-MM-DD, default today). Write the narrative yourself from this data.",
    inputSchema: object({
      period: { type: "string", enum: ["daily", "weekly"] },
      date: { type: "string" },
      token: { type: "string" },
    }),
    run: async (a) => {
      checkAuth(a);
      const snap = await loadSnapshot();
      const period = a.period === "weekly" ? "weekly" : "daily";
      const key =
        typeof a.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.date)
          ? a.date
          : dateKey(Date.now() / 1000);
      const { start, end } = reviewWindow(key, period);
      const safeEntries = (snap.journal.entries as JournalEntry[]).filter(
        (e): e is JournalEntry =>
          typeof e === "object" && e !== null && typeof e.entryTime === "number",
      );
      const safeNotes = (snap.journal.notes as JournalNote[]).filter(
        (n): n is JournalNote => typeof n === "object" && n !== null && typeof n.time === "number",
      );
      const entries = safeEntries.filter((e) => e.entryTime >= start && e.entryTime < end);
      const notes = safeNotes.filter((n) => n.time >= start && n.time < end);
      return {
        period,
        date: key,
        summary: composeReview(safeEntries, safeNotes, start, end),
        stats: computeStats(entries),
        entries,
        notes,
      };
    },
  },
];

const ok = (id: RpcResponse["id"], result: unknown): RpcResponse => ({
  jsonrpc: "2.0",
  id,
  result,
});
const fail = (id: RpcResponse["id"], code: number, message: string): RpcResponse => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});

/**
 * Handle one JSON-RPC message. Returns null for notifications (no reply).
 * Tool failures are reported in-band (`isError`) so the model can read and recover.
 */
export async function handleMessage(rawMsg: unknown): Promise<RpcResponse | null> {
  if (typeof rawMsg !== "object" || rawMsg === null || Array.isArray(rawMsg)) {
    return fail(null, -32600, "Invalid Request: expected JSON-RPC object");
  }
  const msg = rawMsg as Partial<RpcRequest>;
  const id =
    typeof msg.id === "number" || typeof msg.id === "string" || msg.id === null ? msg.id : null;
  const isNotification = msg.id === undefined;

  if (typeof msg.method !== "string" || msg.method === "") {
    return fail(id, -32600, "Invalid Request: missing or non-string method");
  }

  switch (msg.method) {
    case "initialize":
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, {
        tools: TOOLS.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      });
    case "tools/call": {
      const params = typeof msg.params === "object" && msg.params !== null ? msg.params : {};
      const name = params.name;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return fail(id, -32602, `Unknown tool: ${String(name)}`);
      try {
        const rawArgs = params.arguments;
        const args =
          typeof rawArgs === "object" && rawArgs !== null && !Array.isArray(rawArgs)
            ? (rawArgs as Args)
            : {};
        const out = await tool.run(args);
        return ok(id, { content: [{ type: "text", text: JSON.stringify(out) }] });
      } catch (error) {
        return ok(id, {
          isError: true,
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        });
      }
    }
    default:
      if (isNotification) return null;
      return fail(id, -32601, `Method not found: ${msg.method}`);
  }
}
