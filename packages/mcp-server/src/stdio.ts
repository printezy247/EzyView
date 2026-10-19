import { createInterface } from "node:readline";
import { handleMessage } from "./server.js";
import type { RpcRequest } from "./server.js";

/** Newline-delimited JSON-RPC over stdio, the MCP stdio transport. stdout is protocol-only. */
const lines = createInterface({ input: process.stdin });

lines.on("line", (line) => {
  if (!line.trim()) return;
  let msg: RpcRequest;
  try {
    msg = JSON.parse(line) as RpcRequest;
  } catch {
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
    return;
  }
  void handleMessage(msg).then((reply) => {
    if (reply) process.stdout.write(`${JSON.stringify(reply)}\n`);
  });
});
