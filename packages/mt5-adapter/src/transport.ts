/**
 * Transports behind the MT5 adapters.
 *
 * One semantic surface, two wirings:
 *  - `BridgeTransport` talks REST to `tools/mt5-bridge`, which drives the
 *    official `MetaTrader5` API. This is the path that works everywhere the
 *    terminal can be attached (Windows natively, or under Wine).
 *  - `McpTransport` talks to the terminal's built-in MCP server, which needs
 *    no sidecar at all — but is only usable once MT5 issues a key it accepts.
 */
import type { OrderRequest } from "@ezyview/data-adapters";
import { McpClient, isLoopbackUrl } from "./mcp";
import type { McpConfig } from "./mcp";
import {
  MT5_TOOLS,
  closePositionArgs,
  isPending,
  marketOrderArgs,
  pendingOrderArgs,
  toTimeframe,
} from "./map";
import type { Resolution } from "@ezyview/data-adapters";

/** Options on the trade writes: dry-run validates without touching the venue. */
export interface Mt5WriteOptions {
  dryRun?: boolean;
}

/** Everything the adapters need from MetaTrader 5, backend-agnostic. */
export interface Mt5Transport {
  /** Reachability probe; never throws. */
  ping(): Promise<boolean>;
  account(): Promise<unknown>;
  /** Envelope carrying both `positions` and `orders`. */
  openPositions(): Promise<unknown>;
  deals(from?: number, to?: number): Promise<unknown>;
  marketWatch(): Promise<unknown>;
  history(request: { symbol: string; resolution: Resolution; from: number; to: number }): Promise<unknown>;
  placeOrder(request: OrderRequest, options?: Mt5WriteOptions): Promise<unknown>;
  close(symbol: string, qty?: number, options?: Mt5WriteOptions): Promise<unknown>;
  cancel(ticket: string, options?: Mt5WriteOptions): Promise<unknown>;
  modify(ticket: string, sl?: number, tp?: number, options?: Mt5WriteOptions): Promise<unknown>;
  /**
   * In-app broker login (bridge only — absent on MCP transports, which have no
   * credential surface). Resolves with the account summary and a session id.
   */
  connect?(credentials: Mt5Credentials): Promise<Mt5ConnectResult>;
  /** Drop the bridge's MT5 connection and the remembered session. */
  disconnect?(): Promise<unknown>;
  /** Recent audit rows, newest first. Bridge only. */
  audit?(limit?: number): Promise<unknown>;
}

/** Credentials for `POST /connect`. Never persist the password outside the keyring. */
export interface Mt5Credentials {
  server: string;
  login: string;
  password: string;
}

export interface Mt5ConnectResult {
  ok?: boolean;
  session?: string | null;
  login?: string | number;
  server?: string;
  demo?: boolean;
  balance?: number;
  equity?: number;
  margin?: number;
  free_margin?: number;
  profit?: number;
  currency?: string;
  leverage?: number;
  error?: string;
}

export type TransportKind = "bridge" | "mcp";

export interface TransportOptions {
  kind?: TransportKind;
  /** Bridge base URL, e.g. "http://127.0.0.1:8765". */
  bridgeUrl?: string;
  /** Shared token for the bridge, when the operator set one. */
  bridgeToken?: string;
  /** MCP endpoint + key (ignored by the bridge transport). */
  mcp?: Partial<McpConfig>;
  fetchFn?: McpConfig["fetchFn"];
}

export const DEFAULT_BRIDGE_URL = "http://127.0.0.1:8765";
export const DEFAULT_MCP_URL = "http://127.0.0.1:22346/mcp";

// ---------------------------------------------------------------------------
// Bridge (REST → official MetaTrader5 API)
// ---------------------------------------------------------------------------

class BridgeTransport implements Mt5Transport {
  private readonly baseUrl: string;
  private readonly fetchFn: NonNullable<McpConfig["fetchFn"]>;
  /** Shared token, when the bridge operator set one. */
  private readonly token: string | undefined;
  /** Session minted by `/connect`; in-memory only, never persisted. */
  private session: string | null = null;

