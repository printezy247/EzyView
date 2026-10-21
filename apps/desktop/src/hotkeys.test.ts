import { describe, expect, it } from "vitest";

import { HOTKEYS, hotkeyGroups, isTypingTarget } from "./hotkeys";

/**
 * The hotkey sheet is generated from one table rather than hand-written in a
 * dialog, so a binding cannot exist without being documented (or be documented
 * after being removed). These tests pin the table's shape and the typing guard
 * that keeps single-key shortcuts out of text fields.
 */

describe("hotkey table", () => {
  it("groups every binding under a heading", () => {
    const groups = hotkeyGroups();
    expect(groups.length).toBeGreaterThanOrEqual(3);
    for (const group of groups) {
      expect(group.title.length).toBeGreaterThan(2);
      expect(group.keys.length).toBeGreaterThan(0);
    }
  });

  it("gives every binding a non-empty combo and description", () => {
    for (const group of hotkeyGroups()) {
      for (const k of group.keys) {
        expect(k.combo.length, group.title).toBeGreaterThan(0);
        expect(k.description.length, group.title).toBeGreaterThan(4);
      }
    }
  });

  it("documents the palette on Ctrl+K and the chart input on Ctrl+Shift+K", () => {
    const byCombo = new Map(HOTKEYS.map((k) => [k.combo, k.description]));
    expect(byCombo.get("Ctrl+K")).toMatch(/palette/i);
    expect(byCombo.get("Ctrl+Shift+K")).toMatch(/chart/i);
  });

  it("has no duplicate combos, so the sheet never shows two answers", () => {
    const combos = HOTKEYS.map((k) => k.combo);
    expect(new Set(combos).size).toBe(combos.length);
  });
});

describe("isTypingTarget", () => {
  it("is true for inputs, textareas and contenteditable hosts", () => {
    expect(isTypingTarget({ tagName: "INPUT" } as unknown as HTMLElement)).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" } as unknown as HTMLElement)).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true } as unknown as HTMLElement)).toBe(true);
  });

  it("is false for buttons, the body and null", () => {
    expect(isTypingTarget({ tagName: "BUTTON" } as unknown as HTMLElement)).toBe(false);
    expect(isTypingTarget({ tagName: "BODY" } as unknown as HTMLElement)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
