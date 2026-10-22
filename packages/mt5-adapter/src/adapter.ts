/**
 * EzyView adapters over MetaTrader 5.
 *
 * Split into two classes because both interfaces define `getHistory` with a
 * different shape: market data takes a `HistoricalRequest` and returns bars,
 * trading takes a date range and returns deals. Both read from one transport
 * so the bridge and MCP wirings stay interchangeable.
 */
import type {
  AccountInfo,
  AssetClass,
  Candle,
  Deal,
  EpochSeconds,
  HistoricalRequest,
  MarketDataAdapter,
  Order,
  OrderRequest,
  Position,
  Quote,
  SubscribeHandler,
  SymbolInfo,
  TradingAdapter,
  UnsubscribeFn,
} from "@ezyview/data-adapters";
import { asRecord, toAccount, toCandles, toDeals, toOrders, toPositions, toQuote, toSymbols } from "./map";
import { createTransport } from "./transport";
import type { Mt5Transport, TransportOptions } from "./transport";

const POLL_MS = 1500;

/**
 * Market data: symbols, candles and quotes from the broker itself.
 *
 * Every read degrades to an empty result rather than throwing, so a dropped
 * connection can blank a panel without blanking the terminal.
 */
export class Mt5MarketData implements MarketDataAdapter {
  readonly id = "mt5";
  readonly label = "MetaTrader 5";
  readonly assetClasses: readonly AssetClass[] = [
    "forex",
    "stock",
    "index",
    "futures",
    "crypto",
    "etf",
    "bond",
    "option",
  ];

  private readonly transport: Mt5Transport;

  constructor(transport: Mt5Transport) {
    this.transport = transport;
  }

  async ping(): Promise<boolean> {
    return this.transport.ping();
  }

  async searchSymbols(query: string): Promise<SymbolInfo[]> {
    try {
      const all = toSymbols(await this.transport.marketWatch());
      const needle = query.trim().toUpperCase();
      if (!needle) return all;
      return all.filter((s) => s.symbol.includes(needle) || s.description.toUpperCase().includes(needle));
    } catch {
      return [];
    }
  }

  async getSymbol(symbol: string): Promise<SymbolInfo | null> {
    const found = await this.searchSymbols(symbol);
    return found.find((s) => s.symbol === symbol) ?? null;
  }

  async getHistory(request: HistoricalRequest): Promise<Candle[]> {
    try {
      const payload = await this.transport.history({
        symbol: request.symbol,
        resolution: request.resolution,
        from: request.from,
        to: request.to,
      });
      return toCandles(payload, request.limit);
    } catch {
      return [];
    }
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    try {
      return findQuote(await this.transport.marketWatch(), symbol);
    } catch {
      return null;
    }
  }

  async subscribe(symbols: string[], onQuote: SubscribeHandler): Promise<UnsubscribeFn> {
    let active = true;
    let inFlight = false;
    const tick = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        const raw = await this.transport.marketWatch();
        if (!active) return;
        for (const symbol of symbols) {
          const quote = findQuote(raw, symbol);
          if (quote) onQuote(quote);
        }
      } catch {
        // network or server error; next tick will retry
      } finally {
        inFlight = false;
      }
    };
    void tick();
    const timer = setInterval(tick, POLL_MS);
    return async () => {
      active = false;
      clearInterval(timer);
    };
  }
}

/** Trading: account, positions, orders and execution on the demo/live account. */
export class Mt5Trading implements TradingAdapter {
  readonly id = "mt5";
  readonly label = "MetaTrader 5";

  private readonly transport: Mt5Transport;
  private accountInfo: AccountInfo | null = null;

  constructor(transport: Mt5Transport) {
    this.transport = transport;
  }

  get mode(): "paper" | "demo" | "live" {
    return this.accountInfo?.tradeMode === "real" ? "live" : "demo";
  }

  async connect(): Promise<AccountInfo> {
    return this.requireAccount();
  }

  async disconnect(): Promise<void> {
    this.accountInfo = null;
  }

