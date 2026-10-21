/**
 * Update check against GitHub Releases. Notify-only: it reports a newer
 * published version and links to the release page; installing stays a manual
 * download until a signing key is set up for the Tauri updater.
 */
import { notifyNative } from "./shell";

const RELEASES_URL = "https://api.github.com/repos/printezy247/EzyView/releases/latest";
const LAST_CHECK_KEY = "ezyview.updatecheck.v1";
const DAY_MS = 24 * 60 * 60 * 1000;

/** `v1.2.3` / `1.2.3-beta` → [1, 2, 3]; null when it is not a version. */
export function parseVersion(tag: string): [number, number, number] | null {
  const m = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})(?:[-+].*)?$/.exec(tag.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function isNewer(current: string, latest: string): boolean {
  const a = parseVersion(current);
  const b = parseVersion(latest);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (b[i]! !== a[i]!) return b[i]! > a[i]!;
  }
  return false;
}

export type UpdateResult =
  | { kind: "current"; version: string }
  | { kind: "available"; version: string; url: string }
  | { kind: "none" }
  | { kind: "error"; message: string };

const inTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function currentVersion(): Promise<string> {
  if (!inTauri()) return "0.0.0";
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("plugin:app|version");
}

/** Only ever link to the project's own release pages. */
export const isReleaseUrl = (url: unknown): url is string =>
  typeof url === "string" && url.startsWith("https://github.com/printezy247/EzyView/");

export async function checkForUpdate(fetcher: typeof fetch = fetch): Promise<UpdateResult> {
  try {
    const res = await fetcher(RELEASES_URL, { headers: { Accept: "application/vnd.github+json" } });
    if (res.status === 404) return { kind: "none" };
    if (!res.ok) return { kind: "error", message: `GitHub answered ${res.status}` };
    const body = (await res.json()) as { tag_name?: unknown; html_url?: unknown };
    const tag = typeof body.tag_name === "string" ? body.tag_name : "";
    if (!parseVersion(tag)) return { kind: "none" };
    const current = await currentVersion();
    if (isNewer(current, tag) && isReleaseUrl(body.html_url)) {
      return { kind: "available", version: tag.replace(/^v/, ""), url: body.html_url };
    }
    return { kind: "current", version: current };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

export async function openReleasePage(url: string): Promise<void> {
  if (!isReleaseUrl(url)) return;
  if (inTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("plugin:opener|open_url", { url });
  } else {
    window.open(url, "_blank", "noopener");
  }
}

/** Once a day at start: if a newer release exists, say so in a system notification. */
export async function checkOnStartup(): Promise<void> {
  try {
    const last = Number(localStorage.getItem(LAST_CHECK_KEY) ?? 0);
    if (Date.now() - last < DAY_MS) return;
    localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
  } catch {
    return;
  }
  const result = await checkForUpdate();
  if (result.kind === "available") {
    void notifyNative("EzyView update available", `Version ${result.version} is out. Settings → Desktop → Check for updates.`);
  }
}
