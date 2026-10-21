// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LinkGroupDialog } from "./LinkGroupDialog";

/**
 * Render tests for the link-group dialog.
 *
 * The rules of linking live in `linkGroups.ts` and are unit-tested there. What
 * matters here is that the dialog offers the groups already in use, and that
 * it can both join and leave a group.
 */

describe("LinkGroupDialog", () => {
  it("offers the groups already in use", () => {
    render(<LinkGroupDialog open current={null} available={["A", "B"]} onPick={() => {}} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "A" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "B" })).toBeTruthy();
  });

  it("hides the in-use list when there are no groups yet", () => {
    render(<LinkGroupDialog open current={null} available={[]} onPick={() => {}} onClose={() => {}} />);
    expect(screen.queryByText("In use")).toBeNull();
  });

  it("joins an existing group in one click", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<LinkGroupDialog open current={null} available={["A"]} onPick={onPick} onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: "A" }));
    expect(onPick).toHaveBeenCalledWith("A");
  });

  it("reports the group the cell is already in", () => {
    render(<LinkGroupDialog open current="A" available={["A"]} onPick={() => {}} onClose={() => {}} />);
    expect((screen.getByLabelText("Link group name") as HTMLInputElement).value).toBe("A");
  });

  it("trims a typed name before handing it over", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<LinkGroupDialog open current={null} available={[]} onPick={onPick} onClose={() => {}} />);
    await user.type(screen.getByLabelText("Link group name"), "  C  ");
    await user.click(screen.getByRole("button", { name: "Link" }));
    expect(onPick).toHaveBeenCalledWith("C");
  });

  it("cannot submit an empty name", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<LinkGroupDialog open current={null} available={[]} onPick={onPick} onClose={() => {}} />);
    const link = screen.getByRole("button", { name: "Link" }) as HTMLButtonElement;
    expect(link.disabled).toBe(true);
    await user.type(screen.getByLabelText("Link group name"), "   ");
    expect(onPick).not.toHaveBeenCalled();
  });

  it("unlinks with an empty name, and only offers that when there is a group", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const { unmount } = render(<LinkGroupDialog open current="A" available={["A"]} onPick={onPick} onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Unlink" }));
    expect(onPick).toHaveBeenCalledWith("");
    unmount();

    const onPick2 = vi.fn();
    render(<LinkGroupDialog open current={null} available={[]} onPick={onPick2} onClose={() => {}} />);
    expect((screen.getByRole("button", { name: "Unlink" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
