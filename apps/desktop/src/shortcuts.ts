import { useEffect, useRef } from "react";
import { isTypingTarget } from "./hotkeys";

/**
 * One keyboard dispatcher for the whole app.
 *
 * Components used to attach their own `window`/`document` keydown listeners,
 * each with its own typing guard and Escape order. That made multi-key
 * shortcuts depend on mount order and let a dialog's Escape compete with the
 * chart's. This registry keeps the order explicit:
 *
 *   - a binding is a combo plus a handler, optionally scoped to a layer;
 *   - the last pushed layer (a modal, a menu) owns the keyboard until it pops;
 *   - the highest-priority matching binding runs, and only it;
 *   - `preventDefault` happens only for a binding that actually ran.
 *
 * The listener is installed once, in capture phase, so a menu can swallow
 * Escape before React's synthetic handlers see it. Local input handling
 * (arrow keys inside a list, Enter in a search box) stays in the component:
 * those are not global shortcuts.
 */

export type ShortcutCombo = string | readonly string[];

export interface ShortcutBinding {
  /** Stable id, used for debugging and duplicate detection. */
  id: string;
  /** `Mod+K`, `Shift+?`, `Escape`, `Space`, `Delete`, `Alt+Enter` or an array. */
  combo: ShortcutCombo;
  run: (event: KeyboardEvent) => void;
  /** Only active while this exact layer token is on top. */
  layer?: string;
  /** Extra guard evaluated at key time. */
  when?: () => boolean;
  /** Let the binding run while an input/textarea/contenteditable has focus. */
  allowInInput?: boolean;
  /** Let a held key repeat. Off by default so a held Delete is one action. */
  allowRepeat?: boolean;
  /** Higher wins; ties keep registration order. */
  priority?: number;
  /** Swallow the event so component-level handlers do not also act on it. */
  stopPropagation?: boolean;
}

interface ParsedCombo {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  mod: boolean;
}

const KEY_ALIASES: Record<string, string> = {
  esc: "escape",
  escape: "escape",
  space: " ",
  spacebar: " ",
  del: "delete",
  delete: "delete",
  backspace: "backspace",
  enter: "enter",
  return: "enter",
  tab: "tab",
  up: "arrowup",
  down: "arrowdown",
  left: "arrowleft",
  right: "arrowright",
};

/** Normalise a key name for comparison. Printable keys are case-folded. */
function normalizeKey(key: string): string {
  if (key.length === 1) return key.toLowerCase();
  return KEY_ALIASES[key.toLowerCase()] ?? key.toLowerCase();
}

/**
 * Parse `Mod+Shift+K`. `Mod` accepts Ctrl on Linux/Windows and Cmd on macOS;
 * an explicit `Ctrl`/`Meta` is also supported for the rare binding that needs
 * one platform only.
 */
export function parseCombo(combo: string): ParsedCombo {
  // A bare `+` is a key, not an empty modifier list.
  const parts = combo === "+" ? ["+"] : combo.split("+");
  const key = parts.pop() ?? "";
  const mods = new Set(parts.map((p) => p.trim().toLowerCase()).filter(Boolean));
  return {
    key: normalizeKey(key.trim()),
    ctrl: mods.has("ctrl") || mods.has("control"),
    meta: mods.has("meta") || mods.has("cmd") || mods.has("command"),
    alt: mods.has("alt") || mods.has("option"),
    shift: mods.has("shift"),
    mod: mods.has("mod"),
  };
}

/** Does one combo describe this event? Exported so tests can pin the rules. */
export function comboMatches(combo: string, event: KeyboardEvent): boolean {
  const parsed = parseCombo(combo);
  if (normalizeKey(event.key) !== parsed.key) return false;

  // `Mod` means "the platform command key", not "either one is fine": a
  // Ctrl+K binding must not fire on Ctrl+Meta+K by accident.
  if (parsed.mod) {
    if (!(event.ctrlKey || event.metaKey)) return false;
  } else if (parsed.ctrl && !event.ctrlKey) {
    return false;
  } else if (parsed.meta && !event.metaKey) {
    return false;
  } else if (!parsed.ctrl && !parsed.meta && (event.ctrlKey || event.metaKey)) {
    return false;
  }
  if (parsed.alt !== event.altKey) return false;
  if (parsed.shift !== event.shiftKey) return false;
  return true;
}

