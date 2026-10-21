// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { TimeAndSales } from "./TimeAndSales";
import { useTape, resetTapeStore } from "./tapeStore";

describe("TimeAndSales", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetTapeStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders empty state initially", () => {
    render(
      <MemoryRouter>
        <TimeAndSales />
      </MemoryRouter>,
    );
    expect(screen.getByText("0 prints")).toBeTruthy();
    expect(screen.getByText(/Waiting for prints/i)).toBeTruthy();
  });

  it("displays prints pushed to the tape store", () => {
    render(
      <MemoryRouter>
        <TimeAndSales />
      </MemoryRouter>,
    );

    act(() => {
      useTape.getState().push("OANDA:XAUUSD", 4128.5, 1.25);
    });

    expect(screen.getByText("1 prints")).toBeTruthy();
    expect(screen.getByText("4128.50")).toBeTruthy();
  });

  it("filters prints by minimum size", () => {
    render(
      <MemoryRouter>
        <TimeAndSales />
      </MemoryRouter>,
    );

    act(() => {
      useTape.getState().push("OANDA:XAUUSD", 4120.0, 0.2);
      useTape.getState().push("OANDA:XAUUSD", 4125.0, 1.5);
    });

    expect(screen.getByText("2 prints")).toBeTruthy();
    expect(screen.getByText("4125.00")).toBeTruthy();
    expect(screen.getByText("4120.00")).toBeTruthy();

    // Select min size >= 1.0
    fireEvent.change(screen.getByLabelText("Filter prints by minimum size"), { target: { value: "1" } });

    expect(screen.getByText("1 prints")).toBeTruthy();
    expect(screen.getByText("4125.00")).toBeTruthy();
    expect(screen.queryByText("4120.00")).toBeNull();
  });

  it("clears tape when clear button is clicked", () => {
    render(
      <MemoryRouter>
        <TimeAndSales />
      </MemoryRouter>,
    );

    act(() => {
      useTape.getState().push("OANDA:XAUUSD", 4120.0, 1.0);
    });
    expect(screen.getByText("1 prints")).toBeTruthy();
    expect(screen.getByText("4120.00")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Clear the tape"));
    expect(screen.getByText("0 prints")).toBeTruthy();
    expect(screen.queryByText("4120.00")).toBeNull();
  });

  it("allows toggling pause state", () => {
    render(
      <MemoryRouter>
        <TimeAndSales />
      </MemoryRouter>,
    );

    const pauseBtn = screen.getByLabelText("Pause live tape stream");
    fireEvent.click(pauseBtn);

    expect(screen.getByLabelText("Resume live tape stream")).toBeTruthy();
    expect(screen.getByText(/Tape is paused/i)).toBeTruthy();
  });
});
