// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChartSettingsDialog } from "./ChartSettingsDialog";
import { DEFAULT_CHART_SETTINGS } from "./layout";
import { useWorkspace } from "./store";

describe("ChartSettingsDialog", () => {
  it("renders with 7 tabs matching TradingView chart settings", () => {
    render(<ChartSettingsDialog open onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Symbol" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Status line" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Scales and lines" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Canvas" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Trading" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Alerts" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Events" })).toBeTruthy();
  });

  it("switches tabs and displays tab content", async () => {
    const user = userEvent.setup();
    render(<ChartSettingsDialog open onClose={() => {}} />);

    // Click Canvas tab
    await user.click(screen.getByRole("tab", { name: "Canvas" }));
    expect(screen.getByText("Background & Grids")).toBeTruthy();
    expect(screen.getByText("Vert grid lines")).toBeTruthy();
    expect(screen.getByText("Horz grid lines")).toBeTruthy();

    // Click Trading tab
    await user.click(screen.getByRole("tab", { name: "Trading" }));
    expect(screen.getByText("General Trading Appearance")).toBeTruthy();
    expect(screen.getByText("Positions on chart")).toBeTruthy();

    // Click Alerts tab
    await user.click(screen.getByRole("tab", { name: "Alerts" }));
    expect(screen.getByText("Chart Alerts")).toBeTruthy();
    expect(screen.getByText("Alert lines on chart")).toBeTruthy();

    // Click Events tab
    await user.click(screen.getByRole("tab", { name: "Events" }));
    expect(screen.getByText("Market Events & Breaks")).toBeTruthy();
    expect(screen.getByText("Economic events on chart")).toBeTruthy();
  });

  it("applies settings to the active chart when Ok is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ChartSettingsDialog open onClose={onClose} />);

    // Switch to Canvas and toggle watermark
    await user.click(screen.getByRole("tab", { name: "Canvas" }));
    const watermarkCheckbox = screen.getByLabelText(/Watermark/i);
    await user.click(watermarkCheckbox);

    // Click Ok
    await user.click(screen.getByRole("button", { name: "Ok" }));
    expect(onClose).toHaveBeenCalled();
    expect(useWorkspace.getState().activeChart().watermark).toBe(true);
  });

  it("keeps grid axes independent when only one is disabled", async () => {
    const user = userEvent.setup();
    render(<ChartSettingsDialog open onClose={() => {}} />);

    await user.click(screen.getByRole("tab", { name: "Canvas" }));
    await user.click(screen.getByLabelText("Horz grid lines"));
    await user.click(screen.getByRole("button", { name: "Ok" }));

    const chart = useWorkspace.getState().activeChart();
    expect(chart.showVertGrid).toBe(true);
    expect(chart.showHorzGrid).toBe(false);
    expect(chart.showGrid).toBe(true);
  });

  it("restores per-axis grid values from older chartSettings saves", async () => {
    const user = userEvent.setup();
    useWorkspace.getState().updateActive({
      showGrid: true,
      showVertGrid: undefined,
      showHorzGrid: undefined,
      chartSettings: {
        ...DEFAULT_CHART_SETTINGS,
        canvas: { ...DEFAULT_CHART_SETTINGS.canvas, vertGridLines: true, horzGridLines: false },
      },
    });
    render(<ChartSettingsDialog open onClose={() => {}} />);

    await user.click(screen.getByRole("tab", { name: "Canvas" }));
    expect((screen.getByLabelText("Vert grid lines") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Horz grid lines") as HTMLInputElement).checked).toBe(false);
  });

  it("closes without applying when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ChartSettingsDialog open onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });
});
