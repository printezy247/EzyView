import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/** Shared doubles: keyring map, fake bridge transport, recorded storage. */
const h = vi.hoisted(() => {
  const keyring = new Map<string, string>();
  const storage = new Map<string, string>();
  const transport: Record<string, Mock> = {
    ping: vi.fn(async () => true),
    account: vi.fn(async () => ({})),
    openPositions: vi.fn(async () => ({ positions: [], orders: [] })),
    deals: vi.fn(async () => ({ deals: [] })),
    marketWatch: vi.fn(async () => ({ symbols: [] })),
    history: vi.fn(async () => ({ rates: [] })),
    placeOrder: vi.fn(async () => ({ ticket: 1 })),
    close: vi.fn(async () => ({ ok: true })),
    cancel: vi.fn(async () => ({ ok: true })),
    modify: vi.fn(async () => ({ ok: true })),
    connect: vi.fn(async () => ({ ok: true, session: "sess-1", login: 4123, server: "S", demo: true, balance: 10000 })),
    disconnect: vi.fn(async () => ({ ok: true })),
    audit: vi.fn(async () => [{ event: "order", result: "done" }]),
  };
  const invoke = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
    const name = String(args?.name ?? "");
    if (cmd === "api_key_get") return keyring.get(name) ?? null;
    if (cmd === "api_key_set") {
      const value = String(args?.value ?? "");
      if (value.trim() === "") keyring.delete(name);
      else keyring.set(name, value);
      return null;
    }
    throw new Error(`unexpected command ${cmd}`);
  });
  return { keyring, storage, transport, invoke };
});

vi.mock("@ezyview/mt5-adapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ezyview/mt5-adapter")>();
  const adapter = { id: "mt5", data: {}, trading: {}, transport: h.transport };
  return { ...actual, createMt5: () => adapter };
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: h.invoke }));

import { RiskRequiredError, accountKindOf, parseAccounts, useMt5Accounts } from "./mt5Accounts";
import { useMt5 } from "./mt5";

function armBrowserLikeEnv(): void {
  const g = globalThis as Record<string, unknown>;
  g.window = { __TAURI_INTERNALS__: {} };
  g.localStorage = {
    getItem: (k: string) => h.storage.get(k) ?? null,
    setItem: (k: string, v: string) => void h.storage.set(k, v),
    removeItem: (k: string) => void h.storage.delete(k),
  };
}

/** A named transport mock, asserted present (the index type alone can't know). */
function mockOf(name: string): Mock {
  const fn = h.transport[name];
  if (!fn) throw new Error(`missing transport mock: ${name}`);
  return fn;
}

function resetState(): void {
  h.keyring.clear();
  h.storage.clear();
  for (const fn of Object.values(h.transport)) if (vi.isMockFunction(fn)) fn.mockClear();
  useMt5Accounts.setState({ accounts: [], session: null, error: null, busy: false });
  useMt5.setState({ source: "ezyview", status: "idle", error: null });
}

describe("addAccount", () => {
  beforeEach(() => {
    armBrowserLikeEnv();
    resetState();
  });

  it("puts the password in the keyring and only metadata in storage", async () => {
    await useMt5Accounts.getState().addAccount({ server: "S", login: "4123", password: "hunter2" });
    expect(h.keyring.get("mt5:4123@S")).toBe("hunter2");
    const blob = h.storage.get("ezyview.mt5.accounts.v1") ?? "";
    expect(blob).not.toContain("hunter2");
    expect(JSON.parse(blob)).toEqual([{ server: "S", login: "4123", demo: false, label: undefined, addedAt: expect.any(Number) }]);
  });

  it("refuses names outside the keyring charset", async () => {
    await expect(
      useMt5Accounts.getState().addAccount({ server: "Bad Server", login: "1", password: "p" }),
    ).rejects.toThrow(/letters, digits/);
  });

  it("refuses the keyring outside the desktop app", async () => {
    delete (globalThis as Record<string, unknown>).window;
    await expect(
      useMt5Accounts.getState().addAccount({ server: "S", login: "1", password: "p" }),
    ).rejects.toThrow(/desktop app/);
  });
});

