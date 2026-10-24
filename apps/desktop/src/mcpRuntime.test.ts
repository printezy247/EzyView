import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { fetchMcpRuntimeStatus, mcpStatusLine } from "./mcpRuntime";
import type { McpRuntimeStatus } from "./mcpRuntime";

/**
 * Node environment: Tauri is faked the way mt5Accounts.test.ts does it
 * (window swap + a module mock), restored between tests.
 */
const h = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: h.invoke }));

const status = (over: Partial<McpRuntimeStatus> = {}): McpRuntimeStatus => ({
  serverPath: "/usr/lib/EzyView/mcp/ezyview-mcp.mjs",
  serverPresent: true,
  nodeVersion: "v22.3.4",
  supportedNode: true,
  ...over,
});

function armBrowserEnv(): void {
  (globalThis as Record<string, unknown>).window = {};
}
function armTauriEnv(): void {
  (globalThis as Record<string, unknown>).window = { __TAURI_INTERNALS__: {} };
}

afterEach(() => {
  h.invoke.mockReset();
});

describe("mcpStatusLine", () => {
  it("describes the ready state with the connect command", () => {
    expect(mcpStatusLine(status())).toBe(
      "MCP server ready (Node v22.3.4). Connect a client, e.g.: claude mcp add ezyview -- ezyview-mcp",
    );
  });

  it("tells users what to install when node is missing", () => {
    const line = mcpStatusLine(status({ nodeVersion: null, supportedNode: false }));
    expect(line).toContain("Node.js was not found");
    expect(line).toContain("22");
  });

  it("names the too-old runtime when node is older than 22", () => {
    const line = mcpStatusLine(status({ nodeVersion: "v18.20.0", supportedNode: false }));
    expect(line).toContain("v18.20.0 is installed");
    expect(line).toContain("22 or newer");
  });

  it("points at the bundled file when it is not on disk", () => {
    const line = mcpStatusLine(status({ serverPresent: false }));
    expect(line).toContain("not found");
    expect(line).toContain("ezyview-mcp.mjs");
  });

  it("marks the browser as unknown rather than guessing", () => {
    expect(mcpStatusLine(null)).toContain("detected in the desktop app");
  });
});

describe("fetchMcpRuntimeStatus", () => {
  it("returns null in the browser without calling invoke", async () => {
    armBrowserEnv();
    const invokeFn: Mock = vi.fn();
    await expect(fetchMcpRuntimeStatus(invokeFn as never)).resolves.toBeNull();
    expect(invokeFn).not.toHaveBeenCalled();
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it("surfaces the command result under Tauri", async () => {
    armTauriEnv();
    h.invoke.mockResolvedValue(status());
    await expect(fetchMcpRuntimeStatus()).resolves.toEqual(status());
    expect(h.invoke).toHaveBeenCalledWith("mcp_runtime_status");
  });

  it("resolves null instead of throwing when the command fails", async () => {
    armTauriEnv();
    h.invoke.mockRejectedValue(new Error("boom"));
    await expect(fetchMcpRuntimeStatus()).resolves.toBeNull();
  });
});