const comboMatchesAny = (combo: ShortcutCombo, event: KeyboardEvent): boolean =>
  typeof combo === "string" ? comboMatches(combo, event) : combo.some((c) => comboMatches(c, event));

export interface ShortcutRegistry {
  register(binding: ShortcutBinding): () => void;
  /** Push a keyboard layer; returns the pop function. */
  pushLayer(layer: string): () => void;
  topLayer(): string | null;
  /** Run the matching binding, if any. Returns whether one ran. */
  handle(event: KeyboardEvent): boolean;
  /** Test hook. */
  reset(): void;
}

export function createShortcutRegistry(): ShortcutRegistry {
  let bindings: ShortcutBinding[] = [];
  let layers: string[] = [];

  const ordered = (): ShortcutBinding[] =>
    [...bindings].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  return {
    register(binding) {
      bindings.push(binding);
      return () => {
        bindings = bindings.filter((b) => b !== binding);
      };
    },

    pushLayer(layer) {
      layers.push(layer);
      return () => {
        const index = layers.lastIndexOf(layer);
        if (index >= 0) layers.splice(index, 1);
      };
    },

    topLayer() {
      return layers.at(-1) ?? null;
    },

    handle(event) {
      if (event.defaultPrevented) return false;
      const top = layers.at(-1) ?? null;
      const typing = isTypingTarget(event.target as HTMLElement | null);

      for (const binding of ordered()) {
        // A layer owns the keyboard. Bindings for another layer, or for no
        // layer at all, wait until it pops.
        if (top ? binding.layer !== top : binding.layer !== undefined) continue;
        if (typing && !binding.allowInInput) continue;
        if (event.repeat && !binding.allowRepeat) continue;
        if (binding.when && !binding.when()) continue;
        if (!comboMatchesAny(binding.combo, event)) continue;

        binding.run(event);
        event.preventDefault();
        if (binding.stopPropagation) event.stopPropagation();
        return true;
      }
      return false;
    },

    reset() {
      bindings = [];
      layers = [];
    },
  };
}

/** The app-wide registry. Tests create their own isolated instance. */
export const shortcuts = createShortcutRegistry();

let layerCounter = 0;
const nextLayerToken = (prefix: string): string => `${prefix}:${++layerCounter}`;

/**
 * Register one binding for the lifetime of the component. The latest handler
 * and guard are read through a ref, so an inline closure does not re-register
 * on every render (and cannot miss an update between renders).
 */
export function useShortcut(binding: ShortcutBinding): void {
  const latest = useRef(binding);
  latest.current = binding;

  const comboKey = Array.isArray(binding.combo) ? binding.combo.join("|") : binding.combo;
  const { id, layer, allowInInput, allowRepeat, priority, stopPropagation } = binding;

  useEffect(() => {
    return shortcuts.register({
      id,
      combo: binding.combo,
      layer,
      allowInInput,
      allowRepeat,
      priority,
      stopPropagation,
      run: (event) => latest.current.run(event),
      when: () => latest.current.when?.() ?? true,
    });
    // `binding.combo` is represented by comboKey; the handler stays via ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, comboKey, layer, allowInInput, allowRepeat, priority, stopPropagation]);
}

/**
 * Make a component the top keyboard layer while `active`. Returns a unique
 * token so two menus (or two stacked dialogs) do not both claim Escape.
 */
export function useShortcutLayer(prefix: string, active = true): string {
  const token = useRef<string>(nextLayerToken(prefix)).current;
  useEffect(() => {
    if (!active) return;
    return shortcuts.pushLayer(token);
  }, [active, token]);
  return token;
}

/** Install the one capture-phase listener. Returns the cleanup. */
export function installShortcutDispatcher(registry: ShortcutRegistry = shortcuts): () => void {
  if (typeof window === "undefined") return () => {};
  const onKeyDown = (event: KeyboardEvent) => {
    registry.handle(event);
  };
  window.addEventListener("keydown", onKeyDown, true);
  return () => window.removeEventListener("keydown", onKeyDown, true);
}

/** Mount the dispatcher at the shell. */
export function useShortcutDispatcher(): void {
  useEffect(() => installShortcutDispatcher(), []);
}
