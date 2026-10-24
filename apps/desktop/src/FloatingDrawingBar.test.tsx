// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Drawing } from "@ezyview/drawing-tools";
import { FloatingDrawingBar } from "./FloatingDrawingBar";
import { DrawingSettingsModal } from "./DrawingSettingsModal";
import { useDrawingUi } from "./drawingUi";
import { useWorkspace } from "./store";

const drawing: Drawing = {
  id: "d1",
  tool: "trend_line",
  points: [
    { time: 1_700_000_000, price: 100 },
    { time: 1_700_003_600, price: 110 },
  ],
  style: { color: "#2962ff", width: 1, lineStyle: "solid", showLabels: true },
};

function showBar() {
  render(
    <>
      <FloatingDrawingBar anchor={{ x: 10, y: 10, w: 120, h: 20 }} />
      <DrawingSettingsModal />
    </>,
  );
}

beforeEach(() => {
  useWorkspace.getState().setDrawings([drawing]);
  useWorkspace.getState().selectDrawing("d1");
  useWorkspace.getState().setHideAllDrawings(false);
  useDrawingUi.setState({ settingsId: null, settingsTab: "style", textEditId: null, miniBarPinned: null });
});

afterEach(() => {
  cleanup();
  useDrawingUi.setState({ settingsId: null, textEditId: null, miniBarPinned: null });
});

describe("FloatingDrawingBar", () => {
  it("renders for the selected drawing and opens the tabbed settings modal", () => {
    showBar();
    expect(screen.getByRole("toolbar", { name: "Trend line settings" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Drawing settings" }));

    expect(useDrawingUi.getState().settingsId).toBe("d1");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "Drawing settings sections" })).toBeTruthy();
    for (const tab of ["Style", "Text", "Coordinates", "Visibility"]) {
      expect(screen.getByRole("tab", { name: tab })).toBeTruthy();
    }
  });

  it("Cancel restores the snapshot and leaves no undo entry", () => {
    const before = useWorkspace.getState().drawingUndo.length;
    showBar();
    fireEvent.click(screen.getByRole("button", { name: "Drawing settings" }));

    const opacity = screen.getByRole("slider", { name: "Opacity" });
    fireEvent.change(opacity, { target: { value: "40" } });
    expect(useWorkspace.getState().activeChart().drawings[0]?.style.opacity).toBe(40);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(useDrawingUi.getState().settingsId).toBeNull();
    expect(useWorkspace.getState().activeChart().drawings[0]?.style.opacity).toBeUndefined();
    expect(useWorkspace.getState().drawingUndo.length).toBe(before);
  });

  it("OK commits the preview as one undo entry and teaches the tool the style", () => {
    const before = useWorkspace.getState().drawingUndo.length;
    showBar();
    fireEvent.click(screen.getByRole("button", { name: "Drawing settings" }));

    fireEvent.change(screen.getByRole("slider", { name: "Opacity" }), { target: { value: "55" } });
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    const s = useWorkspace.getState();
    expect(s.activeChart().drawings[0]?.style.opacity).toBe(55);
    expect(s.drawingUndo.length).toBe(before + 1);
    expect(s.drawingToolStyles.trend_line?.opacity).toBe(55);

    act(() => s.undoDrawing());
    expect(useWorkspace.getState().activeChart().drawings[0]?.style.opacity).toBeUndefined();
  });

  it("Visibility tab stores the timeframe filter without hiding other buckets", () => {
    showBar();
    fireEvent.click(screen.getByRole("button", { name: "Drawing settings" }));
    fireEvent.click(screen.getByRole("tab", { name: "Visibility" }));

    fireEvent.click(screen.getByRole("checkbox", { name: "Hours" }));
    expect(useWorkspace.getState().activeChart().drawings[0]?.visibility).toEqual({ hours: false });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(useWorkspace.getState().activeChart().drawings[0]?.visibility).toBeUndefined();
  });

  it("Coordinates tab edits an anchor price exactly", () => {
    showBar();
    fireEvent.click(screen.getByRole("button", { name: "Drawing settings" }));
    fireEvent.click(screen.getByRole("tab", { name: "Coordinates" }));

    fireEvent.change(screen.getByRole("spinbutton", { name: "Point 2 price" }), { target: { value: "123.45" } });
    expect(useWorkspace.getState().activeChart().drawings[0]?.points[1]?.price).toBe(123.45);

    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(useWorkspace.getState().activeChart().drawings[0]?.points[1]?.price).toBe(123.45);
  });
});
