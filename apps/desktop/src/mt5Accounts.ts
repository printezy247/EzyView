import { create } from "zustand";
import type { Mt5ConnectResult } from "@ezyview/mt5-adapter";
import { keyringAvailable } from "./apiKeys";
import { getMt5, useMt5 } from "./mt5";
import { DEFAULT_SAFETY, approvalTokens, mt5KeyringName, parseSafety } from "./tradingSafety";
import type { AccountKind, SafetyConfig } from "./tradingSafety";

/**
 * Saved broker accounts and the live session (Phase 1).
 *
 * Passwords go to the OS keyring under `mt5:<login>@<server>`; localStorage
 * keeps only the metadata needed to list and reconnect. The bridge-minted
 * session id and the account summary stay in memory — never on disk.
 */

export interface SavedAccount {
  server: string;
  login: string;
  /** True when the last connect reported a demo trade mode. */
  demo: boolean;
  label?: string;
  addedAt: number;
}

export interface Mt5Session {
  server: string;
  login: string;
  demo: boolean;
  summary: Mt5ConnectResult;
}

/** Thrown when a real account needs the user's explicit risk acceptance. */
export class RiskRequiredError extends Error {
  readonly code = "real_account_risk";
  constructor(public readonly summary: Mt5ConnectResult) {
    super("This is a real-money account. Confirm you understand before EzyView connects.");
    this.name = "RiskRequiredError";
  }
}

const ACCOUNTS_KEY = "ezyview.mt5.accounts.v1";
const SAFETY_KEY = "ezyview.mt5.safety.v1";

function storageAvailable(): boolean {
  return typeof localStorage !== "undefined";
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** Guarded read: a corrupt blob yields no accounts, never a crash. */
export function parseAccounts(raw: unknown): SavedAccount[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedAccount[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const candidate = item as Record<string, unknown>;
    if (!isText(candidate.server) || !isText(candidate.login)) continue;
    if (typeof candidate.password === "string") continue; // a blob with a password is not metadata
    out.push({
      server: candidate.server.trim(),
      login: candidate.login.trim(),
      demo: candidate.demo === true,
      label: isText(candidate.label) ? candidate.label.trim() : undefined,
      addedAt: typeof candidate.addedAt === "number" && Number.isFinite(candidate.addedAt) ? candidate.addedAt : Date.now(),
    });
  }
  return out;
}

function readAccounts(): SavedAccount[] {
  if (!storageAvailable()) return [];
  try {
    return parseAccounts(JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? "null"));
  } catch {
    return [];
  }
}

function writeAccounts(accounts: SavedAccount[]): void {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    // Private mode: the list lives for this session only.
  }
}

function readSafety(): SafetyConfig {
  if (!storageAvailable()) return DEFAULT_SAFETY;
  try {
    return parseSafety(JSON.parse(localStorage.getItem(SAFETY_KEY) ?? "null"));
  } catch {
    return DEFAULT_SAFETY;
  }
}

async function keyringSet(name: string, value: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("api_key_set", { name, value });
}

async function keyringGet(name: string): Promise<string | null> {
  const { invoke } = await import("@tauri-apps/api/core");
  return (await invoke<string | null>("api_key_get", { name })) ?? null;
}

export interface Mt5AccountsState {
  accounts: SavedAccount[];
  session: Mt5Session | null;
  safety: SafetyConfig;
  busy: boolean;
  error: string | null;

  /** Update and persist the safety rails. */
  saveSafety(patch: Partial<SafetyConfig>): void;
  /** Store the password in the keyring and remember the metadata (no password). */
  addAccount(input: { server: string; login: string; password: string; label?: string }): Promise<SavedAccount>;
  /**
   * Log in through the bridge. `password` is required the first time; later
   * calls read it back from the keyring. Real accounts throw a
   * `RiskRequiredError` unless `riskAccepted` — the bridge is logged out again
   * before the throw.
   */
  connect(input: { server: string; login: string; password?: string; riskAccepted?: boolean }): Promise<Mt5Session>;
  disconnect(): Promise<void>;
  /** Forget an account: keyring entry deleted, metadata dropped, session closed if it was this one. */
  forget(server: string, login: string): Promise<void>;
  /** Recent bridge audit rows; empty on transports without a log. */
  fetchAudit(limit?: number): Promise<Record<string, unknown>[]>;
  clearError(): void;
}


