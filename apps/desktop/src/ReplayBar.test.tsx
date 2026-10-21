// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ReplayBar } from "./ReplayBar";
import { useWorkspace } from "./store";

describe("ReplayBar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useWorkspace.setState({ replayBar: null, replaySpeed: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when replayBar is null", () => {
    const { container } = render(<ReplayBar totalBars={100} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders controls when replayBar is active", () => {
    act(() => {
      useWorkspace.setState({ replayBar: 20 });
    });
    render(<ReplayBar totalBars={100} />);
    expect(screen.getByRole("region", { name: "Bar Replay Transport" })).toBeTruthy();
    expect(screen.getByLabelText("Play replay")).toBeTruthy();
    expect(screen.getByLabelText("Step back one bar")).toBeTruthy();
    expect(screen.getByLabelText("Step forward one bar")).toBeTruthy();
    expect(screen.getByLabelText("Rewind to start")).toBeTruthy();
    expect(screen.getByText(/21 \/ 100/)).toBeTruthy();
  });

  it("steps backward and forward with buttons", () => {
    act(() => {
      useWorkspace.setState({ replayBar: 20 });
    });
    render(<ReplayBar totalBars={100} />);

    fireEvent.click(screen.getByLabelText("Step back one bar"));
    expect(useWorkspace.getState().replayBar).toBe(19);

    fireEvent.click(screen.getByLabelText("Step forward one bar"));
    expect(useWorkspace.getState().replayBar).toBe(20);
  });

  it("rewinds to start with rewind button", () => {
    act(() => {
      useWorkspace.setState({ replayBar: 50 });
    });
    render(<ReplayBar totalBars={100} />);

    fireEvent.click(screen.getByLabelText("Rewind to start"));
    expect(useWorkspace.getState().replayBar).toBe(0);
  });

  it("plays bars forward on a timer and allows pausing", () => {
    act(() => {
      useWorkspace.setState({ replayBar: 10, replaySpeed: 1 });
    });
    render(<ReplayBar totalBars={100} />);

    // Click play
    fireEvent.click(screen.getByLabelText("Play replay"));
    expect(screen.getByLabelText("Pause replay")).toBeTruthy();

    // Advance 500ms (1 bar at 1x)
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(useWorkspace.getState().replayBar).toBe(11);

    // Pause replay
    fireEvent.click(screen.getByLabelText("Pause replay"));
    expect(screen.getByLabelText("Play replay")).toBeTruthy();
  });

  it("exits replay mode when Exit button is clicked", () => {
    act(() => {
      useWorkspace.setState({ replayBar: 10 });
    });
    render(<ReplayBar totalBars={100} />);

    fireEvent.click(screen.getByLabelText("Exit bar replay"));
    expect(useWorkspace.getState().replayBar).toBeNull();
  });
});
