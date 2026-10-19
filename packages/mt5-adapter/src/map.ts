/**
 * MT5 → EzyView shape mapping.
 *
 * Pure functions over whatever JSON the terminal returns, so every quirk of
 * MT5's naming (snake_case named tuples, numeric enums, bid/ask last prices)
 * is settled here in one place and covered by tests.
 */
import type {
  AccountInfo,
  Candle,
  Deal,
  Order,
  OrderRequest,
  Position,
  Quote,
  Resolution,
  SymbolInfo,
} from "@ezyview/data-adapters";

/** Terminal MCP tool names, per MetaQuotes' published capability list. */
export const MT5_TOOLS = {
  account: "get_trading_account_info",
  openPositions: "get_trading_open_positions",
  historyOrders: "get_trading_history_orders",
  historyPositions: "get_trading_history_positions",
  marketWatch: "get_marketwatch_symbols",
  symbolSearch: "marketdata_symbol_search",
  chartHistory: "get_chart_history",
  ticksHistory: "get_chart_ticks_history",
  marketOrder: "trade_send_market_order",
  pendingOrder: "trade_send_pending_order",
  modifySlTp: "trade_modify_sl_tp",
  closePosition: "trade_close_single_position",
  deleteOrder: "trade_delete_order",
} as const;

/**
 * Resolution → MT5 timeframe.
 *
 * Seconds-based intervals are not part of the terminal's documented history
 * window, so they fall back to their nearest supported frame rather than
 * failing the request.
 */
const TIMEFRAMES: Record<Resolution, string> = {
  "1t": "M1",
  "1s": "M1",
  "5s": "M5",
  "15s": "M15",
  "30s": "M30",
  "1m": "M1",
  "3m": "M3",
  "5m": "M5",
  "15m": "M15",
  "30m": "M30",
  "1h": "H1",
  "2h": "H2",
  "4h": "H4",
  "6h": "H6",
  "8h": "H8",
  "12h": "H12",
  "1D": "D1",
  "1W": "W1",
  "1M": "MN1",
};

export function toTimeframe(resolution: Resolution): string {
  return TIMEFRAMES[resolution] ?? "M1";
}

// ---------------------------------------------------------------------------
// Narrowing helpers
// ---------------------------------------------------------------------------

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * First present key among the candidates.
 *
 * MT5 payloads arrive as named tuples (snake_case) or already camel-cased,
 * depending on which tool answered.
 */