  getAccount(): Promise<AccountInfo> {
    return this.requireAccount();
  }

  async getPositions(): Promise<Position[]> {
    try {
      return toPositions(await this.transport.openPositions());
    } catch {
      return [];
    }
  }

  async getOrders(): Promise<Order[]> {
    try {
      const payload = await this.transport.openPositions();
      const record = asRecord(payload);
      return toOrders(record && "orders" in record ? { orders: record.orders } : payload);
    } catch {
      return [];
    }
  }

  async getHistory(from?: EpochSeconds, to?: EpochSeconds): Promise<Deal[]> {
    try {
      return toDeals(await this.transport.deals(from, to));
    } catch {
      return [];
    }
  }

  async placeOrder(request: OrderRequest): Promise<Order> {
    const payload = await this.transport.placeOrder(request);
    return orderFromPayload(payload, request);
  }

  async cancelOrder(id: string): Promise<boolean> {
    await this.transport.cancel(id);
    return true;
  }

  async modifyOrder(id: string, patch: Partial<OrderRequest>): Promise<Order> {
    await this.transport.modify(id, patch.stopLoss, patch.takeProfit);
    return {
      id,
      symbol: patch.symbol ?? "",
      side: patch.side ?? "buy",
      type: patch.type ?? "market",
      qty: patch.qty ?? 0,
      filledQty: 0,
      status: "pending",
      time: Math.floor(Date.now() / 1000),
    };
  }

  async closePosition(symbol: string, qty?: number): Promise<Order> {
    const positions = await this.getPositions().catch(() => []);
    const position = positions.find((p) => p.symbol === symbol);
    const side = position?.side === "short" ? "buy" : "sell";
    await this.transport.close(symbol, qty);
    return {
      id: `${symbol}-close`,
      symbol,
      side,
      type: "market",
      qty: qty ?? position?.qty ?? 0,
      filledQty: qty ?? position?.qty ?? 0,
      status: "filled",
      time: Math.floor(Date.now() / 1000),
    };
  }

  /** One read that both verifies the session and caches the account shape. */
  private async requireAccount(): Promise<AccountInfo> {
    const account = toAccount(await this.transport.account());
    if (!account) throw new Error("MetaTrader returned no account");
    this.accountInfo = account;
    return account;
  }
}

/** The triple the app holds: one transport, two adapter faces. */
export interface Mt5Adapter {
  transport: Mt5Transport;
  data: Mt5MarketData;
  trading: Mt5Trading;
}

export function createMt5(options: TransportOptions = {}): Mt5Adapter {
  const transport = createTransport(options);
  return { transport, data: new Mt5MarketData(transport), trading: new Mt5Trading(transport) };
}

/** Quote for one symbol out of a Market Watch list payload. */
function findQuote(payload: unknown, symbol: string): Quote | null {
  const rows: unknown[] = Array.isArray(payload)
    ? payload
    : (() => {
        const record = asRecord(payload);
        const list = record ? (record.symbols ?? record.data) : undefined;
        return Array.isArray(list) ? list : [];
      })();
  const match = rows.find((row) => {
    const rec = asRecord(row);
    return rec !== null && (rec.symbol ?? rec.name) === symbol;
  });
  if (match === undefined) return null;
  return toQuote(match, symbol);
}

/**
 * The terminal acknowledges an order with a ticket; until the next refresh
 * shows it, that ticket plus the request is the best description we have.
 */
function orderFromPayload(payload: unknown, request: OrderRequest): Order {
  const rec = asRecord(payload);
  const ticket = rec ? (rec.ticket ?? rec.order) : undefined;
  return {
    id: ticket !== undefined && ticket !== null ? String(ticket) : `${request.symbol}-pending`,
    symbol: request.symbol,
    side: request.side,
    type: request.type,
    qty: request.qty,
    filledQty: 0,
    price: request.price,
    status: request.type === "market" ? "filled" : "pending",
    time: Math.floor(Date.now() / 1000),
  };
}
