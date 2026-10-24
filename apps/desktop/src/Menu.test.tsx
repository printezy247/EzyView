// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Menu } from "./Menu";
import type { MenuEntry } from "./Menu";
import { installShortcutDispatcher } from "./shortcuts";

let uninstall: () => void;
beforeAll(() => {
  uninstall = installShortcutDispatcher();
});
afterAll(() => uninstall());

/**
 * Render test for the shared dropdown.
 *
 * Every menu in the app is this component, so its keyboard contract is worth
 * pinning: the popup opens, the items are reachable by keyboard, Escape
 * closes it and gives the focus back, and a radio reports its state through
 * `aria-checked` rather than through colour alone.
 */

const entries: MenuEntry[] = [
  { kind: "label", id: "l1", label: "Group" },
  { kind: "radio", id: "r1", label: "First", selected: true, onSelect: vi.fn() },
  { kind: "radio", id: "r2", label: "Second", selected: false, onSelect: vi.fn() },
  { kind: "separator", id: "s1" },
  { kind: "action", id: "a1", label: "Do it", onSelect: vi.fn() },
];

describe("Menu", () => {
  it("starts closed and shows the trigger's label", () => {
    render(<Menu label="Interval" entries={entries} />);
    expect(screen.getByRole("button", { name: /Interval/ }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens on click and lists its items", async () => {
    const user = userEvent.setup();
    render(<Menu label="Interval" entries={entries} />);
    await user.click(screen.getByRole("button", { name: /Interval/ }));
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.getByText("Do it")).toBeTruthy();
  });

  it("reports a radio's state through aria-checked", async () => {
    const user = userEvent.setup();
    render(<Menu label="Interval" entries={entries} />);
    await user.click(screen.getByRole("button", { name: /Interval/ }));
    expect(screen.getByRole("menuitemradio", { name: "First" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("menuitemradio", { name: "Second" }).getAttribute("aria-checked")).toBe("false");
  });

  it("runs an action's handler and closes", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Menu label="Interval" entries={[{ kind: "action", id: "a1", label: "Do it", onSelect }]} />);
    await user.click(screen.getByRole("button", { name: /Interval/ }));
    await user.click(screen.getByRole("menuitem", { name: "Do it" }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens with the keyboard and parks focus on the first item", async () => {
    const user = userEvent.setup();
    render(<Menu label="Interval" entries={entries} />);
    screen.getByRole("button", { name: /Interval/ }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(document.activeElement?.textContent).toContain("First");
  });

  it("walks the items with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<Menu label="Interval" entries={entries} />);
    screen.getByRole("button", { name: /Interval/ }).focus();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toContain("Second");
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement?.textContent).toContain("First");
  });

  it("jumps to the last item with End and back to the first with Home", async () => {
    const user = userEvent.setup();
    render(<Menu label="Interval" entries={entries} />);
    screen.getByRole("button", { name: /Interval/ }).focus();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{End}");
    expect(document.activeElement?.textContent).toContain("Do it");
    await user.keyboard("{Home}");
    expect(document.activeElement?.textContent).toContain("First");
  });

  it("closes on Escape and gives the focus back to the trigger", async () => {
    const user = userEvent.setup();
    render(<Menu label="Interval" entries={entries} />);
    const trigger = screen.getByRole("button", { name: /Interval/ });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("does not render headings and separators as items", async () => {
    const user = userEvent.setup();
    render(<Menu label="Interval" entries={entries} />);
    await user.click(screen.getByRole("button", { name: /Interval/ }));
    // Two radios and one action are items; the label and separator are not.
    expect(screen.getAllByRole("menuitemradio").length).toBe(2);
    expect(screen.getAllByRole("menuitem").length).toBe(1);
  });
});
