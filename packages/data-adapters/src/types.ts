/**
 * Core adapter contracts for EzyView.
 *
 * Everything the terminal needs from an external world (market data, trading
 * accounts, fundamentals, news) is expressed behind these interfaces so that a
 * user can plug in their own provider without touching app code.
 */

// ---------------------------------------------------------------------------
// Time & candles
// ---------------------------------------------------------------------------

/** Unix epoch seconds. All bar timestamps use UTC seconds. */
export type EpochSeconds = number;

/** Standard OHLCV candle. `volume` may be 0 for feed types without volume. */
export interface Candle {
  time: EpochSeconds;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Chart resolutions. Values are human-readable ("1m", "4h", "1D"). */
export type Resolution =
  | "1t"
  | "1s"
  | "5s"
  | "15s"
  | "30s"
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "6h"
  | "8h"
  | "12h"
  | "1D"
  | "1W"
  | "1M";

/** Canonical asset classes supported by the symbol universe. */
export type AssetClass = "crypto" | "forex" | "stock" | "etf" | "index" | "futures" | "bond" | "option";

export interface SymbolInfo {
  /** Stable unique id, e.g. "BINANCE:BTCUSDT" or "FX:EURUSD". */
  symbol: string;
  /** Short display ticker, e.g. "BTCUSDT". */
  ticker: string;
  /** Human name, e.g. "Bitcoin / TetherUS". */
  description: string;
  /** Provider id that owns this symbol, e.g. "binance". */
  provider: string;
  assetClass: AssetClass;
  /** Price precision for display and order rounding. */
  precision: number;
  /** Minimum price movement. */
  tickSize: number;
  /** Minimum tradable quantity. */
  minQty?: number;
  /** Quantity step. */
  qtyStep?: number;
  /** Settlement currency, e.g. "USDT". */
  currency?: string;
  /** Whether the symbol trades now (session-aware when known). */
  tradable?: boolean;
}

// ---------------------------------------------------------------------------
// Market data
// ---------------------------------------------------------------------------

export interface HistoricalRequest {
  symbol: string;
  resolution: Resolution;
  /** Inclusive lower bound for bar start, in epoch seconds. */
  from: EpochSeconds;
  /** Inclusive upper bound for bar start, in epoch seconds. */
  to: EpochSeconds;
  /** Optional max candle count the consumer can render. */
  limit?: number;
}

export interface Quote {
  symbol: string;
  last: number;
  /** Absolute change vs previous close. */
  change?: number;
  /** Percent change vs previous close. */
  changePercent?: number;
  bid?: number;
  ask?: number;
  volume24h?: number;
  time: EpochSeconds;
}

export type SubscribeHandler = (quote: Quote) => void;
export type UnsubscribeFn = () => void;

/**
 * Historical + streaming market data source.
 *
 * Implementations: CCXT (crypto), Alpaca (stocks/ETFs), MT5 bridge (forex),
 * Yahoo (delayed equities), plus an in-memory demo feed for offline use.
 */
export interface MarketDataAdapter {
  /** Unique provider id, e.g. "ccxt". */
  readonly id: string;
  /** Human label shown in the symbol search UI. */
  readonly label: string;
  /** Asset classes this adapter can serve. */
  readonly assetClasses: readonly AssetClass[];

  /** Health probe; adapters must never throw. */
  ping(): Promise<boolean>;

  searchSymbols(query: string, assetClass?: AssetClass): Promise<SymbolInfo[]>;
  getSymbol(symbol: string): Promise<SymbolInfo | null>;

  getHistory(request: HistoricalRequest): Promise<Candle[]>;
  getQuote(symbol: string): Promise<Quote | null>;
  subscribe(symbols: string[], onQuote: SubscribeHandler): Promise<UnsubscribeFn>;
}

// ---------------------------------------------------------------------------
// Trading
// ---------------------------------------------------------------------------

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop" | "stop_limit";
export type TimeInForce = "gtc" | "ioc" | "fok" | "day" | "gtd";
export type OrderStatus = "pending" | "filled" | "canceled" | "rejected" | "expired";
export type PositionSide = "long" | "short" | "flat";

export interface OrderRequest {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  qty: number;
  /** Required for limit / stop_limit. */
  price?: number;
  stopPrice?: number;
  takeProfit?: number;
  stopLoss?: number;
  timeInForce?: TimeInForce;
  /** Free-form client id for idempotency. */
  clientOrderId?: string;
  comment?: string;
}

export interface Order {
  id: string;
  clientOrderId?: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  qty: number;
  filledQty: number;
  price?: number;
  avgFillPrice?: number;
  stopPrice?: number;
  status: OrderStatus;
  timeInForce?: TimeInForce;
  time: EpochSeconds;
  updateTime?: EpochSeconds;
  reason?: string;
}

export interface Position {
  symbol: string;
  side: PositionSide;
  qty: number;
  entryPrice: number;
  markPrice: number;
  /** Unrealized P&L in account currency. */
  unrealizedPnl: number;
  leverage?: number;
  stopLoss?: number;
  takeProfit?: number;
  time: EpochSeconds;
}

export interface AccountInfo {
  id: string;
  provider: string;
  currency: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  /** 0..1, used by risk veto. */
  leverage?: number;
  tradeMode?: "demo" | "real" | "contest";
  name?: string;
}

export interface Deal {
  id: string;
  symbol: string;
  side: OrderSide;
  qty: number;
  price: number;
  commission?: number;
  swap?: number;
  pnl: number;
  time: EpochSeconds;
  orderId?: string;
  positionId?: string;
}

/**
 * Execution venue. Default implementation is a paper engine (P4); live venues
 * are MT5 (P5), CCXT spot, and Alpaca.
 */
export interface TradingAdapter {
  readonly id: string;
  readonly label: string;
  /** "paper" | "demo" | "live" — surfaced in the UI status bar. */
  readonly mode: "paper" | "demo" | "live";

