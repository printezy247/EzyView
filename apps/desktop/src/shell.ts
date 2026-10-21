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
export const clearKeyringSecrets = (): Promise<void> => invoke("clear_keyring_secrets");

const NOTIFY_KEY = "ezyview.notify.v1";
const SOUND_KEY = "ezyview.sound.v1";
const VOLUME_KEY = "ezyview.volume.v1";

export function alertSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setAlertSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // ignore
  }
}

export function alertSoundVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY) ?? "0.6");
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.6;
  } catch {
    return 0.6;
  }
}

export function setAlertSoundVolume(vol: number): void {
  try {
    const clamped = Math.min(1, Math.max(0, Number.isFinite(vol) ? vol : 0.6));
    localStorage.setItem(VOLUME_KEY, String(clamped));
  } catch {
    // ignore
  }
}

/** Synthesize a clean two-tone chime via Web Audio API when an alert fires. */
export function playAlertChime(): void {
  if (!alertSoundEnabled()) return;
  try {
    const AudioCtx =
      typeof window !== "undefined"
        ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : undefined;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const vol = alertSoundVolume() * 0.25;
    const now = ctx.currentTime;
    const notes = [587.33, 880]; // D5 -> A5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + i * 0.12);
      gain.gain.setValueAtTime(0.0001, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), now + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.24);
    });
    setTimeout(() => void ctx.close().catch(() => {}), 600);
  } catch {
    // Web Audio unavailable or blocked by autoplay policy
  }
}

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
  playAlertChime();
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
