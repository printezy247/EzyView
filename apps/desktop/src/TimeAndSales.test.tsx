// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { TimeAndSales } from "./TimeAndSales";
import { useTape, resetTapeStore } from "./tapeStore";

vi.mock("./data", async () => {
  const actual = await vi.importActual<typeof import("./data")>("./data");
  return {
    ...actual,
    quoteOf: vi.fn().mockImplementation(() => new Promise(() => {})),
  };
});

describe("TimeAndSales", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetTapeStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the empty state and says the rows are quote ticks", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <TimeAndSales />
        </MemoryRouter>,
      );
    });
    expect(screen.getByText("0 ticks")).toBeTruthy();
    expect(screen.getByText(/Waiting for quote ticks/i)).toBeTruthy();
    expect(screen.getByText(/this feed does not report trade sizes/i)).toBeTruthy();
  });

  it("shows a reported size when the tape has one", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <TimeAndSales />
        </MemoryRouter>,
      );
    });

    act(() => {
      useTape.getState().push("OANDA:XAUUSD", 4128.5, 1.25);
    });

    expect(screen.getByText("1 ticks")).toBeTruthy();
    expect(screen.getByText("4128.50")).toBeTruthy();
    expect(screen.getByText("1.25")).toBeTruthy();
  });

  it("never presents a missing size as a number", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <TimeAndSales />
        </MemoryRouter>,
      );
    });

    act(() => {
      useTape.getState().push("OANDA:XAUUSD", 4128.5, 0);
    });

    expect(screen.getByText("4128.50")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("clears tape when clear button is clicked", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <TimeAndSales />
        </MemoryRouter>,
      );
    });

    act(() => {
      useTape.getState().push("OANDA:XAUUSD", 4120.0, 1.0);
    });
    expect(screen.getByText("1 ticks")).toBeTruthy();
    expect(screen.getByText("4120.00")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Clear the tape"));
    expect(screen.getByText("0 ticks")).toBeTruthy();
    expect(screen.queryByText("4120.00")).toBeNull();
  });

  it("allows toggling pause state", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <TimeAndSales />
        </MemoryRouter>,
      );
    });

    const pauseBtn = screen.getByLabelText("Pause live tape stream");
    fireEvent.click(pauseBtn);

    expect(screen.getByLabelText("Resume live tape stream")).toBeTruthy();
    expect(screen.getByText(/Tape is paused/i)).toBeTruthy();
  });
});
