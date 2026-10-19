import { create } from "zustand";
import type { ApiKeyName, ApiKeys } from "@ezyview/fundamentals";

/** True inside the Tauri shell, where the OS keyring is reachable. */
export const keyringAvailable = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const API_KEY_NAMES: ApiKeyName[] = ["finnhub", "alphavantage"];

/**
 * Read provider keys from the OS keyring via the Rust side. Keys are held in
 * memory only; they are never written to localStorage or any file.
 */
export async function loadApiKeys(): Promise<ApiKeys> {
  if (!keyringAvailable()) return {};
  const { invoke } = await import("@tauri-apps/api/core");
  const entries = await Promise.all(
    API_KEY_NAMES.map(async (name) => [name, await invoke<string | null>("api_key_get", { name })] as const),
  );
  return Object.fromEntries(entries);
}

/** Save a key to the OS keyring; an empty value removes it. */
export async function saveApiKey(name: ApiKeyName, value: string): Promise<void> {
  if (!keyringAvailable()) throw new Error("API keys can only be stored in the EzyView desktop app.");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("api_key_set", { name, value });
}

interface ApiKeysState {
  keys: ApiKeys;
  /** Set when the keyring could not be read (e.g. no Secret Service running). */
  error: string | null;
  dialogOpen: boolean;
  reload: () => Promise<void>;
  openDialog: () => void;
  closeDialog: () => void;
}

/** Keys shared by the menu, command palette, settings dialog and fundamentals panel. */
export const useApiKeys = create<ApiKeysState>((set) => ({
  keys: {},
  error: null,
  dialogOpen: false,
  reload: async () => {
    try {
      set({ keys: await loadApiKeys(), error: null });
    } catch (err) {
      set({ error: `Could not read the system keyring: ${String(err)}` });
    }
  },
  openDialog: () => set({ dialogOpen: true }),
  closeDialog: () => set({ dialogOpen: false }),
}));
