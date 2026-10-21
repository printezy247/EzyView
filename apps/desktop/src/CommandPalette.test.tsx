// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CommandPalette } from "./CommandPalette";
import type { CommandGroup } from "./commandRegistry";

/**
 * Render test for the Ctrl+K palette.
 *
 * The palette is the app's widest surface — it lists every menu item — so the
 * things worth pinning are that it filters as you type, that the arrow keys
 * move the selection, and that Enter runs the highlighted command.
 */

const groups: CommandGroup[] = [
  {
    title: "Go to",
    entries: [
      { kind: "action", id: "nav-chart", label: "Terminal", onSelect: vi.fn() },
      { kind: "action", id: "nav-trade", label: "Trade", onSelect: vi.fn() },
    ],
  },
  {
    title: "Chart",
    entries: [{ kind: "action", id: "chart-reset", label: "Reset chart view", onSelect: vi.fn() }],
  },
];

describe("CommandPalette", () => {
  it("renders nothing when closed", () => {
    render(<CommandPalette open={false} onClose={() => {}} groups={groups} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists every command when nothing is typed", () => {
    render(<CommandPalette open onClose={() => {}} groups={groups} />);
    expect(screen.getByText("Terminal")).toBeTruthy();
    expect(screen.getByText("Reset chart view")).toBeTruthy();
  });

  it("filters as you type", async () => {
    const user = userEvent.setup();
    render(<CommandPalette open onClose={() => {}} groups={groups} />);
    await user.type(screen.getByRole("combobox", { name: "Search features" }), "reset");
    expect(screen.getByText("Reset chart view")).toBeTruthy();
    expect(screen.queryByText("Terminal")).toBeNull();
  });

  it("matches every word of the query, in any order", async () => {
    const user = userEvent.setup();
    render(<CommandPalette open onClose={() => {}} groups={groups} />);
    await user.type(screen.getByRole("combobox", { name: "Search features" }), "view reset");
    expect(screen.getByText("Reset chart view")).toBeTruthy();
  });

  it("runs the highlighted command on Enter and closes", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    const onClose = vi.fn();
    render(
      <CommandPalette
        open
        onClose={onClose}
        groups={[{ title: "Go to", entries: [{ kind: "action", id: "nav-chart", label: "Terminal", onSelect: run }] }]}
      />,
    );
    await user.keyboard("{Enter}");
    expect(run).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("moves the selection with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<CommandPalette open onClose={() => {}} groups={groups} />);
    const rows = screen.getAllByRole("option");
    expect(rows[0]?.getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[1]?.getAttribute("aria-selected")).toBe("true");
  });

  it("says so when nothing matches", async () => {
    const user = userEvent.setup();
    render(<CommandPalette open onClose={() => {}} groups={groups} />);
    await user.type(screen.getByRole("combobox", { name: "Search features" }), "zzzzz");
    expect(screen.getByText(/No feature matches/i)).toBeTruthy();
  });
});