  connect(): Promise<AccountInfo>;
  disconnect(): Promise<void>;
  getAccount(): Promise<AccountInfo>;
  getPositions(): Promise<Position[]>;
  getOrders(): Promise<Order[]>;
  getHistory(from?: EpochSeconds, to?: EpochSeconds): Promise<Deal[]>;

  placeOrder(request: OrderRequest): Promise<Order>;
  cancelOrder(id: string): Promise<boolean>;
  modifyOrder(id: string, patch: Partial<OrderRequest>): Promise<Order>;
  closePosition(symbol: string, qty?: number): Promise<Order>;
}

// ---------------------------------------------------------------------------
// Fundamentals & news
// ---------------------------------------------------------------------------

export type Impact = "high" | "medium" | "low" | "none";

export interface EconomicEvent {
  id: string;
  time: EpochSeconds;
  currency: string;
  impact: Impact;
  title: string;
  actual?: string | null;
  forecast?: string | null;
  previous?: string | null;
  /** "better" | "worse" | "inline" | null — measured against forecast. */
  deviation?: "better" | "worse" | "inline" | null;
  source: string;
  url?: string;
}

export interface NewsItem {
  id: string;
  time: EpochSeconds;
  headline: string;
  summary?: string;
  source: string;
  url?: string;
  symbols: string[];
  tags?: string[];
  sentiment?: number;
}

export interface EarningsReport {
  symbol: string;
  time: EpochSeconds;
  /** Actual EPS. */
  eps?: number | null;
  estimate?: number | null;
  revenue?: number | null;
  quarter: string;
  source: string;
}

export interface CalendarAdapter {
  readonly id: string;
  readonly label: string;
  getCalendar(from: EpochSeconds, to: EpochSeconds, filter?: { currency?: string; impact?: Impact }): Promise<EconomicEvent[]>;
}

export interface NewsAdapter {
  readonly id: string;
  readonly label: string;
  getNews(options?: { symbols?: string[]; from?: EpochSeconds; limit?: number }): Promise<NewsItem[]>;
  subscribe?(symbols: string[], onNews: (item: NewsItem) => void): Promise<UnsubscribeFn>;
}

export interface FundamentalsAdapter {
  readonly id: string;
  readonly label: string;
  getEarnings(symbol: string, from?: EpochSeconds, to?: EpochSeconds): Promise<EarningsReport[]>;
  /** Key/value fundamentals for a symbol (P/E, EPS, margin, ...). */
  getProfile(symbol: string): Promise<Record<string, number | string | null>>;
}

export interface IpoEvent {
  /** Expected or actual listing day, epoch seconds (UTC midnight). */
  time: EpochSeconds;
  symbol: string;
  name: string;
  exchange?: string | null;
  /** Price or range as published, e.g. "10.00-12.00". */
  price?: string | null;
  shares?: number | null;
  /** "expected" | "priced" | "filed" | "withdrawn" as published. */
  status?: string | null;
  source: string;
}

export interface DividendEvent {
  symbol: string;
  /** Ex-dividend day, epoch seconds (UTC midnight). */
  exDate: EpochSeconds;
  payDate?: EpochSeconds | null;
  amount: number;
  currency?: string | null;
  source: string;
}

/** IPO and dividend calendars. */
export interface CorporateCalendarAdapter {
  readonly id: string;
  readonly label: string;
  getIpos(from: EpochSeconds, to: EpochSeconds): Promise<IpoEvent[]>;
  getDividends(symbol: string, from: EpochSeconds, to: EpochSeconds): Promise<DividendEvent[]>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export interface AdapterRegistry {
  markets: Map<string, MarketDataAdapter>;
  trading: Map<string, TradingAdapter>;
  calendars: Map<string, CalendarAdapter>;
  news: Map<string, NewsAdapter>;
  fundamentals: Map<string, FundamentalsAdapter>;
}