describe("connect", () => {
  beforeEach(() => {
    armBrowserLikeEnv();
    resetState();
  });

  it("mints a session from the bridge and switches the chart source", async () => {
    const session = await useMt5Accounts.getState().connect({ server: "S", login: "4123", password: "hunter2" });
    expect(h.transport.connect).toHaveBeenCalledWith({ server: "S", login: "4123", password: "hunter2" });
    expect(session.demo).toBe(true);
    expect(useMt5Accounts.getState().session).toMatchObject({ login: "4123", server: "S" });
    expect(useMt5.getState().source).toBe("mt5");
    expect(useMt5.getState().status).toBe("online");
    expect(accountKindOf(session)).toBe("demo");
  });

  it("reads the saved password back from the keyring", async () => {
    h.keyring.set("mt5:4123@S", "saved");
    await useMt5Accounts.getState().connect({ server: "S", login: "4123" });
    expect(h.transport.connect).toHaveBeenCalledWith({ server: "S", login: "4123", password: "saved" });
  });

  it("logs straight back out when a real account declines the risk dialog", async () => {
    mockOf("connect").mockImplementationOnce(async () => ({
      ok: true, session: "sess-r", login: 999, server: "RealCo", demo: false,
    }));
    await expect(
      useMt5Accounts.getState().connect({ server: "RealCo", login: "999", password: "p" }),
    ).rejects.toBeInstanceOf(RiskRequiredError);
    expect(h.transport.disconnect).toHaveBeenCalledTimes(1);
    expect(useMt5Accounts.getState().session).toBeNull();
    expect(useMt5.getState().source).toBe("ezyview");
  });

  it("keeps a real account connected once the risk is accepted", async () => {
    mockOf("connect").mockImplementationOnce(async () => ({
      ok: true, session: "sess-r", login: 999, server: "RealCo", demo: false,
    }));
    const session = await useMt5Accounts.getState().connect({ server: "RealCo", login: "999", password: "p", riskAccepted: true });
    expect(session.demo).toBe(false);
    expect(accountKindOf(session)).toBe("real");
    expect(h.transport.disconnect).not.toHaveBeenCalled();
  });

  it("surfaces a bridge error text and stores nothing", async () => {
    mockOf("connect").mockImplementationOnce(async () => ({ error: "authorization failed (4001)" }));
    await expect(
      useMt5Accounts.getState().connect({ server: "S", login: "1", password: "p" }),
    ).rejects.toThrow(/authorization failed/);
    expect(useMt5Accounts.getState().error).toMatch(/authorization failed/);
    expect(h.storage.get("ezyview.mt5.accounts.v1")).toBeUndefined();
  });

  it("refuses on transports without a credential surface", async () => {
    const saved = mockOf("connect");
    delete h.transport.connect;
    await expect(
      useMt5Accounts.getState().connect({ server: "S", login: "1", password: "p" }),
    ).rejects.toThrow(/bridge transport/);
    h.transport.connect = saved;
  });
});

describe("disconnect / forget", () => {
  beforeEach(() => {
    armBrowserLikeEnv();
    resetState();
  });

  it("disconnect clears the session and revokes outstanding approvals", async () => {
    await useMt5Accounts.getState().connect({ server: "S", login: "4123", password: "p" });
    await useMt5Accounts.getState().disconnect();
    expect(h.transport.disconnect).toHaveBeenCalledTimes(1);
    expect(useMt5Accounts.getState().session).toBeNull();
  });

  it("forget deletes the keyring entry and the metadata row", async () => {
    await useMt5Accounts.getState().addAccount({ server: "S", login: "4123", password: "hunter2" });
    await useMt5Accounts.getState().connect({ server: "S", login: "4123" });
    await useMt5Accounts.getState().forget("S", "4123");
    expect(h.keyring.has("mt5:4123@S")).toBe(false);
    expect(useMt5Accounts.getState().accounts).toEqual([]);
    expect(useMt5Accounts.getState().session).toBeNull();
    expect(JSON.parse(h.storage.get("ezyview.mt5.accounts.v1") ?? "[]")).toEqual([]);
  });
});

describe("fetchAudit", () => {
  beforeEach(() => {
    armBrowserLikeEnv();
    resetState();
  });

  it("returns rows newest-first and swallows transport errors", async () => {
    expect(await useMt5Accounts.getState().fetchAudit()).toEqual([{ event: "order", result: "done" }]);
    mockOf("audit").mockImplementationOnce(async () => {
      throw new Error("bridge down");
    });
    expect(await useMt5Accounts.getState().fetchAudit()).toEqual([]);
  });

  it("is empty on transports without a log", async () => {
    const saved = mockOf("audit");
    delete h.transport.audit;
    expect(await useMt5Accounts.getState().fetchAudit()).toEqual([]);
    h.transport.audit = saved;
  });
});

describe("parseAccounts", () => {
  it("drops malformed rows, including any that smuggle a password", () => {
    const rows = parseAccounts([
      { server: "S", login: "1", demo: true, addedAt: 5 },
      { server: "S", login: "2", password: "hunter2" },
      { server: "", login: "3" },
      "junk",
      null,
    ]);
    expect(rows).toEqual([{ server: "S", login: "1", demo: true, label: undefined, addedAt: 5 }]);
  });
});
