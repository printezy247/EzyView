import { DemoMarketAdapter } from "@ezyview/data-adapters";
import type { Resolution } from "@ezyview/data-adapters";
import { DemoCalendarAdapter, DemoFundamentalsAdapter, runScreener, scanUniverse } from "@ezyview/fundamentals";
import type { ScreenerField } from "@ezyview/fundamentals";
import { getIndicator, catalog } from "@ezyview/indicators";
import { composeReview, computeStats, dateKey, reviewWindow } from "@ezyview/journal";
import type { JournalEntry, JournalNote } from "@ezyview/journal";
import { buildChain, greeks, impliedVol, price } from "@ezyview/options";
import type { OptionRight } from "@ezyview/options";
import { loadSnapshot } from "./snapshot.js";

/** Protocol revision we speak; clients negotiate down to it. */
export const PROTOCOL_VERSION = "2025-06-18";
export const SERVER_INFO = { name: "ezyview", version: "0.1.0" };

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

const str = (a: Args, key: string): string => {
  const v = a[key];
  if (typeof v !== "string" || v === "") throw new Error(`"${key}" must be a non-empty string`);
  return v;
};
const num = (a: Args, key: string, fallback?: number): number => {
  const v = a[key];
  if (v === undefined && fallback !== undefined) return fallback;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`"${key}" must be a number`);
  return v;
};

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
    run: async (a) => market.searchSymbols(typeof a.query === "string" ? a.query : ""),
  },
  {
    name: "get_candles",
    description: "OHLCV candles for a symbol (most recent last).",
    inputSchema: object(
      { symbol: { type: "string" }, resolution: { type: "string", description: "1m 5m 15m 1h 4h 1D 1W" }, limit: { type: "number" } },
      ["symbol"],
    ),
    run: async (a) => {
      const limit = Math.min(Math.max(1, Math.floor(num(a, "limit", 100))), 1000);
      return market.getHistory({
        symbol: str(a, "symbol"),
        resolution: (typeof a.resolution === "string" ? a.resolution : "1D") as Resolution,
        from: 0,
        to: 0,
        limit,
      });
    },
  },
  {
    name: "list_indicators",
    description: "Every indicator EzyView ships, with parameters.",
    inputSchema: object({}),
    run: () => catalog().map((d) => ({ id: d.id, name: d.name, family: d.family, params: d.params })),
  },
  {
    name: "run_indicator",
    description: "Compute an indicator over recent candles. Returns the last `tail` values per plot.",
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
      const candles = await market.getHistory({
        symbol: str(a, "symbol"),
        resolution: (typeof a.resolution === "string" ? a.resolution : "1D") as Resolution,
        from: 0,
        to: 0,
        limit: 500,
      });
      if (candles.length === 0) throw new Error(`no data for "${String(a.symbol)}"`);
      const defaults = Object.fromEntries(def.params.map((p) => [p.id, p.default]));
      const given = (a.params && typeof a.params === "object" ? a.params : {}) as Record<string, number | boolean | string>;
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
        plots: Object.fromEntries(Object.entries(result.plots ?? {}).map(([k, v]) => [k, slice(v)])),
      };
    },
  },
  {
    name: "price_option",
    description: "Black-Scholes price and greeks for a European option; optionally the implied vol of a market price.",
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
      const base = { right, spot: num(a, "spot"), strike: num(a, "strike"), years: num(a, "days") / 365, rate: num(a, "rate", 0.04) };
      const input = { ...base, vol: num(a, "vol") };
      const out: Record<string, unknown> = { price: price(input), greeks: greeks(input) };
      if (a.marketPrice !== undefined) out.impliedVol = impliedVol(base, num(a, "marketPrice"));
      return out;
    },
  },
  {
    name: "option_chain",
    description: "Model-built option chain (Black-Scholes off a volatility smile) around a spot price.",
    inputSchema: object({ spot: { type: "number" }, baseVol: { type: "number" }, days: { type: "number" } }, ["spot"]),
    run: (a) => buildChain({ spot: num(a, "spot"), baseVol: num(a, "baseVol", 0.3), expiries: [num(a, "days", 30)] }),
  },
  {
    name: "screen",
    description: "Screen the symbol universe by price, change %, volume, distance from high or RSI.",
    inputSchema: object({
      field: { type: "string", enum: ["price", "changePct", "volume", "fromHighPct", "rsi"] },
      min: { type: "number" },
      max: { type: "number" },
      sortBy: { type: "string" },
      descending: { type: "boolean" },
    }),
    run: async (a) => {
      const rows = await scanUniverse(market);
      const field = a.field as ScreenerField | undefined;
      return runScreener(rows, {
        filters: field ? [{ field, min: typeof a.min === "number" ? a.min : undefined, max: typeof a.max === "number" ? a.max : undefined }] : [],
        sortBy: (typeof a.sortBy === "string" ? a.sortBy : "changePct") as ScreenerField,
        descending: a.descending !== false,
      });
    },
  },
  {
    name: "economic_calendar",
    description: "Economic events in the next N days (default 7).",
    inputSchema: object({ days: { type: "number" }, currency: { type: "string" }, impact: { type: "string" } }),
    run: (a) => {
      const now = Math.floor(Date.now() / 1000);
      return calendar.getCalendar(now, now + num(a, "days", 7) * 86400, {
        currency: typeof a.currency === "string" ? a.currency : undefined,
        impact: typeof a.impact === "string" ? (a.impact as "high" | "medium" | "low") : undefined,
      });
    },
  },
  {
    name: "earnings",
    description: "Quarterly earnings history/estimates and key ratios for a symbol.",
    inputSchema: object({ symbol: { type: "string" } }, ["symbol"]),
    run: async (a) => {
      const symbol = str(a, "symbol");
      return { earnings: await fundamentals.getEarnings(symbol), profile: await fundamentals.getProfile(symbol) };
    },
  },
  {
    name: "get_workspace",
    description:
      "The user's EzyView layouts: each chart's symbol, interval, chart type, indicator ids and drawings. Read from the desktop app's workspace snapshot.",
    inputSchema: object({}),
    run: async () => {
      const snap = await loadSnapshot();
      return { updatedAt: snap.updatedAt, layouts: snap.layouts };
    },
  },
  {
    name: "list_alerts",
    description: "The user's price alerts (condition, state, symbol) and watchlist, from the desktop app's snapshot.",
    inputSchema: object({ symbol: { type: "string" } }),
    run: async (a) => {
      const snap = await loadSnapshot();
      const symbol = typeof a.symbol === "string" && a.symbol !== "" ? a.symbol : null;
      const matches = (row: unknown) =>
        typeof row === "object" && row !== null && (symbol === null || (row as { symbol?: string }).symbol === symbol);
      return { alerts: snap.alerts.filter(matches), watchlist: snap.watchlist.filter(matches) };
    },
  },
  {
    name: "get_journal",
    description:
      "Trading journal entries and notes with aggregate stats (win rate, net P&L, expectancy). Optional symbol filter and limit (newest first).",
    inputSchema: object({ symbol: { type: "string" }, limit: { type: "number" } }),
    run: async (a) => {
      const snap = await loadSnapshot();
      const symbol = typeof a.symbol === "string" && a.symbol !== "" ? a.symbol : null;
      const limit = Math.min(1000, Math.max(0, Math.floor(num(a, "limit", 50))));
      const entries = (snap.journal.entries as JournalEntry[])
        .filter((e) => typeof e === "object" && e !== null && typeof e.entryTime === "number")
        .filter((e) => symbol === null || e.symbol === symbol)
        .toSorted((x, y) => y.entryTime - x.entryTime);
      return { stats: computeStats(entries), entries: entries.slice(0, limit), notes: snap.journal.notes.slice(0, limit) };
    },
  },
  {
    name: "journal_review_pack",
    description:
      "Everything needed to write a daily or weekly trading review: the app's deterministic summary, stats, trades and notes for the window containing the given date (YYYY-MM-DD, default today). Write the narrative yourself from this data.",
    inputSchema: object({ period: { type: "string", enum: ["daily", "weekly"] }, date: { type: "string" } }),
    run: async (a) => {
      const snap = await loadSnapshot();
      const period = a.period === "weekly" ? "weekly" : "daily";
      const key = typeof a.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.date) ? a.date : dateKey(Date.now() / 1000);
      const { start, end } = reviewWindow(key, period);
      const entries = (snap.journal.entries as JournalEntry[]).filter((e) => e.entryTime >= start && e.entryTime < end);
      const notes = (snap.journal.notes as JournalNote[]).filter((n) => n.time >= start && n.time < end);
      return {
        period,
        date: key,
        summary: composeReview(snap.journal.entries as JournalEntry[], snap.journal.notes as JournalNote[], start, end),
        stats: computeStats(entries),
        entries,
        notes,
      };
    },
  },
];

const ok = (id: RpcResponse["id"], result: unknown): RpcResponse => ({ jsonrpc: "2.0", id, result });
const fail = (id: RpcResponse["id"], code: number, message: string): RpcResponse => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});

/**
 * Handle one JSON-RPC message. Returns null for notifications (no reply).
 * Tool failures are reported in-band (`isError`) so the model can read and recover.
 */
export async function handleMessage(msg: RpcRequest): Promise<RpcResponse | null> {
  const id = msg.id ?? null;
  const isNotification = msg.id === undefined;

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
      return ok(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const name = msg.params?.name;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return fail(id, -32602, `Unknown tool: ${String(name)}`);
      try {
        const out = await tool.run((msg.params?.arguments ?? {}) as Args);
        return ok(id, { content: [{ type: "text", text: JSON.stringify(out) }] });
      } catch (error) {
        return ok(id, { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }] });
      }
    }
    default:
      if (isNotification) return null;
      return fail(id, -32601, `Method not found: ${msg.method}`);
  }
}
