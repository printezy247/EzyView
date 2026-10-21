/**
 * Desktop shell controls (Phase 9): hardware acceleration, proxy, restart,
 * factory reset and native notifications. Settings that need the process to
 * restart live in a JSON file Rust reads before the webview starts; everything
 * here is a thin, never-throwing wrapper over those commands.
 */

export interface ShellSettings {
  /** false = GPU compositing off. null = leave the system default. */
  hardwareAcceleration: boolean | null;
  proxy: string;
}

export const DEFAULT_SHELL_SETTINGS: ShellSettings = { hardwareAcceleration: null, proxy: "" };

/** Mirrors the Rust check: empty, or http(s)/socks5 with no whitespace. */
export function validateProxy(proxy: string): boolean {
  if (proxy === "") return true;
  return (
    proxy.length <= 256 &&
    /^(https?|socks5):\/\//.test(proxy) &&
    // eslint-disable-next-line no-control-regex
    !/[\s\u0000-\u001f]/.test(proxy)
  );
}

const inTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: call } = await import("@tauri-apps/api/core");
  return call<T>(cmd, args);
}

export async function loadShellSettings(): Promise<ShellSettings> {
  if (!inTauri()) return DEFAULT_SHELL_SETTINGS;
  try {
    const raw = await invoke<Partial<ShellSettings>>("get_shell_settings");
    return { hardwareAcceleration: raw.hardwareAcceleration ?? null, proxy: raw.proxy ?? "" };
  } catch {
    return DEFAULT_SHELL_SETTINGS;
  }
}

/** Resolves with an error message, or null when saved. */
export async function saveShellSettings(settings: ShellSettings): Promise<string | null> {
  if (!validateProxy(settings.proxy)) return "Proxy must start with http://, https:// or socks5:// and contain no spaces.";
  if (!inTauri()) return "Shell settings apply to the desktop app only.";
  try {
    await invoke("set_shell_settings", { settings });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export const relaunchApp = (): Promise<void> => invoke("relaunch_app");
export const factoryReset = (): Promise<void> => invoke("factory_reset");

const NOTIFY_KEY = "ezyview.notify.v1";

export function nativeNotificationsEnabled(): boolean {
  try {
    return localStorage.getItem(NOTIFY_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setNativeNotifications(on: boolean): void {
  try {
    localStorage.setItem(NOTIFY_KEY, on ? "on" : "off");
  } catch {
    // Storage blocked: the toggle just won't persist.
  }
}

/**
 * System notification for a fired alert. Asks for permission once, falls back
 * to the web Notification API in a browser, and never throws: a denied or
 * missing notification service must not break the alert feed.
 */
export async function notifyNative(title: string, body: string): Promise<boolean> {
  if (!nativeNotificationsEnabled()) return false;
  try {
    if (inTauri()) {
      let granted = await invoke<boolean>("plugin:notification|is_permission_granted");
      if (!granted) granted = (await invoke<string>("plugin:notification|request_permission")) === "granted";
      if (!granted) return false;
      await invoke("plugin:notification|notify", { options: { title, body } });
      return true;
    }
    if (typeof Notification === "undefined") return false;
    if (Notification.permission === "default") await Notification.requestPermission();
    if (Notification.permission !== "granted") return false;
    const shown = new Notification(title, { body });
    shown.addEventListener("click", () => window.focus());
    return true;
  } catch {
    return false;
  }
}