  constructor(baseUrl: string, fetchFn?: McpConfig["fetchFn"], token?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetchFn = fetchFn ?? ((input, init) => fetch(input, init));
    this.token = token?.trim() || undefined;
  }

  get connected(): boolean {
    return this.session !== null;
  }

  async ping(): Promise<boolean> {
    try {
      const payload = await this.send<{ ok?: boolean; connected?: boolean }>("GET", "/health");
      return payload.ok === true || payload.connected === true;
    } catch {
      return false;
    }
  }

  account(): Promise<unknown> {
    return this.send("GET", "/account");
  }

  openPositions(): Promise<unknown> {
    return this.send("GET", "/positions");
  }

  deals(from?: number, to?: number): Promise<unknown> {
    const query = from !== undefined || to !== undefined ? `?from=${from ?? ""}&to=${to ?? ""}` : "";
    return this.send("GET", `/deals${query}`);
  }

  marketWatch(): Promise<unknown> {
    return this.send("GET", "/symbols");
  }

  history(request: { symbol: string; resolution: Resolution; from: number; to: number }): Promise<unknown> {
    const params = new URLSearchParams({
      symbol: request.symbol,
      tf: toTimeframe(request.resolution),
      from: String(request.from),
      to: String(request.to),
    });
    return this.send("GET", `/history?${params.toString()}`);
  }

  placeOrder(request: OrderRequest, options?: Mt5WriteOptions): Promise<unknown> {
    const body = {
      symbol: request.symbol,
      side: request.side,
      type: isPending(request) ? (request.type === "stop" || request.type === "stop_limit" ? "stop" : "limit") : "market",
      volume: request.qty,
      price: request.price ?? request.stopPrice,
      sl: request.stopLoss,
      tp: request.takeProfit,
      comment: request.clientOrderId,
      ...this.writeExtras(options),
    };
    return this.send("POST", "/order", body);
  }

  close(symbol: string, qty?: number, options?: Mt5WriteOptions): Promise<unknown> {
    return this.send("POST", "/close", { symbol, volume: qty, ...this.writeExtras(options) });
  }

  cancel(ticket: string, options?: Mt5WriteOptions): Promise<unknown> {
    return this.send("POST", "/cancel", { ticket, ...this.writeExtras(options) });
  }

  modify(ticket: string, sl?: number, tp?: number, options?: Mt5WriteOptions): Promise<unknown> {
    return this.send("POST", "/modify", { ticket, sl, tp, ...this.writeExtras(options) });
  }

  async connect(credentials: Mt5Credentials): Promise<Mt5ConnectResult> {
    // The broker password travels in this request, so it may only go to the
    // bridge on this machine. A mistyped host would hand the password to a
    // stranger.
    if (!isLoopbackUrl(this.baseUrl)) {
      throw new Error("Refusing to send broker credentials to a non-local host. The MT5 bridge runs on this machine.");
    }
    const payload = await this.send<Mt5ConnectResult>("POST", "/connect", credentials);
    this.session = payload.session ?? null;
    return payload;
  }

  async disconnect(): Promise<unknown> {
    this.session = null;
    return this.send("POST", "/disconnect", {});
  }

  audit(limit = 50): Promise<unknown> {
    return this.send("GET", `/audit?limit=${encodeURIComponent(String(limit))}`);
  }

  /** Session id and dry-run flag ride on every write once `/connect` has run. */
  private writeExtras(options?: Mt5WriteOptions): Record<string, unknown> {
    const extras: Record<string, unknown> = {};
    if (this.session) extras.session = this.session;
    if (options?.dryRun) extras.dry_run = true;
    return extras;
  }

  /** Full request URL, with the token as a query parameter when there is one. */
  private url(path: string): string {
    if (!this.token) return `${this.baseUrl}${path}`;
    // The token rides in the query as well as the header: a custom header
    // turns the request into a preflight, and this local server answers those
    // unreliably.
    const separator = path.includes("?") ? "&" : "?";
    return `${this.baseUrl}${path}${separator}token=${encodeURIComponent(this.token)}`;
  }

