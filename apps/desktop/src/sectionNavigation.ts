import { cycleSection, nextChordState, sectionForDigit, type ChordState } from "./sectionCycle";
import type { RoutePath } from "./nav";

/**
 * Keyboard navigation between sections.
 *
 * The key handling is a pure function so the chord, the digit jumps and the
 * cycle can be pinned without a DOM: a rail that jumps to the wrong section
 * is worse than one that does not jump at all.
 */

/** What a key press asks the shell to do. */
export type NavIntent =
  | { kind: "none" }
  | { kind: "jump"; to: RoutePath }
  | { kind: "cycle"; step: 1 | -1 }
  | { kind: "toggleRail" };

/** The navigation state the shell carries between key presses. */
export interface NavKeyState {
  /** The chord is waiting for its second key. */
  chordPending: boolean;
}

export interface NavKeyEvent {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

/**
 * Turn one key press into an intent.
 *
 * The order matters: a modified key is a command, a bare key is either the
 * start of the chord or nothing at all. A pending chord loses to a modified
 * key, so the user is never left waiting after a real command.
 */
export function resolveNavIntent(
  event: NavKeyEvent,
  state: NavKeyState,
): { intent: NavIntent; state: NavKeyState } {
  const modified = event.ctrl || event.alt || event.meta;

  // Ctrl+Tab cycles the sections, forward or backward.
  if (event.ctrl && !event.alt && !event.meta && event.key.toLowerCase() === "tab") {
    return { intent: { kind: "cycle", step: event.shift ? -1 : 1 }, state: { chordPending: false } };
  }

  // Ctrl+\ toggles the rail's width.
  if (event.ctrl && !event.alt && !event.meta && event.key === "\\") {
    return { intent: { kind: "toggleRail" }, state: { chordPending: false } };
  }

  // Alt+1..8 jumps straight to a section.
  if (event.alt && !event.ctrl && !event.meta) {
    const digit = Number(event.key);
    if (Number.isInteger(digit) && digit >= 1 && digit <= 9) {
      const to = sectionForDigit(digit);
      if (to) return { intent: { kind: "jump", to }, state: { chordPending: false } };
      return { intent: { kind: "none" }, state: { chordPending: false } };
    }
  }

  // A bare key continues a pending chord, or starts one.
  if (!modified && event.key.length === 1) {
    const next = nextChordState(state.chordPending ? "pending" : "idle", event.key);
    if (next.target) {
      return { intent: { kind: "jump", to: next.target }, state: { chordPending: false } };
    }
    return { intent: { kind: "none" }, state: { chordPending: next.state === "pending" } };
  }

  return { intent: { kind: "none" }, state: { chordPending: false } };
}

/** The section the cycle lands on for the current path. */
export function nextSection(path: string, step: 1 | -1): RoutePath {
  return cycleSection(path, step);
}

/** Re-exported so callers do not need two modules for one chord. */
export type { ChordState };
