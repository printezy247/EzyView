import type {
  AccountInfo,
  Deal,
  EpochSeconds,
  Order,
  OrderRequest,
  Position,
  TradingAdapter,
} from "@ezyview/data-adapters";

/**
 * Virtual-money execution engine.
 *
 * Implements `TradingAdapter` so the UI can treat it exactly like MT5 (P5) or
 * an exchange broker later: the account, positions, orders and deal history all
 * look the same, only the source changes.
 *
 * Rules, matching the MASTERPLAN §3.4 brief and MT5's netting mode:
 * - one net position per symbol; adding to it averages the entry price,
 *   reducing it realizes P&L, flipping it closes and re-opens the remainder;
 * - no commission, leverage up to `maxLeverage`, margin taken at entry;
 * - market orders fill at the last price, limit/stop orders wait for a tick to
 *   cross them;
 * - stop-loss / take-profit close the position at the trigger price, and a
 *   margin level under the stop-out level closes everything.
 */
export interface PaperEngineOptions {
  startingBalance?: number;
  currency?: string;
  /** Hard ceiling on per-order leverage. */
  maxLeverage?: number;
  /** Fraction of notional held aside while a position is open. */
  maintenanceMarginRate?: number;
  /** Injectable for deterministic ids in tests. */
  idGenerator?: () => string;
  /** Injectable clock. */
  now?: () => EpochSeconds;
}

/** A position plus the accounting the UI needs but `Position` does not carry. */
export interface PaperPosition extends Position {
  /** Notional held as margin at the entry price. */
  margin: number;
}

/**
 * An order carrying the resting exit prices too, which the shared `Order`
 * contract leaves off because most venues track them on the position.
 */
export interface PaperOrder extends Order {
  takeProfit?: number;
  stopLoss?: number;
  /** stop_limit only: the stop has tripped and the order now rests as a limit. */
  triggered?: boolean;
}

/** Largest single order, so a typo (or a hostile caller) cannot size a nonsense position. */
const MAX_ORDER_QTY = 1_000_000_000;

/**
 * Persistable account state.
 *
 * `version` is bumped when the shapes change, so a stale file restores as a
 * fresh account instead of crashing the terminal on boot.
 */
export interface PaperSnapshot {
  version: number;
  balance: number;
  positions: PaperPosition[];
  orders: PaperOrder[];
  deals: Deal[];
  sequence: number;
}

const SNAPSHOT_VERSION = 1;

/** Thrown for anything that would leave the account in an impossible state. */
export class PaperTradingError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PaperTradingError";
    this.code = code;
  }
}

const DEFAULTS = {
  startingBalance: 100_000,
  currency: "USDT",
  maxLeverage: 100,
  maintenanceMarginRate: 0.005,
};

const finite = (value: number | undefined): value is number => typeof value === "number" && Number.isFinite(value);

function unrealized(position: PaperPosition, price: number = position.markPrice): number {
  const delta = position.side === "long" ? price - position.entryPrice : position.entryPrice - price;
  return delta * position.qty;
}


export class PaperTradingEngine implements TradingAdapter {
  readonly id = "paper";
  readonly label = "Paper trading";
  readonly mode = "paper" as const;

  private readonly options: Required<Omit<PaperEngineOptions, "idGenerator" | "now">>;
  private readonly idGenerator: () => string;
  private readonly now: () => EpochSeconds;

  private balance: number;
  private readonly positions = new Map<string, PaperPosition>();
  private readonly orders = new Map<string, PaperOrder>();
  private readonly deals: Deal[] = [];
  private readonly last = new Map<string, number>();

  private sequence = 0;
  private connected = false;

  /** Called after every fill, close or stop-out so the UI can refresh. */
  onUpdate: (() => void) | null = null;

