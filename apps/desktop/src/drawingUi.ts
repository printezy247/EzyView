import { create } from "zustand";

/**
 * Ephemeral drawing UI state: which drawing has its settings dialog open, which
 * one wants its text field focused, whether the navigate cursor is a crosshair,
 * and where the user pinned the floating mini-bar.
 *
 * None of it belongs in the workspace store: it is not persisted, not part of
 * undo history, and closing a dialog must never mark the layout dirty.
 */

export type DrawingSettingsTab = "style" | "text" | "coordinates" | "visibility";

interface DrawingUiState {
  /** Drawing whose full settings modal is open, or null. */
  settingsId: string | null;
  settingsTab: DrawingSettingsTab;
  /** Drawing whose text annotation should be focused right now. */
  textEditId: string | null;
  /** Crosshair navigate cursor (Cursors group), independent of armed tools. */
  crosshairCursor: boolean;
  /** User-pinned floating bar position in chart pixels, or null for automatic. */
  miniBarPinned: { x: number; y: number } | null;
  openSettings(id: string, tab?: DrawingSettingsTab): void;
  closeSettings(): void;
  requestTextEdit(id: string | null): void;
  setCrosshairCursor(on: boolean): void;
  setMiniBarPinned(at: { x: number; y: number } | null): void;
}

export const useDrawingUi = create<DrawingUiState>((set) => ({
  settingsId: null,
  settingsTab: "style",
  textEditId: null,
  crosshairCursor: false,
  miniBarPinned: null,
  openSettings: (id, tab = "style") => set({ settingsId: id, settingsTab: tab }),
  closeSettings: () => set({ settingsId: null }),
  requestTextEdit: (id) => set({ textEditId: id }),
  setCrosshairCursor: (on) => set({ crosshairCursor: on }),
  setMiniBarPinned: (at) => set({ miniBarPinned: at }),
}));
