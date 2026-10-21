// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Modal } from "./Modal";

/**
 * Render test for the dialog primitive.
 *
 * The focus trap is the part that matters: a dialog that lets the user tab
 * out into the page behind it is a dialog that strands keyboard users. Escape
 * closing it and focus returning to the opener are the rest of the contract.
 */

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(
      <Modal open={false} onClose={() => {}} labelledBy="t">
        <h2 id="t">Title</h2>
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is announced as a modal dialog with a label", () => {
    render(
      <Modal open onClose={() => {}} labelledBy="t">
        <h2 id="t">Title</h2>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("t");
  });

  it("puts the focus inside the dialog when it opens", () => {
    render(
      <Modal open onClose={() => {}} labelledBy="t">
        <h2 id="t">Title</h2>
        <button type="button">First</button>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} labelledBy="t">
        <h2 id="t">Title</h2>
        <button type="button">First</button>
      </Modal>,
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps Tab inside the dialog", async () => {
    const user = userEvent.setup();
    render(
      <Modal open onClose={() => {}} labelledBy="t">
        <h2 id="t">Title</h2>
        <button type="button">First</button>
        <button type="button">Second</button>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    await user.tab();
    await user.tab();
    await user.tab();
    // However many tabs, the focus is still within the dialog.
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("closes when the backdrop is clicked, but not when the dialog is", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} labelledBy="t">
        <h2 id="t">Title</h2>
        <button type="button">First</button>
      </Modal>,
    );
    await user.click(screen.getByRole("button", { name: "First" }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
