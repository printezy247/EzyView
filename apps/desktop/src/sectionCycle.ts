import { NAV_SECTIONS, type RoutePath } from "./nav";

/**
 * Keyboard navigation between the eight sections.
 *
 * The app has one global navigation key today (Ctrl+K). A terminal that
 * hides its own structure behind a search box is a terminal people have to
 * learn twice, so the rail gets the three bindings every desktop tool
 * has: a number per section, a forward/back cycle, and a two-key chord.
 */

/** Index of a section in the rail order, or -1 when the path is not one. */
export function sectionIndex(path: string): number {
  return NAV_SECTIONS.findIndex((s) => s.to === path);
}

/**
 * The next section in the cycle. `step` is +1 for forward and -1 for back;
 * it wraps, so the cycle never dead-ends. An unknown path starts the
 * cycle at the first section.
 */
export function cycleSection(path: string, step: number): RoutePath {
  const count = NAV_SECTIONS.length;
  if (count === 0) return "/chart";
  const from = sectionIndex(path);
  const base = from === -1 ? (step > 0 ? -1 : 0) : from;
  const next = (((base + step) % count) + count) % count;
  return NAV_SECTIONS[next]!.to;
}

/**
 * The section a digit key selects, 1-based. `Alt+1` is the first section.
 * Returns undefined for a digit the rail does not have, so the key falls
 * through to whatever else wants it.
 */
export function sectionForDigit(digit: number): RoutePath | undefined {
  const index = digit - 1;
  if (index < 0 || index >= NAV_SECTIONS.length) return undefined;
  return NAV_SECTIONS[index]!.to;
}

/**
 * The two-key "go to" chord: `g` then a section's letter.
 *
 * The letters are the initials of the rail's labels. `Terminal` and
 * `Trade` both start with T, so the second letter is used to break the
 * tie, and any letter that is not claimed is ignored.
 */
export const CHORD_LETTERS: Record<string, RoutePath> = {
  t: "/chart",
  m: "/markets",
  r: "/research",
  j: "/journal",
  s: "/strategies",
  a: "/alerts",
  g: "/settings",
};

export type ChordState = "idle" | "pending";

/** The chord state machine, as a pure function over the last key pressed. */
export function nextChordState(state: ChordState, key: string): { state: ChordState; target?: RoutePath } {
  if (state === "pending") {
    const target = CHORD_LETTERS[key.toLowerCase()];
    return target ? { state: "idle", target } : { state: "idle" };
  }
  return key.toLowerCase() === "g" ? { state: "pending" } : { state: "idle" };
}
