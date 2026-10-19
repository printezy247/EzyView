import { create } from "zustand";
import { DEFAULT_BRIDGE_URL, DEFAULT_MCP_URL, createMt5 } from "@ezyview/mt5-adapter";
import type { Mt5Adapter, TransportKind } from "@ezyview/mt5-adapter";

/**
 * Chart price source and the MT5 connection behind it.
 *
 * `"ezyview"` is the bundled demo feed (always available); `"mt5"` routes the
 * chart, the ticket and the trading panel through the local bridge, which
 * attaches to the user's running terminal.
 */
export type ChartSource = "ezyview" | "mt5";

export type Mt5Status = "idle" | "connecting" | "online" | "error";

export interface Mt5Settings {
  kind: TransportKind;
  bridgeUrl: string;
  mcpUrl: string;
  mcpKey: string;
}

const STORAGE_KEY = "ezyview.mt5.v1";

const DEFAULT_SETTINGS: Mt5Settings = {
  kind: "bridge",
  bridgeUrl: DEFAULT_BRIDGE_URL,
  mcpUrl: DEFAULT_MCP_URL,
  mcpKey: "",
};

interface Persisted extends Partial<Mt5Settings> {
  source?: ChartSource;
}

function readSettings(): { settings: Mt5Settings; source: ChartSource } {
  if (typeof localStorage === "undefined") return { settings: DEFAULT_SETTINGS, source: "ezyview" };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { settings: DEFAULT_SETTINGS, source: "ezyview" };
    const parsed = JSON.parse(raw) as Persisted;
    return {
      settings: { ...DEFAULT_SETTINGS, ...parsed },
      source: parsed.source === "mt5" ? "mt5" : "ezyview",
    };
  } catch {
    return { settings: DEFAULT_SETTINGS, source: "ezyview" };
  }
}

function persist(settings: Mt5Settings, source: ChartSource): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, source }));
  } catch {
    // Private mode: the choice lives for this session only.
  }
}

function build(settings: Mt5Settings): Mt5Adapter {
  return createMt5({
    kind: settings.kind,
    bridgeUrl: settings.bridgeUrl,
    mcp: { url: settings.mcpUrl, key: settings.mcpKey || undefined },
  });
}

const boot = readSettings();

/**
 * The adapter singleton.
 *
 * Rebuilt when settings change rather than mutated, so a saved endpoint/key
 * always takes effect on the next call — no stale session to reset.
 */
let instance: Mt5Adapter | null = null;

export function getMt5(): Mt5Adapter {
  if (!instance) instance = build(boot.settings);
  return instance;
}

export interface Mt5State {
  source: ChartSource;
  status: Mt5Status;
  error: string | null;
  settings: Mt5Settings;
  /** Switch the chart/ticket feed; probes MT5 when turning it on. */
  setSource(source: ChartSource): Promise<void>;
  /** Persist connection settings and re-probe with them. */
  save(settings: Partial<Mt5Settings>): Promise<void>;
  probe(): Promise<boolean>;
  clearError(): void;
}

export const useMt5 = create<Mt5State>((set, get) => ({
  source: boot.source,
  status: "idle",
  error: null,
  settings: boot.settings,

  async probe() {
    set({ status: "connecting", error: null });
    const ok = await getMt5().transport.ping();
    if (ok) {
      set({ status: "online", error: null });
      return true;
    }
    set({
      status: "error",
      error:
        get().settings.kind === "bridge"
          ? `No MT5 bridge on ${get().settings.bridgeUrl} — start tools/mt5-bridge.`
          : `MT5 MCP at ${get().settings.mcpUrl} refused the connection.`,
    });
    return false;
  },

  async setSource(source) {
    persist(get().settings, source);
    if (source === "ezyview") {
      set({ source, status: "idle", error: null });
      return;
    }
    set({ source });
    const ok = await get().probe();
    // Falling back keeps the chart alive if the terminal is not there.
    if (!ok) {
      set({ source: "ezyview" });
      persist(get().settings, "ezyview");
    }
  },

  async save(patch) {
    const settings = { ...get().settings, ...patch };
    instance = build(settings);
    persist(settings, get().source);
    set({ settings, status: "idle", error: null });
    if (get().source === "mt5") await get().probe();
  },

  clearError() {
    set({ error: null });
  },
}));

/** Called once on boot: honour a remembered broker feed if MT5 answers. */
export async function bootstrapMt5(): Promise<void> {
  if (useMt5.getState().source !== "mt5") return;
  const ok = await useMt5.getState().probe();
  if (!ok) useMt5.setState({ source: "ezyview" });
}
