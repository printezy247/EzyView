import { create } from "zustand";

/**
 * Fullscreen "zen" mode: the OS window goes fullscreen and the nav rail and
 * workspace tabs hide. Under Tauri the window is toggled through the core
 * window command; in a browser it uses the Fullscreen API.
 */
interface ZenState {
  on: boolean;
  toggle(): void;
  exit(): void;
}

const inTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function setFullscreen(value: boolean): Promise<void> {
  try {
    if (inTauri()) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("plugin:window|set_fullscreen", { value });
    } else if (value) {
      await document.documentElement.requestFullscreen();
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch {
    // Denied or unsupported: the tabs still hide, the window just stays as it is.
  }
}

export const useZen = create<ZenState>((set, get) => ({
  on: false,
  toggle: () => {
    const on = !get().on;
    set({ on });
    void setFullscreen(on);
  },
  exit: () => {
    if (!get().on) return;
    set({ on: false });
    void setFullscreen(false);
  },
}));
