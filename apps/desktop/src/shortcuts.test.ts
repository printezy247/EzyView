// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { comboMatches, createShortcutRegistry, parseCombo } from "./shortcuts";

const key = (init: KeyboardEventInit): KeyboardEvent =>
  new KeyboardEvent("keydown", { cancelable: true, ...init });

afterEach(() => {
  document.body.innerHTML = "";
});

describe("parseCombo", () => {
  it("parses Mod, Shift, Alt and the key", () => {
    expect(parseCombo("Mod+Shift+K")).toMatchObject({
      key: "k",
      mod: true,
      shift: true,
      ctrl: false,
      alt: false,
    });
    expect(parseCombo("Alt+Enter").key).toBe("enter");
    expect(parseCombo("Shift+?").key).toBe("?");
  });

  it("treats a bare plus as the key, not an empty modifier list", () => {
    expect(parseCombo("+")).toMatchObject({ key: "+", mod: false, shift: false });
  });

  it("normalises aliases", () => {
    expect(parseCombo("Esc").key).toBe("escape");
    expect(parseCombo("Space").key).toBe(" ");
    expect(parseCombo("Del").key).toBe("delete");
  });
});

describe("comboMatches", () => {
  it("requires the exact modifiers", () => {
    expect(comboMatches("Mod+K", key({ key: "k", ctrlKey: true }))).toBe(true);
    expect(comboMatches("Mod+K", key({ key: "k", metaKey: true }))).toBe(true);
    expect(comboMatches("Mod+K", key({ key: "k" }))).toBe(false);
    expect(comboMatches("Mod+K", key({ key: "k", ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(comboMatches("Mod+Shift+K", key({ key: "K", ctrlKey: true, shiftKey: true }))).toBe(true);
  });

  it("matches shifted symbols only when Shift is part of the combo", () => {
    expect(comboMatches("Shift+?", key({ key: "?", shiftKey: true }))).toBe(true);
    expect(comboMatches("?", key({ key: "?", shiftKey: true }))).toBe(false);
    expect(comboMatches("/", key({ key: "/" }))).toBe(true);
  });

  it("matches Space through the browser's space key value", () => {
    expect(comboMatches("Space", key({ key: " ", code: "Space" }))).toBe(true);
  });
});

describe("shortcut registry", () => {
  it("runs the highest-priority binding once and prevents the default", () => {
    const registry = createShortcutRegistry();
    const low = vi.fn();
    const high = vi.fn();
    registry.register({ id: "low", combo: "Mod+K", priority: 1, run: low });
    registry.register({ id: "high", combo: "Mod+K", priority: 10, run: high });

    const event = key({ key: "k", ctrlKey: true });
    expect(registry.handle(event)).toBe(true);
    expect(high).toHaveBeenCalledOnce();
    expect(low).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("blocks bindings while a layer owns the keyboard", () => {
    const registry = createShortcutRegistry();
    const chart = vi.fn();
    const menu = vi.fn();
    registry.register({ id: "chart", combo: "Escape", run: chart });
    const layer = registry.pushLayer("menu:1");
    registry.register({ id: "menu", combo: "Escape", layer: "menu:1", run: menu });

    registry.handle(key({ key: "Escape" }));
    expect(menu).toHaveBeenCalledOnce();
    expect(chart).not.toHaveBeenCalled();

    layer();
    registry.handle(key({ key: "Escape" }));
    expect(chart).toHaveBeenCalledOnce();
  });

  it("skips bindings while an input is focused unless allowInInput is set", () => {
    const registry = createShortcutRegistry();
    const normal = vi.fn();
    const allowed = vi.fn();
    registry.register({ id: "normal", combo: "Escape", run: normal });
    registry.register({ id: "allowed", combo: "Escape", allowInInput: true, priority: 5, run: allowed });

    const input = document.createElement("input");
    document.body.appendChild(input);
    const event = key({ key: "Escape" });
    input.dispatchEvent(event);
    registry.handle(event);

    expect(allowed).toHaveBeenCalledOnce();
    expect(normal).not.toHaveBeenCalled();
  });

  it("does not repeat a binding unless asked", () => {
    const registry = createShortcutRegistry();
    const run = vi.fn();
    registry.register({ id: "delete", combo: "Delete", run });
    registry.handle(key({ key: "Delete", repeat: true }));
    expect(run).not.toHaveBeenCalled();

    const repeatable = createShortcutRegistry();
    repeatable.register({ id: "undo", combo: "Mod+Z", allowRepeat: true, run });
    repeatable.handle(key({ key: "z", ctrlKey: true, repeat: true }));
    expect(run).toHaveBeenCalledOnce();
  });

  it("ignores events another handler already consumed", () => {
    const registry = createShortcutRegistry();
    const run = vi.fn();
    registry.register({ id: "escape", combo: "Escape", run });
    const event = key({ key: "Escape" });
    event.preventDefault();
    expect(registry.handle(event)).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("supports an array of combos for one action", () => {
    const registry = createShortcutRegistry();
    const run = vi.fn();
    registry.register({ id: "step", combo: ["ArrowLeft", "["], run });
    registry.handle(key({ key: "[" }));
    expect(run).toHaveBeenCalledOnce();
  });
});