export const useMt5Accounts = create<Mt5AccountsState>((set, get) => ({
  accounts: readAccounts(),
  session: null,
  safety: readSafety(),
  busy: false,
  error: null,

  saveSafety(patch) {
    const safety = { ...get().safety, ...patch };
    if (storageAvailable()) {
      try {
        localStorage.setItem(SAFETY_KEY, JSON.stringify(safety));
      } catch {
        // session-only
      }
    }
    set({ safety });
  },

  async addAccount({ server, login, password, label }) {
    const s = server.trim();
    const l = login.trim();
    const name = mt5KeyringName(s, l);
    if (!name) throw new Error("Server and login may only use letters, digits and . _ + -");
    if (!keyringAvailable()) throw new Error("Broker passwords need the EzyView desktop app (OS keyring).");
    set({ busy: true, error: null });
    try {
      await keyringSet(name, password);
      const account: SavedAccount = { server: s, login: l, demo: false, label: label?.trim() || undefined, addedAt: Date.now() };
      const rest = get().accounts.filter((a) => !(a.server === s && a.login === l));
      const accounts = [...rest, account];
      writeAccounts(accounts);
      set({ accounts });
      return account;
    } finally {
      set({ busy: false });
    }
  },

  async connect({ server, login, password, riskAccepted }) {
    const transport = getMt5().transport;
    if (typeof transport.connect !== "function") {
      throw new Error("In-app broker login needs the local bridge transport (Settings → MT5 → bridge).");
    }
    const s = server.trim();
    const l = login.trim();
    const name = mt5KeyringName(s, l);
    if (!name) throw new Error("Server and login may only use letters, digits and . _ + -");
    set({ busy: true, error: null });
    try {
      let secret = password;
      if (secret === undefined) {
        if (!keyringAvailable()) throw new Error("Open EzyView on the desktop to use the saved password.");
        secret = (await keyringGet(name)) ?? undefined;
        if (!secret) throw new Error(`No stored password for ${l} on ${s} — re-enter it.`);
      }
      const summary = await transport.connect({ server: s, login: l, password: secret });
      if (summary.error) throw new Error(summary.error);
      const demo = summary.demo === true;
      if (!demo && !riskAccepted) {
        await transport.disconnect?.().catch(() => undefined);
        approvalTokens.revokeAll();
        set({ session: null });
        throw new RiskRequiredError(summary);
      }
      const session: Mt5Session = {
        server: s,
        login: String(summary.login ?? l),
        demo,
        summary,
      };
      const known = get().accounts.find((a) => a.server === s && a.login === l);
      const accounts: SavedAccount[] = [
        ...get().accounts.filter((a) => !(a.server === s && a.login === l)),
        { server: s, login: l, demo, label: known?.label, addedAt: known?.addedAt ?? Date.now() },
      ];
      writeAccounts(accounts);
      set({ session, accounts });
      await useMt5.getState().setSource("mt5");
      return session;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      throw err;
    } finally {
      set({ busy: false });
    }
  },

  async disconnect() {
    set({ busy: true });
    try {
      await getMt5().transport.disconnect?.();
    } catch {
      // The bridge may already be gone; the client state still clears.
    }
    approvalTokens.revokeAll();
    set({ session: null, busy: false });
  },

  async forget(server, login) {
    const s = server.trim();
    const l = login.trim();
    const name = mt5KeyringName(s, l);
    if (name && keyringAvailable()) {
      await keyringSet(name, "").catch(() => undefined);
    }
    const accounts = get().accounts.filter((a) => !(a.server === s && a.login === l));
    writeAccounts(accounts);
    const wasCurrent = get().session?.server === s && get().session?.login === l;
    if (wasCurrent) await get().disconnect();
    set({ accounts });
  },

  async fetchAudit(limit = 50) {
    const transport = getMt5().transport;
    if (typeof transport.audit !== "function") return [];
    try {
      const rows = await transport.audit(limit);
      return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
    } catch {
      return [];
    }
  },

  clearError() {
    set({ error: null });
  },
}));

/** The rail input for `gateAction`: what kind of account the session is on. */
export function accountKindOf(session: Mt5Session | null): AccountKind {
  if (!session) return "unknown";
  return session.demo ? "demo" : "real";
}
