export { Mt5MarketData, Mt5Trading, createMt5 } from "./adapter";
export type { Mt5Adapter } from "./adapter";
export { DEFAULT_BRIDGE_URL, DEFAULT_MCP_URL, createTransport } from "./transport";
export type { Mt5Transport, TransportKind, TransportOptions } from "./transport";
export { McpClient, McpError } from "./mcp";
export type { McpConfig, FetchLike } from "./mcp";
export {
  MT5_TOOLS,
  asRecord,
  closePositionArgs,
  inferAssetClass,
  isPending,
  marketOrderArgs,
  pendingOrderArgs,
  toAccount,
  toCandles,
  toDeals,
  toOrders,
  toPositions,
  toQuote,
  toSymbols,
  toTimeframe,
} from "./map";
