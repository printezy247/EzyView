import type { Resolution } from "@ezyview/data-adapters";

/** True inside the Tauri shell; false in a plain browser (dev server, web build). */
const inTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Query string a detached chart window is opened with. */
export function detachedQuery(symbol: string, resolution: Resolution): string {
  return `?detached=${encodeURIComponent(symbol)}&res=${encodeURIComponent(resolution)}`;
}

/** Read the detached-window parameters, or null for the main window. */
export function readDetached(search: string): { symbol: string; resolution: Resolution } | null {
  const params = new URLSearchParams(search);
  const symbol = params.get("detached");
  if (!symbol) return null;
  return { symbol, resolution: (params.get("res") ?? "1h") as Resolution };
}

/** Open the chart in its own OS window, so it can be dragged to another monitor. */
export async function openChartWindow(symbol: string, resolution: Resolution): Promise<void> {
  const query = detachedQuery(symbol, resolution);
  if (!inTauri()) {
    window.open(`${window.location.pathname}${query}`, "_blank", "popup,width=1100,height=700");
    return;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("open_chart_window", { query });
}