  constructor(options: PaperEngineOptions = {}) {
    this.options = {
      startingBalance: options.startingBalance ?? DEFAULTS.startingBalance,
      currency: options.currency ?? DEFAULTS.currency,
      maxLeverage: options.maxLeverage ?? DEFAULTS.maxLeverage,
      maintenanceMarginRate: options.maintenanceMarginRate ?? DEFAULTS.maintenanceMarginRate,
    };
    this.idGenerator = options.idGenerator ?? (() => `${Date.now().toString(36)}${(this.sequence++).toString(36)}`);
    this.now = options.now ?? (() => Math.floor(Date.now() / 1000));
    this.balance = this.options.startingBalance;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async connect(): Promise<AccountInfo> {
    this.connected = true;
    return this.getAccount();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async getAccount(): Promise<AccountInfo> {
    let unrealizedTotal = 0;
    for (const position of this.positions.values()) unrealizedTotal += unrealized(position);
    const margin = this.usedMargin();
    const equity = this.balance + unrealizedTotal;
    return {
      id: "paper-account",
      provider: this.id,
      currency: this.options.currency,
      balance: this.balance,
      equity,
      margin,
      freeMargin: equity - margin,
      leverage: this.options.maxLeverage,
      tradeMode: "demo",
      name: "Paper account",
    };
  }

  /** Snapshots, since the engine replaces its records rather than mutating them. */
  async getPositions(): Promise<PaperPosition[]> {
    return Array.from(this.positions.values());
  }

  async getOrders(): Promise<PaperOrder[]> {
    return Array.from(this.orders.values()).filter((o) => o.status === "pending");
  }

  async getHistory(from?: EpochSeconds, to?: EpochSeconds): Promise<Deal[]> {
    return this.deals.filter((d) => (from === undefined || d.time >= from) && (to === undefined || d.time <= to));
  }

  /** True while connected; used by the status bar. */
  isConnected(): boolean {
    return this.connected;
  }

  /** Wipe the account back to its starting balance — the demo reset button. */
  reset(): void {
    this.balance = this.options.startingBalance;
    this.positions.clear();
    this.orders.clear();
    this.deals.length = 0;
    this.sequence = 0;
    this.onUpdate?.();
  }

  /**
   * Serializable account state, so a paper account can outlive the tab.
   *
   * Every record is copied because the engine hands out live objects from its
   * getters — a snapshot the caller then mutates would silently rewrite history.
   */
  snapshot(): PaperSnapshot {
    return {
      version: SNAPSHOT_VERSION,
      balance: this.balance,
      positions: Array.from(this.positions.values(), (p) => ({ ...p })),
      orders: Array.from(this.orders.values(), (o) => ({ ...o })),
      deals: this.deals.map((d) => ({ ...d })),
      sequence: this.sequence,
    };
  }

  /** Rebuild an engine from a snapshot, ignoring anything from another version. */
  static restore(snapshot: PaperSnapshot, options: PaperEngineOptions = {}): PaperTradingEngine {
    const engine = new PaperTradingEngine(options);
    if (snapshot.version !== SNAPSHOT_VERSION) return engine;
    engine.balance = snapshot.balance;
    // A truncated or hand-edited file must not throw during module import.
    for (const position of snapshot.positions ?? []) engine.positions.set(position.symbol, { ...position });
    for (const order of snapshot.orders ?? []) engine.orders.set(order.id, { ...order });
    for (const deal of snapshot.deals ?? []) engine.deals.push({ ...deal });
    engine.sequence = Number.isFinite(snapshot.sequence) ? snapshot.sequence : 0;
    engine.connected = true;
    return engine;
  }

  // -------------------------------------------------------------------------
  // Orders
  // -------------------------------------------------------------------------

  async placeOrder(request: OrderRequest): Promise<Order> {
    const order = this.executeOrder(request);
    if (order.status === "rejected") {
      throw new PaperTradingError(order.reason ?? "rejected", `Order rejected: ${order.reason ?? "unknown reason"}`);
    }
    return order;
  }

  async cancelOrder(id: string): Promise<boolean> {
    const order = this.orders.get(id);
    if (!order || order.status !== "pending") return false;
    this.orders.set(id, { ...order, status: "canceled", updateTime: this.now() });
    this.onUpdate?.();
    return true;
  }

  async modifyOrder(id: string, patch: Partial<OrderRequest>): Promise<Order> {
    const order = this.orders.get(id);
    if (!order || order.status !== "pending") {
      throw new PaperTradingError("not_open", `No open order ${id}`);
    }
    if (patch.qty !== undefined && (patch.qty <= 0 || !Number.isFinite(patch.qty) || patch.qty > MAX_ORDER_QTY)) {
      throw new PaperTradingError("invalid_qty", `qty must be greater than zero and at most ${MAX_ORDER_QTY}`);
    }
    if (patch.price !== undefined && (patch.price <= 0 || !Number.isFinite(patch.price))) {
      throw new PaperTradingError("invalid_price", "price must be greater than zero");
    }
    if (patch.stopPrice !== undefined && (patch.stopPrice <= 0 || !Number.isFinite(patch.stopPrice))) {
      throw new PaperTradingError("invalid_stop_price", "stop price must be greater than zero");
    }
    const next: PaperOrder = {
      ...order,
      qty: patch.qty ?? order.qty,
      price: patch.price ?? order.price,
      stopPrice: patch.stopPrice ?? order.stopPrice,
      takeProfit: patch.takeProfit ?? order.takeProfit,
      stopLoss: patch.stopLoss ?? order.stopLoss,
      updateTime: this.now(),
    };
    this.orders.set(id, next);
    this.onUpdate?.();
    return next;
  }

  async closePosition(symbol: string, qty?: number): Promise<Order> {
    const position = this.positions.get(symbol);
    if (!position) throw new PaperTradingError("no_position", `No open position on ${symbol}`);
    const size = qty === undefined ? position.qty : Math.min(qty, position.qty);
    return this.marketOrder(symbol, position.side === "long" ? "sell" : "buy", size);
  }

  /**
   * Move (or clear) an open position's stop and target.
   *
   * `null` clears a level, `undefined` leaves it alone — which is what dragging
   * one line on the chart needs: the entry and the other level must not move.
   * A non-finite price is rejected rather than stored, because a NaN stop would
   * silently never trigger.
   */
  async setLevels(symbol: string, patch: { stopLoss?: number | null; takeProfit?: number | null }): Promise<PaperPosition> {
    const position = this.positions.get(symbol);
    if (!position) throw new PaperTradingError("no_position", `No open position on ${symbol}`);
    for (const value of [patch.stopLoss, patch.takeProfit]) {
      if (typeof value === "number" && !Number.isFinite(value)) {
        throw new PaperTradingError("bad_level", "stop and target must be finite prices");
      }
    }
    const next: PaperPosition = {
      ...position,
      stopLoss: patch.stopLoss === null ? undefined : (patch.stopLoss ?? position.stopLoss),
      takeProfit: patch.takeProfit === null ? undefined : (patch.takeProfit ?? position.takeProfit),
    };
    this.positions.set(symbol, next);
    this.onUpdate?.();
    return next;
  }

  /** Flatten everything at market — the panic button above the positions list. */
  async closeAll(): Promise<Order[]> {
    const closed: Order[] = [];
    // Snapshot the symbols first: each fill deletes its own position.
    for (const symbol of Array.from(this.positions.keys())) {
      const position = this.positions.get(symbol);
      if (!position) continue;
      closed.push(this.marketOrder(symbol, position.side === "long" ? "sell" : "buy", position.qty));
    }
    return closed;
  }

  /** Internal market order, so closing does not have to go through `await`. */
  private marketOrder(symbol: string, side: OrderRequest["side"], qty: number): Order {
    return this.executeOrder({ symbol, side, type: "market", qty });
  }

  // -------------------------------------------------------------------------
  // Market data
  // -------------------------------------------------------------------------

  /**
   * Fold one tick into the engine: mark the position, release any limit/stop
   * order the price crossed, then trip SL/TP and the stop-out level.
   *
   * Everything that mutates here reports through `onUpdate`, so the UI just
   * re-reads the account on every tick.
   */
  updateQuote(symbol: string, price: number): void {
    if (!finite(price) || price <= 0) return;
    const prev = this.last.get(symbol);
    if (prev === price) return;
    this.last.set(symbol, price);
    const time = this.now();

    const position = this.positions.get(symbol);
    const hadPosition = Boolean(position);
    if (position) this.positions.set(symbol, { ...position, markPrice: price, unrealizedPnl: unrealized(position, price) });

    let triggeredAny = false;
    for (const order of Array.from(this.orders.values())) {
      if (order.status !== "pending" || order.symbol !== symbol) continue;
      if (order.type === "stop_limit" && !order.triggered && finite(order.stopPrice)) {
        const tripped = order.side === "buy" ? price >= order.stopPrice : price <= order.stopPrice;
        if (tripped) {
          order.triggered = true;
          triggeredAny = true;
        }
      }
      const trigger = this.triggered(order, price);
      if (!trigger) continue;
      triggeredAny = true;
      // The resting order is spent; the fill below books the position.
      this.orders.delete(order.id);
      this.executeOrder({ ...order, type: "market", qty: order.qty }, trigger, order);
    }

    const hadExits = this.checkExits(symbol, price, time);
    // Only fire UI update if positions, orders, or equity actually changed
    if (hadPosition || triggeredAny || hadExits) {
      this.onUpdate?.();
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private triggered(order: PaperOrder, price: number): number | null {
    if (order.type === "stop_limit" && !order.triggered) return null;
    if (order.type === "stop") {
      const stopLevel = order.stopPrice ?? order.price;
      if (!finite(stopLevel)) return null;
      switch (order.side) {
        case "buy":
          return price >= stopLevel ? price : null;
        case "sell":
          return price <= stopLevel ? price : null;
        default:
          return null;
      }
    }

    if (!finite(order.price)) return null;
    switch (order.side) {
      case "buy":
        return price <= order.price ? order.price : null;
      case "sell":
        return price >= order.price ? order.price : null;
      default:
        return null;
    }
  }

  private checkExits(symbol: string, price: number, time: EpochSeconds): void {
    const position = this.positions.get(symbol);
    if (!position) return;

    const stopLoss = position.stopLoss;
    const takeProfit = position.takeProfit;
    const isLong = position.side === "long";
    const hitStop = finite(stopLoss) && (isLong ? price <= stopLoss : price >= stopLoss);
    const hitTarget = finite(takeProfit) && (isLong ? price >= takeProfit : price <= takeProfit);
    if (hitStop || hitTarget) {
      const triggerPrice = hitStop ? (stopLoss as number) : (takeProfit as number);
      this.closeAt(symbol, position, triggerPrice, time);
    }

    this.checkStopOut(time);
  }

  /** Close the whole position at an explicit price, recording the deal. */
  private closeAt(symbol: string, position: PaperPosition, price: number, time: EpochSeconds): void {
    const pnl = unrealized(position, price);
    this.positions.delete(symbol);
    this.pushDeal({
      id: this.idGenerator(),
      symbol,
      side: position.side === "long" ? "sell" : "buy",
      qty: position.qty,
      price,
      pnl,
      time,
      positionId: position.id,
    });
  }

  /**
   * Stop-out: once the margin level falls under the maintenance ratio, the
   * venue liquidates to protect the remaining equity.
   */
  private checkStopOut(time: EpochSeconds): void {
    const margin = this.usedMargin();
    if (margin <= 0) return;
    const equity = this.balance + this.totalUnrealized();
    if (equity / margin >= this.options.maintenanceMarginRate * 100) return;
    for (const position of Array.from(this.positions.values())) {
      this.closeAt(position.symbol, position, this.last.get(position.symbol) ?? position.markPrice, time);
    }
  }

  private executeOrder(request: OrderRequest, fillPrice?: number, source?: PaperOrder): Order {
    const price = fillPrice ?? this.last.get(request.symbol);
    const order: PaperOrder = {
      id: source?.id ?? this.idGenerator(),
      clientOrderId: request.clientOrderId,
      symbol: request.symbol,
      side: request.side,
      type: request.type,
      qty: request.qty,
      filledQty: 0,
      price: request.price,
      stopPrice: request.stopPrice,
      takeProfit: request.takeProfit,
      stopLoss: request.stopLoss,
      status: "pending",
      timeInForce: request.timeInForce,
      time: this.now(),
    };

    const rejection = this.validate(request, price);
    if (rejection) {
      const rejected: Order = { ...order, status: "rejected", reason: rejection, updateTime: this.now() };
      this.orders.set(rejected.id, rejected);
      this.onUpdate?.();
      return rejected;
    }

    // Working orders wait for a tick to cross them.
    if (request.type === "limit" || request.type === "stop" || request.type === "stop_limit") {
      this.orders.set(order.id, order);
      this.onUpdate?.();
      return { ...order };
    }

    // `validate` has already refused a market order with no price; this keeps
    // the narrowing local instead of trusting a separate function's return.
    if (!finite(price)) throw new PaperTradingError("no_price", `No market price for ${request.symbol}`);

    this.fill(request, price);
    const done: Order = { ...order, status: "filled", filledQty: request.qty, avgFillPrice: price, updateTime: this.now() };
    this.onUpdate?.();
    return done;
  }

  private validate(request: OrderRequest, price: number | undefined): string | null {
    if (request.qty <= 0 || !Number.isFinite(request.qty)) return "qty must be greater than zero";
    if (request.qty > MAX_ORDER_QTY) return `qty must be at most ${MAX_ORDER_QTY}`;
    if (request.type === "market" && !finite(price)) return "no market price yet";
    if (request.type === "limit" && !finite(request.price)) return "limit orders need a price";
    if (request.type === "stop_limit" && (!finite(request.price) || !finite(request.stopPrice))) {
      return "stop limit orders need a price and stop price";
    }
    if (request.type === "stop" && !finite(request.stopPrice ?? request.price)) return "stop orders need a price";
    // A price of zero (an empty ticket field) is finite but not tradable: it
    // would fill a sell limit against any quote and open a position at 0.
    if (request.type !== "market" && (request.price ?? 0) <= 0) return "price must be greater than zero";
    if (request.stopLoss !== undefined && (!Number.isFinite(request.stopLoss) || request.stopLoss <= 0)) {
      return "stop loss must be a positive number";
    }
    if (request.takeProfit !== undefined && (!Number.isFinite(request.takeProfit) || request.takeProfit <= 0)) {
      return "take profit must be a positive number";
    }
    // Margin is taken at the order's own entry price, at the account ceiling.
    const notional = (price ?? request.price ?? 0) * request.qty;
    if (notional / this.options.maxLeverage > this.freeMargin()) return "not enough free margin";
    return null;
  }

  /** Net one fill into the symbol's position, realizing P&L where it reduces. */
  private fill(request: OrderRequest, price: number): void {
    const isBuy = request.side === "buy";
    const leverage = this.options.maxLeverage;
    const existing = this.positions.get(request.symbol);
    const time = this.now();

    if (!existing) {
      const posId = this.idGenerator();
      this.positions.set(request.symbol, {
        id: posId,
        symbol: request.symbol,
        side: isBuy ? "long" : "short",
        qty: request.qty,
        entryPrice: price,
        markPrice: price,
        unrealizedPnl: 0,
        leverage: leverage,
        stopLoss: request.stopLoss,
        takeProfit: request.takeProfit,
        time,
        margin: (price * request.qty) / leverage,
      });
      return;
    }

    const sameDirection = (existing.side === "long") === isBuy;
    if (sameDirection) {
      const total = existing.qty + request.qty;
      const entry = (existing.entryPrice * existing.qty + price * request.qty) / total;
      this.positions.set(request.symbol, {
        ...existing,
        qty: total,
        entryPrice: entry,
        markPrice: price,
        unrealizedPnl: 0,
        stopLoss: request.stopLoss ?? existing.stopLoss,
        takeProfit: request.takeProfit ?? existing.takeProfit,
        margin: (entry * total) / leverage,
      });
      return;
    }

    const closing = Math.min(existing.qty, request.qty);
    this.pushDeal({
      id: this.idGenerator(),
      symbol: request.symbol,
      side: isBuy ? "buy" : "sell",
      qty: closing,
      price,
      pnl: unrealized(existing, price) * (closing / existing.qty),
      time,
      positionId: existing.id,
    });

    if (closing >= existing.qty) {
      this.positions.delete(request.symbol);
    } else {
      this.positions.set(request.symbol, {
        ...existing,
        qty: existing.qty - closing,
        markPrice: price,
        unrealizedPnl: 0,
        margin: (existing.entryPrice * (existing.qty - closing)) / leverage,
      });
    }

    // A flip keeps going: the remainder of the fill opens a fresh position.
    const leftover = request.qty - closing;
    if (leftover > 0) {
      const flipPosId = this.idGenerator();
      this.positions.set(request.symbol, {
        id: flipPosId,
        symbol: request.symbol,
        side: isBuy ? "long" : "short",
        qty: leftover,
        entryPrice: price,
        markPrice: price,
        unrealizedPnl: 0,
        leverage: leverage,
        stopLoss: request.stopLoss,
        takeProfit: request.takeProfit,
        time,
        margin: (price * leftover) / leverage,
      });
    }
  }

  private pushDeal(deal: Deal): void {
    this.deals.push(deal);
    this.balance += deal.pnl;
  }

  private usedMargin(): number {
    let total = 0;
    for (const position of this.positions.values()) total += position.margin;
    return total;
  }

  private totalUnrealized(): number {
    let total = 0;
    for (const position of this.positions.values()) total += unrealized(position);
    return total;
  }

  private freeMargin(): number {
    return this.balance + this.totalUnrealized() - this.usedMargin();
  }

  /** Realized P&L, summed over every deal the engine has recorded. */
  realizedPnl(): number {
    return this.deals.reduce((sum, d) => sum + d.pnl, 0);
  }
}
