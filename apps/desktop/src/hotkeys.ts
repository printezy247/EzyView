/**
 * The keyboard shortcut sheet, as data.
 *
 * `?` opens a dialog rendered from this table, so every binding the app
 * actually implements has one place to be documented. Keeping it a plain table
 * (rather than JSX) means it is unit-testable and can also feed the command
 * palette later.
 */

export interface Hotkey {
  /** Rendered combo, e.g. `Ctrl+K`. `Cmd` is substituted on macOS at render time. */
  combo: string;
  description: string;
}

export interface HotkeyGroup {
  title: string;
  keys: Hotkey[];
}

export const HOTKEYS: readonly Hotkey[] = [
  { combo: "Ctrl+K", description: "Open the command palette" },
  { combo: "Ctrl+Shift+K", description: "Chart quick command input" },
  { combo: "/", description: "Chart quick command input (chart focused)" },
  { combo: "?", description: "Show this shortcut sheet" },
  { combo: "Ctrl+Shift+N", description: "New layout tab" },
  { combo: "Ctrl+Z", description: "Undo the last drawing edit" },
  { combo: "Ctrl+Y", description: "Redo the last drawing edit" },
  { combo: "Ctrl+C", description: "Copy the selected drawing" },
  { combo: "Ctrl+V", description: "Paste the copied drawing" },
  { combo: "Delete", description: "Delete the selected drawing" },
  { combo: "Escape", description: "Cancel the active tool or dialog" },
  { combo: "Space", description: "Play or pause bar replay" },
] as const;

const GROUP_OF: Record<string, string> = {
  "Ctrl+K": "Navigation",
  "Ctrl+Shift+K": "Navigation",
  "/": "Navigation",
  "?": "Navigation",
  "Ctrl+Shift+N": "Navigation",
  "Ctrl+Z": "Drawings",
  "Ctrl+Y": "Drawings",
  "Ctrl+C": "Drawings",
  "Ctrl+V": "Drawings",
  Delete: "Drawings",
  Escape: "General",
  Space: "Replay",
};

/** The table grouped for display, in a stable, curated order. */
export function hotkeyGroups(): HotkeyGroup[] {
  const order = ["Navigation", "Drawings", "Replay", "General"];
  const byTitle = new Map<string, Hotkey[]>();
  for (const key of HOTKEYS) {
    const title = GROUP_OF[key.combo] ?? "General";
    const list = byTitle.get(title) ?? [];
    list.push(key);
    byTitle.set(title, list);
  }
  return order
    .filter((title) => byTitle.has(title))
    .map((title) => ({ title, keys: byTitle.get(title)! }));
}

/**
 * True when a key event landed in a field that consumes plain characters —
 * single-key shortcuts must not steal a keystroke from a symbol search or the
 * Pine editor.
 */
export function isTypingTarget(target: HTMLElement | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}
