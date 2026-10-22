/**
 * Client for MetaTrader 5's built-in MCP server (Streamable HTTP transport).
 *
 * The terminal ships this itself on 127.0.0.1:22346/mcp with CORS already
 * open, so the renderer talks to it directly — no sidecar process, no Wine
 * shim. Tool names follow MetaQuotes' published capability list.
 */

/** Same signature as `fetch`, narrowed so tests can inject a fake. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface McpConfig {
  /** Endpoint, e.g. "http://127.0.0.1:22346/mcp". */
  url: string;
  /** Bearer token from MT5: Tools → Options → MCP. */
  key?: string;
  fetchFn?: FetchLike;
  protocolVersion?: string;
  clientInfo?: { name: string; version: string };
}

/** Transport or protocol failure. `code` carries the HTTP status when known. */
export class McpError extends Error {
  readonly code: number | undefined;

  constructor(message: string, code?: number) {
    super(message);
    this.name = "McpError";
    this.code = code;
  }
}

const DEFAULT_PROTOCOL = "2025-06-18";
const NOTIFICATIONS = "notifications/initialized";
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * The only hosts that may receive a broker credential or an API key.
 *
 * The bridge and the terminal's MCP server both run on this machine, so a
 * remote host means a typo - or a hostile page asking for the password.
 */
export function isLoopbackUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname;
    return host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number;
  result?: unknown;
  error?: { code?: number; message?: string };
  method?: string;
  params?: unknown;
}

/**
 * One JSON-RPC conversation with the terminal.
 *
 * `initialize` is memoised: the handshake runs once per endpoint, the returned
 * `Mcp-Session-Id` rides every later call, and a dropped session re-handshakes
 * on the next request instead of failing forever.
 */
export class McpClient {
  private cfg: McpConfig;
  private sessionId: string | null = null;
  private ready: Promise<void> | null = null;

  constructor(cfg: McpConfig) {
    this.cfg = cfg;
  }

  /** Point the client at a different endpoint or key; forgets the session. */
  configure(cfg: Partial<McpConfig>): void {
    const next = { ...this.cfg, ...cfg };
    const changed = next.url !== this.cfg.url || next.key !== this.cfg.key;
    this.cfg = next;
    if (changed) {
      this.sessionId = null;
      this.ready = null;
    }
  }

  /** A cheap round trip that reports reachability; never throws. */
  async ping(): Promise<boolean> {
    try {
      await this.connect();
      return true;
    } catch {
      return false;
    }
  }

  /** Runs `initialize` once for the current endpoint. */
  async connect(): Promise<void> {
    if (!this.ready) {
      this.ready = this.handshake().catch((err: unknown) => {
        // Failed handshakes must not be cached as success-in-progress.
        this.ready = null;
        throw err;
      });
    }
    return this.ready;
  }

  /** Invokes a server tool and returns its decoded payload. */
  async call<T>(tool: string, args: Record<string, unknown> = {}): Promise<T> {
    await this.connect();
    const raw = await this.request({
      jsonrpc: "2.0",
      id: nextId(),
      method: "tools/call",
      params: { name: tool, arguments: args },
    });
    if (raw.error) throw new McpError(raw.error.message ?? `${tool} failed`);
    return decodeToolResult(raw.result) as T;
  }

  private async handshake(): Promise<void> {
    const init = await this.request({
      jsonrpc: "2.0",
      id: nextId(),
      method: "initialize",
      params: {
        protocolVersion: this.cfg.protocolVersion ?? DEFAULT_PROTOCOL,
        capabilities: {},
        clientInfo: this.cfg.clientInfo ?? { name: "EzyView", version: "0.1.0" },
      },
    });
    if (init.error) throw new McpError(init.error.message ?? "initialize rejected");
    // Best effort: some servers are happy without the ready notification.
    await this.request({ jsonrpc: "2.0", method: NOTIFICATIONS }).catch(() => undefined);
  }

  private async request(message: JsonRpcMessage): Promise<JsonRpcMessage> {
    const url = this.cfg.url;
    if (this.cfg.key && !isLoopbackUrl(url)) {
      throw new McpError("Refusing to send the MT5 key to a non-local host. The built-in MCP server runs on this machine.");
    }
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": this.cfg.protocolVersion ?? DEFAULT_PROTOCOL,
    };
    if (this.cfg.key) headers.authorization = `Bearer ${this.cfg.key}`;
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;

    const fetchFn: FetchLike = this.cfg.fetchFn ?? ((input, init) => fetch(input, init));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetchFn(url, {
        method: "POST",
        headers,
        redirect: "error",
        body: JSON.stringify(message),
        signal: controller.signal,
      });
    } catch (err) {
      throw new McpError(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
    }

    const session = response.headers?.get?.("mcp-session-id");
    if (session && session.length <= 256 && /^[\x21-\x7E]+$/.test(session)) {
      this.sessionId = session;
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        this.sessionId = null;
        this.ready = null;
      }
      if (response.status === 401) {
        throw new McpError(
          "MetaTrader rejected the MCP key. Copy the current one from Tools → Options → MCP.",
          401,
        );
      }
      throw new McpError(`MCP HTTP ${response.status}`, response.status);
    }

    const text = await response.text();
    if (!text.trim()) return { jsonrpc: "2.0" };
    return parseEnvelope(text);
  }
}

/** SSE frames and bare JSON both arrive here; both carry the same message. */
function parseEnvelope(text: string): JsonRpcMessage {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return asMessage(trimmed);

  for (const line of trimmed.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (payload) return asMessage(payload);
  }
  throw new McpError("Unreadable MCP response");
}

function asMessage(text: string): JsonRpcMessage {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null) throw new McpError("Bad MCP message");
  return parsed as JsonRpcMessage;
}

/**
 * `tools/call` answers with MCP content blocks; MT5's JSON payload rides in
 * the first text block, so consumers get plain data either way.
 *
 * Tool-level failures arrive as `isError` content rather than a protocol
 * error, and are re-raised so callers see one failure shape.
 */
function decodeToolResult(result: unknown): unknown {
  if (typeof result !== "object" || result === null) return result;
  const record = result as Record<string, unknown>;

  const text = firstText(record);
  if (text !== null) {
    if (record.isError === true) throw new McpError(text);
    try {
      return JSON.parse(text);
    } catch {
      // Servers occasionally answer with a bare sentence; keep it usable.
      return text;
    }
  }
  return result;
}

/** The first text block of an MCP `content` array, or of a bare `{text}`. */
function firstText(record: Record<string, unknown>): string | null {
  const content = record.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block !== "object" || block === null) continue;
      const value = (block as Record<string, unknown>).text;
      if (typeof value === "string") return value;
    }
    return null;
  }
  return typeof record.text === "string" ? record.text : null;
}

let counter = 0;
function nextId(): number {
  counter += 1;
  return counter;
}