function pick(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function num(record: Record<string, unknown>, ...keys: string[]): number | null {
  const value = pick(record, ...keys);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function text(record: Record<string, unknown>, ...keys: string[]): string | null {
  const value = pick(record, ...keys);
  if (typeof value === "string" && value !== "") return value;
  if (typeof value === "number") return String(value);
  return null;
}

/** Payload lists hide behind a few different envelope keys. */
function listOf(payload: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (!record) return [];
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Market data
// ---------------------------------------------------------------------------

export function toCandles(payload: unknown, limit?: number): Candle[] {
  const rows = listOf(payload, "rates", "candles", "bars", "data", "history");
  const candles: Candle[] = [];
  for (const row of rows) {
    const rate = asRecord(row);
    if (!rate) continue;
    const time = num(rate, "time", "timestamp", "t");
    const open = num(rate, "open", "o");
    const high = num(rate, "high", "h");
    const low = num(rate, "low", "l");
    const close = num(rate, "close", "c");
    if (time === null || open === null || high === null || low === null || close === null) continue;
    candles.push({
      time,
      open,
      high,
      low,
      close,
      volume: num(rate, "tick_volume", "tickVolume", "volume", "v") ?? 0,
    });
  }
  candles.sort((a, b) => a.time - b.time);
  return limit !== undefined ? candles.slice(-limit) : candles;
}

export function toSymbols(payload: unknown): SymbolInfo[] {
  const rows = listOf(payload, "symbols", "data", "results");
  const symbols: SymbolInfo[] = [];
  for (const row of rows) {
    const rec = asRecord(row);
    if (!rec) continue;
    const symbol = text(rec, "symbol", "name", "ticker");
    if (!symbol) continue;
    const digits = num(rec, "digits", "precision") ?? 2;
    const point = num(rec, "point", "tick_size", "tickSize") ?? 0;
    symbols.push({
      symbol,
      ticker: text(rec, "ticker", "short") ?? symbol,
      description: text(rec, "description", "name", "title") ?? symbol,
      provider: text(rec, "provider", "source") ?? "mt5",
      assetClass: inferAssetClass(symbol),
      precision: digits,
      tickSize: point > 0 ? point : 10 ** -digits,
      currency: text(rec, "currency", "currency_base") ?? undefined,
      // Trade mode 0 is the broker's "disabled" flag; anything else can trade.
      tradable: num(rec, "trade_mode", "tradeMode") !== 0,
    });
  }
  return symbols;
}

/** Broker symbols carry no asset class, so guess from the ticker itself. */
export function inferAssetClass(symbol: string): SymbolInfo["assetClass"] {
  const s = symbol.toUpperCase();
  if (s.endsWith("USD") && s.length <= 8 && !/[0-9]/.test(s)) return "forex";
  if (/^(BTC|ETH|XRP|LTC|SOL|ADA|DOGE)/.test(s)) return "crypto";
  if (/^(XAU|XAG|XPT|XPD)/.test(s)) return "forex";
  if (/US500|SPX|NAS100|USTEC|US30|DJ30|GER40|UK100/.test(s)) return "index";
  return "stock";
}

export function toQuote(payload: unknown, symbol: string): Quote | null {
  const tick = asRecord(payload) ?? {};
  // A bare tick, or the symbol entry from Market Watch.
  const nested = asRecord(pick(tick, "tick", "quote", "data")) ?? tick;
  const bid = num(nested, "bid");
  const ask = num(nested, "ask");
  const time = num(nested, "time", "timestamp", "time_msc") ?? Math.floor(Date.now() / 1000);
  const last = num(nested, "last", "close") ?? (bid !== null && ask !== null ? (bid + ask) / 2 : bid ?? ask);
  if (last === null) return null;
  const previous = num(nested, "prev_close", "previousClose");
  const quote: Quote = {
    symbol,
    last,
    time: time > 1e12 ? Math.floor(time / 1000) : time,
  };
  if (bid !== null) quote.bid = bid;
  if (ask !== null) quote.ask = ask;
  if (previous !== null && previous !== 0) {
    quote.change = last - previous;
    quote.changePercent = ((last - previous) / previous) * 100;
  }
  return quote;
}

// ---------------------------------------------------------------------------
// Account, positions, orders, deals
// ---------------------------------------------------------------------------

export function toAccount(payload: unknown): AccountInfo | null {
  const rec = asRecord(payload) ?? asRecord(asRecord(payload)?.account);
  if (!rec) return null;
  const mode = num(rec, "trade_mode", "tradeMode");
  const login = text(rec, "login", "account", "id");
  const balance = num(rec, "balance") ?? 0;
  const account: AccountInfo = {
    id: login ?? "mt5",
    provider: "mt5",
    currency: text(rec, "currency") ?? "USD",
    balance,
    equity: num(rec, "equity") ?? balance,
    margin: num(rec, "margin") ?? 0,
    freeMargin: num(rec, "free_margin", "margin_free", "free") ?? 0,
  };
  const leverage = num(rec, "leverage");
  if (leverage !== null && leverage > 0) account.leverage = 1 / leverage;
  if (mode !== null) account.tradeMode = mode === 0 ? "demo" : "real";
  const name = text(rec, "name", "owner");
  if (name) account.name = name;
  return account;
}

export function toPositions(payload: unknown): Position[] {
  return listOf(payload, "positions", "data")
    .map((row) => {
      const rec = asRecord(row);
      if (!rec) return null;
      const symbol = text(rec, "symbol");
      if (!symbol) return null;
      const type = num(rec, "type", "side") ?? 0;
      const entryPrice = num(rec, "price_open", "priceOpen") ?? 0;
      const markPrice = num(rec, "price_current", "priceCurrent", "price") ?? entryPrice;
      const position: Position = {
        symbol,
        side: type === 1 ? "short" : "long",
        qty: num(rec, "volume") ?? 0,
        entryPrice,
        markPrice,
        unrealizedPnl: num(rec, "profit", "pnl") ?? 0,
        time: normaliseTime(num(rec, "time", "time_msc")),
      };
      const sl = num(rec, "sl", "stopLoss");
      const tp = num(rec, "tp", "takeProfit");
      if (sl !== null && sl > 0) position.stopLoss = sl;
      if (tp !== null && tp > 0) position.takeProfit = tp;
      return position;
    })
    .filter((p): p is Position => p !== null);
}

/** MT5 pending order types: 0 buy limit, 1 sell limit, 2 buy stop, 3 sell stop, 4/5 stop-limit. */
function pendingKind(rawType: number): Order["type"] {
  if (rawType === 0 || rawType === 1) return "limit";
  if (rawType === 4 || rawType === 5) return "stop_limit";
  return "stop";
}

export function toOrders(payload: unknown): Order[] {
  return listOf(payload, "orders", "pending", "data")
    .map((row) => {
      const rec = asRecord(row);
      if (!rec) return null;
      const symbol = text(rec, "symbol");
      if (!symbol) return null;
      const rawType = num(rec, "type", "order_type") ?? 0;
      const volume = num(rec, "volume_initial", "volumeInitial", "volume") ?? 0;
      const order: Order = {
        id: text(rec, "ticket", "id") ?? String(pick(rec, "ticket") ?? ""),
        symbol,
        side: rawType === 1 || rawType === 3 || rawType === 5 ? "sell" : "buy",
        type: pendingKind(rawType),
        qty: volume,
        filledQty: num(rec, "volume_current", "volumeCurrent") ?? 0,
        price: num(rec, "price_open", "priceOpen") ?? undefined,
        status: mapOrderState(num(rec, "state", "status")),
        time: normaliseTime(num(rec, "time_setup", "timeSetup", "time")),
      };
      const sl = num(rec, "sl");
      if (sl !== null) order.stopPrice = sl;
      return order;
    })
    .filter((o): o is Order => o !== null);
}

/** MT5 `TRADE_ORDER_STATE`: 0 added, 1 placed, 2 canceled, 3 done, 4 partial, 5 replaced, 6 expired. */
function mapOrderState(state: number | null): Order["status"] {
  switch (state) {
    case null:
    case 1:
    case 5:
      return "pending";
    case 2:
      return "canceled";
    case 3:
      return "filled";
    case 4:
      return "filled";
    case 6:
      return "expired";
    default:
      return "pending";
  }
}

export function toDeals(payload: unknown): Deal[] {
  return listOf(payload, "deals", "history", "data")
    .map((row) => {
      const rec = asRecord(row);
      if (!rec) return null;
      const symbol = text(rec, "symbol");
      const type = num(rec, "type", "deal_type");
      if (!symbol || type === 2) return null; // type 2 = balance entry
      const deal: Deal = {
        id: text(rec, "ticket", "id") ?? String(pick(rec, "ticket") ?? ""),
        symbol,
        side: type === 1 ? "sell" : "buy",
        qty: num(rec, "volume") ?? 0,
        price: num(rec, "price") ?? 0,
        pnl: num(rec, "profit", "pnl") ?? 0,
        time: normaliseTime(num(rec, "time", "time_msc")),
      };
      const commission = num(rec, "commission");
      const swap = num(rec, "swap");
      const positionId = num(rec, "position_id", "positionId", "position");
      const orderId = num(rec, "order");
      if (commission !== null) deal.commission = commission;
      if (swap !== null) deal.swap = swap;
      if (positionId !== null) deal.positionId = String(positionId);
      if (orderId !== null) deal.orderId = String(orderId);
      return deal;
    })
    .filter((d): d is Deal => d !== null);
}

/** MT5 sometimes reports milliseconds; every EzyView timestamp is seconds. */
function normaliseTime(value: number | null): number {
  if (value === null) return Math.floor(Date.now() / 1000);
  return value > 1e12 ? Math.floor(value / 1000) : value;
}

// ---------------------------------------------------------------------------
// Outgoing requests
// ---------------------------------------------------------------------------

export function isPending(request: OrderRequest): boolean {
  return request.type === "limit" || request.type === "stop" || request.type === "stop_limit";
}

/** Arguments for `trade_send_market_order`. */
export function marketOrderArgs(request: OrderRequest): Record<string, unknown> {
  const args: Record<string, unknown> = {
    symbol: request.symbol,
    side: request.side,
    volume: request.qty,
    type: "market",
  };
  if (request.stopLoss !== undefined) args.sl = request.stopLoss;
  if (request.takeProfit !== undefined) args.tp = request.takeProfit;
  if (request.clientOrderId) args.comment = request.clientOrderId;
  return args;
}

/** Arguments for `trade_send_pending_order`. */
export function pendingOrderArgs(request: OrderRequest): Record<string, unknown> {
  const args: Record<string, unknown> = {
    symbol: request.symbol,
    side: request.side,
    volume: request.qty,
    type: request.type === "stop" || request.type === "stop_limit" ? "stop" : "limit",
    price: request.price ?? request.stopPrice ?? 0,
  };
  if (request.stopLoss !== undefined) args.sl = request.stopLoss;
  if (request.takeProfit !== undefined) args.tp = request.takeProfit;
  if (request.timeInForce) args.expiry = request.timeInForce;
  return args;
}

/** Arguments for `trade_close_single_position`. */
export function closePositionArgs(symbol: string, qty?: number): Record<string, unknown> {
  const args: Record<string, unknown> = { symbol };
  if (qty !== undefined) args.volume = qty;
  return args;
}
