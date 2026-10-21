/**
 * Crash log + perf sampling (Phase 9 reliability).
 *
 * Everything stays on the machine: under Tauri the log is a capped file in the
 * app data folder (Rust `append_log` / `read_log` / `clear_log`); in a plain
 * browser it falls back to a small localStorage ring. Nothing is sent anywhere.
 */

export const LOG_CAP_BYTES = 256 * 1024;
const LS_KEY = "ezyview.crashlog.v1";

const inTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** One log block: ISO time, kind, message and (optional) stack. */
export function formatCrash(kind: string, error: unknown, now: Date = new Date()): string {
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : JSON.stringify(error));
  const stack = err.stack && err.stack !== err.message ? `\n${err.stack}` : "";
  return `[${now.toISOString()}] ${kind}: ${err.message}${stack}\n`;
}

/** Keep the newest `cap` characters, cutting at a line start so no block is split mid-line. */
export function trimLog(text: string, cap: number = LOG_CAP_BYTES): string {
  if (text.length <= cap) return text;
  const tail = text.slice(text.length - cap);
  const cut = tail.indexOf("\n");
  return cut === -1 ? tail : tail.slice(cut + 1);
}

export async function appendCrash(block: string): Promise<void> {
  try {
    if (inTauri()) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("append_log", { text: block });
      return;
    }
    localStorage.setItem(LS_KEY, trimLog(`${localStorage.getItem(LS_KEY) ?? ""}${block}`));
  } catch {
    // Logging must never raise its own error.
  }
}

export async function readCrashLog(): Promise<string> {
  try {
    if (inTauri()) {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<string>("read_log");
    }
    return localStorage.getItem(LS_KEY) ?? "";
  } catch {
    return "";
  }
}

export async function clearCrashLog(): Promise<void> {
  try {
    if (inTauri()) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("clear_log");
    } else {
      localStorage.removeItem(LS_KEY);
    }
  } catch {
    // Nothing to clear.
  }
}

const onError = (e: ErrorEvent) => void appendCrash(formatCrash("error", e.error ?? e.message));
const onRejection = (e: PromiseRejectionEvent) => void appendCrash(formatCrash("unhandledrejection", e.reason));

/** Record uncaught errors and unhandled promise rejections. Returns the uninstall. */
export function installCrashCapture(): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}

export interface PerfStats {
  /** Frames per second over the last sample window. */
  fps: number;
  /** Main-thread tasks over 50 ms since sampling began. */
  longTasks: number;
  /** JS heap in MB where the engine reports it (Chromium); null elsewhere. */
  heapMb: number | null;
}

/** Frames over a window → fps, rounded; 0 for an empty window. */
export const fpsOf = (frames: number, windowMs: number): number => (windowMs > 0 ? Math.round((frames * 1000) / windowMs) : 0);

/** Sample frame rate once a second and long tasks continuously. Returns the stop function. */
export function startPerfSampler(onStats: (stats: PerfStats) => void): () => void {
  if (typeof window === "undefined" || typeof requestAnimationFrame !== "function") return () => {};
  let frames = 0;
  let longTasks = 0;
  let last = performance.now();
  let raf = 0;
  const tick = () => {
    frames += 1;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  let observer: PerformanceObserver | undefined;
  try {
    observer = new PerformanceObserver((list) => {
      longTasks += list.getEntries().length;
    });
    observer.observe({ entryTypes: ["longtask"] });
  } catch {
    // Long-task timing is not available in every webview.
  }

  const timer = setInterval(() => {
    const now = performance.now();
    const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
    onStats({
      fps: fpsOf(frames, now - last),
      longTasks,
      heapMb: heap === undefined ? null : Math.round(heap / 1048576),
    });
    frames = 0;
    last = now;
  }, 1000);

  return () => {
    cancelAnimationFrame(raf);
    clearInterval(timer);
    observer?.disconnect();
  };
}
