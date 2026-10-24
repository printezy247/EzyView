/**
 * Settings → Desktop reports whether the bundled MCP stdio server can run:
 * the .mjs sits next to the app when installed, and `node --version` says
 * which runtime would execute it. In the browser (tests, `npm run dev`
 * without Tauri) there is no shell, so the status is simply "not available"
 * and the desktop settings copy it verbatim.
 */

export interface McpRuntimeStatus {
  /** Absolute path the .deb layout puts the server at. */
  serverPath: string;
  serverPresent: boolean;
  /** `v22.3.4` as `node --version` prints it; null when node is absent. */
  nodeVersion: string | null;
  supportedNode: boolean;
}

const inTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Promise problems never break the settings page; null means "unknown". */
export async function fetchMcpRuntimeStatus(invokeFn?: <T>(cmd: string) => Promise<T>): Promise<McpRuntimeStatus | null> {
  if (!inTauri()) return null;
  try {
    const invoke = invokeFn ?? (async <T,>(cmd: string) => {
      const { invoke: call } = await import("@tauri-apps/api/core");
      return call<T>(cmd);
    });
    return await invoke<McpRuntimeStatus>("mcp_runtime_status");
  } catch {
    return null;
  }
}

/**
 * One status line per user state. The wording mirrors the wrapper's error
 * messages and the man page, so "node" advice reads the same everywhere.
 */
export function mcpStatusLine(status: McpRuntimeStatus | null): string {
  if (!status) {
    return "The MCP server runs the bundled stdio server (AI assistants; needs Node.js 22+). Status is only detected in the desktop app.";
  }
  const connectHint = "Connect a client, e.g.: claude mcp add ezyview -- ezyview-mcp";
  if (!status.serverPresent) {
    return `MCP server file not found (${status.serverPath}). The .deb ships it; when running from a checkout, point node at packages/mcp-server/dist/ezyview-mcp.mjs or reinstall the package.`;
  }
  if (!status.nodeVersion) {
    return "The MCP server file is present, but Node.js was not found. Install Node.js 22 or newer (from nodejs.org or a NodeSource repository) and restart EzyView.";
  }
  if (!status.supportedNode) {
    return `The MCP server needs Node.js 22 or newer, but ${status.nodeVersion} is installed. Upgrade Node.js and restart EzyView.`;
  }
  return `MCP server ready (Node ${status.nodeVersion}). ${connectHint}`;
}
