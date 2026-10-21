import { createInterface } from "node:readline";
import { handleMessage } from "./server.js";

export const MAX_LINE_BYTES = 1_048_576; // 1 MB cap per JSON-RPC line

const safeWrite = (text: string): void => {
  try {
    process.stdout.write(text, () => {});
  } catch {
    // Ignore broken pipe / closed stdout
  }
};

process.stdout.on("error", () => {
  // Prevent unhandled EPIPE crash when MCP host closes stdout
});

/** Newline-delimited JSON-RPC over stdio, the MCP stdio transport. stdout is protocol-only. */
const lines = createInterface({ input: process.stdin });

lines.on("line", (line) => {
  if (!line.trim()) return;
  if (Buffer.byteLength(line, "utf8") > MAX_LINE_BYTES) {
    safeWrite(
      `${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } })}\n`,
    );
    return;
  }
  let msg: unknown;
  try {
    msg = JSON.parse(line);
  } catch {
    safeWrite(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
    return;
  }
  void handleMessage(msg)
    .then((reply) => {
      if (reply) safeWrite(`${JSON.stringify(reply)}\n`);
    })
    .catch(() => {
      safeWrite(
        `${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } })}\n`,
      );
    });
});

lines.on("close", () => {
  process.exit(0);
});
