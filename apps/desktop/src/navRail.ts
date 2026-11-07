import { create } from "zustand";

/**
 * The navigation rail's expanded state.
 *
 * It lives in a store rather than in the rail's own component state because
 * a keyboard binding has to be able to toggle it: the rail is a global
 * navigation control, so its shape belongs to the shell, not to one
 * component that happens to draw it.
 *
 * The value is a preference, not a mode — a user who opens the rail once
 * expects it open next time. Storage failures are not worth a crash, so a
 * private-mode browser just starts collapsed.
 */

const STORAGE_KEY = "ezyview:navRailExpanded";

function readExpanded(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeExpanded(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* storage unavailable — the preference is best-effort */
  }
}

interface NavRailState {
  expanded: boolean;
  setExpanded(value: boolean): void;
  toggle(): void;
}

export const useNavRail = create<NavRailState>((set, get) => ({
  expanded: readExpanded(),
  setExpanded: (value) => {
    writeExpanded(value);
    set({ expanded: value });
  },
  toggle: () => {
    const next = !get().expanded;
    writeExpanded(next);
    set({ expanded: next });
  },
}));
