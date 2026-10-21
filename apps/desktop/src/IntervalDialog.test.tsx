// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { IntervalDialog } from "./IntervalDialog";

/**
 * Render tests for the custom-interval dialog.
 *
 * The parser is unit-tested on its own; what matters here is the wiring — that
 * the dialog reports a rejected interval, offers the nearest neighbour, and
 * only hands back a resolution that the chart can actually load.
 */

describe("IntervalDialog", () => {
  it("says nothing is wrong before anything is typed", () => {
    render(<IntervalDialog open onClose={() => {}} onPick={() => {}} />);
    expect(screen.getByText(/Waiting for an interval/i)).toBeTruthy();
  });

  it("accepts a served interval and reports what it will show", async () => {
    const user = userEvent.setup();
    render(<IntervalDialog open onClose={() => {}} onPick={() => {}} />);
    await user.type(screen.getByLabelText("Interval"), "4h");
    expect(screen.getByText(/Shows 4 hours bars/i)).toBeTruthy();
  });

  it("refuses an interval the data cannot serve, and says why", async () => {
    const user = userEvent.setup();
    render(<IntervalDialog open onClose={() => {}} onPick={() => {}} />);
    await user.type(screen.getByLabelText("Interval"), "7m");
    expect(screen.getByText(/7m is not a served interval/i)).toBeTruthy();
  });

  it("offers the nearest neighbour as a one-click fix", async () => {
    const user = userEvent.setup();
    render(<IntervalDialog open onClose={() => {}} onPick={() => {}} />);
    await user.type(screen.getByLabelText("Interval"), "7m");
    const suggestion = screen.getByRole("button", { name: /Use 5m/i });
    await user.click(suggestion);
    expect((screen.getByLabelText("Interval") as HTMLInputElement).value).toBe("5m");
    expect(screen.getByText(/Shows 5 minutes bars/i)).toBeTruthy();
  });

  it("calls back with the parsed resolution and closes", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<IntervalDialog open onClose={onClose} onPick={onPick} />);
    await user.type(screen.getByLabelText("Interval"), "15m");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onPick).toHaveBeenCalledWith("15m");
    expect(onClose).toHaveBeenCalled();
  });

  it("does not call back while the interval is unservable", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<IntervalDialog open onClose={() => {}} onPick={onPick} />);
    await user.type(screen.getByLabelText("Interval"), "7m");
    const apply = screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("is announced as a dialog with a title", () => {
    render(<IntervalDialog open onClose={() => {}} onPick={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-labelledby")).toBe("interval-dialog-title");
    expect(screen.getByText("Custom interval")).toBeTruthy();
  });
});
