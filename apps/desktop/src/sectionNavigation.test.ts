import { describe, expect, it } from "vitest";

import { resolveNavIntent } from "./sectionNavigation";
import type { NavKeyState } from "./sectionNavigation";

/**
 * Keyboard navigation between sections.
 *
 * The key handling is a pure function so the chord, the digit jumps and the
 * cycle can be pinned without a DOM: a rail that jumps to the wrong section
 * is worse than one that does not jump at all.
 */

const IDLE: NavKeyState = { chordPending: false };

/** A key press with no modifier held. */
const key = (k: string, mods: Partial<{ ctrl: boolean; shift: boolean; alt: boolean; meta: boolean }> = {}) => ({
  key: k,
  ctrl: false,
  shift: false,
  alt: false,
  meta: false,
  ...mods,
});

describe("resolveNavIntent", () => {
  it("jumps to a section with Alt+digit", () => {
    expect(resolveNavIntent(key("1", { alt: true }), IDLE)).toEqual({
      intent: { kind: "jump", to: "/chart" },
      state: IDLE,
    });
    expect(resolveNavIntent(key("8", { alt: true }), IDLE).intent).toEqual({
      kind: "jump",
      to: "/settings",
    });
  });

  it("ignores a digit outside the rail", () => {
    expect(resolveNavIntent(key("9", { alt: true }), IDLE).intent.kind).toBe("none");
  });

  it("cycles forward and backward with Ctrl+Tab", () => {
    expect(resolveNavIntent(key("Tab", { ctrl: true }), IDLE).intent).toEqual({ kind: "cycle", step: 1 });
    expect(resolveNavIntent(key("Tab", { ctrl: true, shift: true }), IDLE).intent).toEqual({
      kind: "cycle",
      step: -1,
    });
  });

  it("toggles the rail with Ctrl+backslash", () => {
    expect(resolveNavIntent(key("\\", { ctrl: true }), IDLE).intent).toEqual({ kind: "toggleRail" });
  });

  it("starts the chord on g and jumps on the second key", () => {
    const first = resolveNavIntent(key("g"), IDLE);
    expect(first.intent.kind).toBe("none");
    expect(first.state.chordPending).toBe(true);

    const second = resolveNavIntent(key("m"), first.state);
    expect(second.intent).toEqual({ kind: "jump", to: "/markets" });
    expect(second.state.chordPending).toBe(false);
  });

  it("gives up the chord on a key that is not a section", () => {
    const pending = resolveNavIntent(key("g"), IDLE);
    const next = resolveNavIntent(key("z"), pending.state);
    expect(next.intent.kind).toBe("none");
    expect(next.state.chordPending).toBe(false);
  });

  it("does not start a chord when a modifier is held", () => {
    const result = resolveNavIntent(key("g", { ctrl: true }), IDLE);
    expect(result.state.chordPending).toBe(false);
  });

  it("clears a pending chord when the user jumps another way", () => {
    const pending = resolveNavIntent(key("g"), IDLE);
    const result = resolveNavIntent(key("3", { alt: true }), pending.state);
    expect(result.state.chordPending).toBe(false);
  });
});
