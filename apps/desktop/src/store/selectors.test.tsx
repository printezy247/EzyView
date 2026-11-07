// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Drawing } from "@ezyview/drawing-tools";

import { useWorkspace } from "../store";
import {
  selectActiveChartIndex,
  selectActiveDrawingCount,
  selectActiveGrid,
  selectActiveResolution,
  selectActiveSymbol,
  useActiveChart,
} from "./selectors";
import { defaultChartState, defaultLayout } from "./helpers";

/**
 * The narrow selectors.
 *
 * The workspace store replaces the layout object on every edit, and a
 * drawing drag writes once per pointer move. A component that subscribes to
 * the whole layout therefore re-renders on every frame of a drag. These
 * tests pin the opposite: a component that reads the symbol does not
 * re-render when a drawing moves, and one that reads the drawing count does.
 */

const line: Drawing = {
  id: "d1",
  tool: "trend_line",
  points: [
    { time: 1, price: 1 },
    { time: 2, price: 2 },
  ],
  style: { color: "#2962ff", width: 2, lineStyle: "solid" },
};

function resetWorkspace(): void {
  act(() => {
    const layout = defaultLayout(0);
    useWorkspace.setState({ layouts: [layout], activeLayoutId: layout.id });
  });
}

describe("narrow selectors", () => {
  it("read the focused cell's fields", () => {
    resetWorkspace();
    const state = useWorkspace.getState();
    expect(selectActiveSymbol(state)).toBe(defaultChartState().symbol);
    expect(selectActiveResolution(state)).toBe(defaultChartState().resolution);
    expect(selectActiveDrawingCount(state)).toBe(0);
  });

  it("read the layout's grid and focused cell index", () => {
    resetWorkspace();
    const state = useWorkspace.getState();
    expect(selectActiveGrid(state)).toBe("1");
    expect(selectActiveChartIndex(state)).toBe(0);
  });
});

describe("subscription narrowness", () => {
  it("does not re-render a symbol reader when a drawing moves", () => {
    resetWorkspace();
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useWorkspace(selectActiveSymbol);
    });
    const before = renders;

    act(() => {
      useWorkspace.getState().setDrawings([line]);
    });

    expect(result.current).toBe(defaultChartState().symbol);
    expect(renders, "a drawing edit must not re-render a symbol reader").toBe(before);
  });

  it("re-renders a drawing-count reader when a drawing is added", () => {
    resetWorkspace();
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useWorkspace(selectActiveDrawingCount);
    });
    const before = renders;

    act(() => {
      useWorkspace.getState().setDrawings([line]);
    });

    expect(renders).toBeGreaterThan(before);
  });

  it("re-renders a multi-field reader when one of its fields changes", () => {
    resetWorkspace();
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useActiveChart((c) => ({ symbol: c.symbol, resolution: c.resolution }));
    });
    const before = renders;

    act(() => {
      useWorkspace.getState().setResolution("1h");
    });

    expect(renders).toBeGreaterThan(before);
  });

  it("does not re-render a multi-field reader when an unrelated field changes", () => {
    resetWorkspace();
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useActiveChart((c) => ({ symbol: c.symbol, resolution: c.resolution }));
    });
    const before = renders;

    act(() => {
      useWorkspace.getState().setDrawings([line]);
    });

    expect(renders, "a drawing edit must not re-render a symbol+interval reader").toBe(before);
  });
});
