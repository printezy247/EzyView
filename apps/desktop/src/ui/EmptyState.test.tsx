// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EmptyState } from "./EmptyState";

/**
 * The shared empty state.
 *
 * An empty page is not a failure, but it is a dead end when nothing on it
 * says what to do next. The component has to carry the one line that makes
 * the page useful, and any action that gets out of it.
 */

describe("EmptyState", () => {
  it("states that the list is empty and why it matters", () => {
    render(<EmptyState title="No alerts yet" body="An alert fires when the price crosses the level you set." />);
    expect(screen.getByText("No alerts yet")).toBeTruthy();
    expect(screen.getByText("An alert fires when the price crosses the level you set.")).toBeTruthy();
  });

  it("renders the icon when one is given", () => {
    const { container } = render(<EmptyState title="No alerts yet" body="body" icon={<span data-testid="icon" />} />);
    expect(container.querySelector('[data-testid="icon"]')).toBeTruthy();
  });

  it("runs the action when it is pressed", async () => {
    const user = userEvent.setup();
    let pressed = 0;
    render(
      <EmptyState
        title="No alerts yet"
        body="body"
        action={{ label: "Create an alert", onSelect: () => (pressed += 1) }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Create an alert" }));
    expect(pressed).toBe(1);
  });

  it("has no action button when no action is given", () => {
    render(<EmptyState title="No alerts yet" body="body" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("carries the secondary hint when one is given", () => {
    render(
      <EmptyState
        title="No alerts yet"
        body="body"
        hint="Watch: alerts only fire while the app is open."
      />,
    );
    expect(screen.getByText("Watch: alerts only fire while the app is open.")).toBeTruthy();
  });
});
