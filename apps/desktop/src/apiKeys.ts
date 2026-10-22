import { create } from "zustand";
import type { ApiKeyName } from "@ezyview/fundamentals";

/** True inside the Tauri shell, where the OS keyring is reachable. */
export const keyringAvailable = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Keyring names the UI manages: the fundamentals keys plus the Twelve Data live-price key. */
export type KeyName = ApiKeyName | "twelvedata";
export type StoredKeys = Partial<Record<KeyName, string | null>>;

export const API_KEY_NAMES: KeyName[] = ["finnhub", "alphavantage", "twelvedata"];

/** Read one key from the keyring; null when unset, unreadable or outside the Tauri shell. */
export async function readApiKey(name: string): Promise<string | null> {
  if (!keyringAvailable()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return (await invoke<string | null>("api_key_get", { name })) || null;
  } catch {
    return null;
  }
}

/**
 * Read provider keys from the OS keyring via the Rust side. Keys are held in
 * memory only; they are never written to localStorage or any file.
 */
export async function loadApiKeys(): Promise<StoredKeys> {
  if (!keyringAvailable()) return {};
  const { invoke } = await import("@tauri-apps/api/core");
  // A name the Rust side does not know yet must not hide the other keys.
  const entries = await Promise.all(
    API_KEY_NAMES.map(
      async (name) => [name, await invoke<string | null>("api_key_get", { name }).catch(() => null)] as const,
    ),
  );
  return Object.fromEntries(entries);
}

/** Save a key to the OS keyring; an empty value removes it. */
export async function saveApiKey(name: KeyName, value: string): Promise<void> {
  if (!keyringAvailable()) throw new Error("API keys can only be stored in the EzyView desktop app.");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("api_key_set", { name, value });
}

interface ApiKeysState {
  keys: StoredKeys;
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
