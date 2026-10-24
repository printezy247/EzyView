import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Node environment: localStorage stubbed by hand (Map pattern shared by
 * journal.test.ts and mt5Accounts.test.ts), restored between tests.
 */

const h = vi.hoisted(() => ({ storage: new Map<string, string>() }));

vi.stubGlobal("localStorage", {
  getItem: (key: string) => h.storage.get(key) ?? null,
  setItem: (key: string, value: string) => void h.storage.set(key, value),
  removeItem: (key: string) => void h.storage.delete(key),
  key: (i: number) => [...h.storage.keys()][i] ?? null,
  get length() {
    return h.storage.size;
  },
});

import {
  BACKUP_KEYS,
  applyWorkspaceBackup,
  dismissParkedCorrupt,
  parkedCorruptKeys,
  parseWorkspaceBackup,
  readWorkspaceBackup,
  serializeWorkspaceBackup,
} from "./workspaceBackup";

beforeEach(() => {
  h.storage.clear();
});

const seedStore = (): void => {
  h.storage.set("ezyview.workspace", JSON.stringify({ layouts: 1 }));
  h.storage.set("ezyview.journal.v1", JSON.stringify({ entries: [] }));
  h.storage.set("ezyview.recentSymbols", JSON.stringify(["BTCUSDT"]));
};

describe("readWorkspaceBackup", () => {
  it("snapshots every backed-up namespace that exists", () => {
    seedStore();
    const backup = readWorkspaceBackup();
    expect(backup.app).toBe("ezyview");
    expect(backup.kind).toBe("workspace-backup");
    expect(backup.version).toBe(1);
    expect(backup.state).toEqual({
      "ezyview.workspace": JSON.stringify({ layouts: 1 }),
      "ezyview.journal.v1": JSON.stringify({ entries: [] }),
      "ezyview.recentSymbols": JSON.stringify(["BTCUSDT"]),
    });
  });

  it("survives an empty store", () => {
    const backup = readWorkspaceBackup();
    expect(backup.state).toEqual({});
  });
});

describe("parseWorkspaceBackup", () => {
  it("round-trips a serialized snapshot", () => {
    seedStore();
    const raw = serializeWorkspaceBackup(readWorkspaceBackup());
    const parsed = parseWorkspaceBackup(raw);
    expect("backup" in parsed ? parsed.backup.state : parsed).toEqual({
      "ezyview.workspace": JSON.stringify({ layouts: 1 }),
      "ezyview.journal.v1": JSON.stringify({ entries: [] }),
      "ezyview.recentSymbols": JSON.stringify(["BTCUSDT"]),
    });
  });

  it("rejects junk, foreign files and future versions", () => {
    expect(parseWorkspaceBackup("{ nope")).toEqual({ error: "Not valid JSON" });
    expect(parseWorkspaceBackup(JSON.stringify({ app: "other" }))).toEqual({
      error: "Not an EzyView workspace backup",
    });
    expect(parseWorkspaceBackup(JSON.stringify({ app: "ezyview", kind: "workspace-backup", version: 2, state: {} }))).toEqual({
      error: "Unsupported backup version: 2",
    });
  });

  it("drops unknown keys from the payload", () => {
    const raw = JSON.stringify({
      app: "ezyview",
      kind: "workspace-backup",
      version: 1,
      createdAt: 1,
      state: { "ezyview.workspace": "{}", evil: "x", "not.ours": "{}" },
    });
    const parsed = parseWorkspaceBackup(raw);
    if (!("backup" in parsed)) throw new Error("expected a backup");
    expect(Object.keys(parsed.backup.state)).toEqual(["ezyview.workspace"]);
  });
});

describe("applyWorkspaceBackup", () => {
  it("restores carried keys and leaves absent namespaces untouched", () => {
    seedStore();
    const backup: ReturnType<typeof readWorkspaceBackup> = {
      app: "ezyview",
      kind: "workspace-backup",
      version: 1,
      createdAt: 1,
      state: { "ezyview.workspace": JSON.stringify({ layouts: 9 }) },
    };
    const result = applyWorkspaceBackup(backup);
    expect(result.applied).toEqual(["ezyview.workspace"]);
    expect(result.absent).toEqual(BACKUP_KEYS.filter((k) => k !== "ezyview.workspace"));
    expect(JSON.parse(h.storage.get("ezyview.workspace")!) as unknown).toEqual({ layouts: 9 });
    // Journal survived: additive restore, not a wipe.
    expect(h.storage.get("ezyview.journal.v1")).toBe(JSON.stringify({ entries: [] }));
  });

  it("parks a corrupt destination value before overwriting it", () => {
    h.storage.set("ezyview.workspace", "{ this is not json");
    const backup = readWorkspaceBackup();
    backup.state = { "ezyview.workspace": JSON.stringify({ layouts: 2 }) };
    applyWorkspaceBackup(backup);
    expect(h.storage.get("ezyview.workspace")).toBe(JSON.stringify({ layouts: 2 }));
    expect(h.storage.get("ezyview.workspace.corrupt")).toBe("{ this is not json");
    expect(parkedCorruptKeys()).toEqual(["ezyview.workspace.corrupt"]);
  });

  it("dismiss removes a parked payload exactly once", () => {
    h.storage.set("ezyview.workspace.corrupt", "old");
    expect(dismissParkedCorrupt("ezyview.workspace.corrupt")).toBe(true);
    expect(dismissParkedCorrupt("ezyview.workspace.corrupt")).toBe(false);
  });
});