  private async send<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    if (this.token && !isLoopbackUrl(this.baseUrl)) {
      throw new Error("Refusing to send MT5 token to a non-local host.");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const init: RequestInit = { method, signal: controller.signal };
    if (method === "POST") {
      // text/plain is a CORS "simple" header: it skips the preflight, which
      // this local server answers unreliably for some browsers. The bridge
      // parses the body as JSON regardless of content type.
      init.headers = { "content-type": "text/plain;charset=UTF-8" };
      init.body = JSON.stringify(body ?? {});
    }
    try {
      const response = await this.fetchFn(this.url(path), init);
      if (!response.ok) {
        if (response.status === 401) this.session = null;
        const detail = await response.text().catch(() => "");
        throw new Error(`MT5 bridge ${method} ${path} → HTTP ${response.status} ${detail}`.trim());
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ---------------------------------------------------------------------------
// MCP (terminal's built-in server)
// ---------------------------------------------------------------------------

class McpTransport implements Mt5Transport {
  private readonly client: McpClient;

  constructor(cfg: Partial<McpConfig>, fetchFn?: McpConfig["fetchFn"]) {
    this.client = new McpClient({
      url: cfg.url ?? DEFAULT_MCP_URL,
      key: cfg.key,
      fetchFn: fetchFn ?? cfg.fetchFn,
      protocolVersion: cfg.protocolVersion,
      clientInfo: cfg.clientInfo,
    });
  }

  ping(): Promise<boolean> {
    return this.client.ping();
  }

  account(): Promise<unknown> {
    return this.client.call(MT5_TOOLS.account);
  }

  openPositions(): Promise<unknown> {
    return this.client.call(MT5_TOOLS.openPositions);
  }

  async deals(from?: number, to?: number): Promise<unknown> {
    const args: Record<string, unknown> = {};
    if (from !== undefined) args.from = from;
    if (to !== undefined) args.to = to;
    return this.client.call(MT5_TOOLS.historyOrders, args);
  }

  marketWatch(): Promise<unknown> {
    return this.client.call(MT5_TOOLS.marketWatch);
  }

  history(request: { symbol: string; resolution: Resolution; from: number; to: number }): Promise<unknown> {
    return this.client.call(MT5_TOOLS.chartHistory, {
      symbol: request.symbol,
      timeframe: toTimeframe(request.resolution),
      from: request.from,
      to: request.to,
    });
  }

  placeOrder(request: OrderRequest, options?: Mt5WriteOptions): Promise<unknown> {
    this.rejectDryRun(options);
    const pending = isPending(request);
    return this.client.call(
      pending ? MT5_TOOLS.pendingOrder : MT5_TOOLS.marketOrder,
      pending ? pendingOrderArgs(request) : marketOrderArgs(request),
    );
  }

  close(symbol: string, qty?: number, options?: Mt5WriteOptions): Promise<unknown> {
    this.rejectDryRun(options);
    return this.client.call(MT5_TOOLS.closePosition, closePositionArgs(symbol, qty));
  }

  cancel(ticket: string, options?: Mt5WriteOptions): Promise<unknown> {
    this.rejectDryRun(options);
    return this.client.call(MT5_TOOLS.deleteOrder, { ticket });
  }

  modify(ticket: string, sl?: number, tp?: number, options?: Mt5WriteOptions): Promise<unknown> {
    this.rejectDryRun(options);
    const args: Record<string, unknown> = { ticket };
    if (sl !== undefined) args.sl = sl;
    if (tp !== undefined) args.tp = tp;
    return this.client.call(MT5_TOOLS.modifySlTp, args);
  }

  /**
   * The MCP server has no dry-run switch: executing anyway would turn a
   * simulated click into a real order, so refuse instead.
   */
  private rejectDryRun(options?: Mt5WriteOptions): void {
    if (options?.dryRun) throw new Error("MT5 MCP transport cannot dry-run; use the local bridge for simulation");
  }
}

export function createTransport(options: TransportOptions = {}): Mt5Transport {
  const fetchFn = options.fetchFn;
  if (options.kind === "mcp") return new McpTransport(options.mcp ?? {}, fetchFn);
  return new BridgeTransport(options.bridgeUrl ?? DEFAULT_BRIDGE_URL, fetchFn, options.bridgeToken);
}
