import { useShallow } from "zustand/react/shallow";

import { activeChartOf } from "../layout";
import type { ChartState, Layout } from "../layout";
import { useWorkspace } from "../store";
import type { WorkspaceStore } from "./types";

/**
 * Narrow store selectors.
 *
 * The workspace store replaces the layout object on every edit — a drawing
 * drag writes one per pointer move — so a component that subscribes to the
 * whole layout re-renders on every frame of an interaction, whether or not
 * it displays anything that changed.
 *
 * These selectors read one field at a time, so the shell re-renders when the
 * symbol changes and stays still when a trend line moves. Where a component
 * needs several fields, `useActiveChart` reads them together with a shallow
 * comparison: one re-render when one of *those* fields changes, and none
 * when something else does.
 */

/** The focused cell's symbol. */
export function selectActiveSymbol(state: WorkspaceStore): string {
  return activeChartOf(state.activeLayout()).symbol;
}

/** The focused cell's interval. */
export function selectActiveResolution(state: WorkspaceStore): string {
  return activeChartOf(state.activeLayout()).resolution;
}

/** The focused cell's chart theme. */
export function selectActiveChartTheme(state: WorkspaceStore): ChartState["theme"] {
  return activeChartOf(state.activeLayout()).theme;
}

/** How many drawings the focused cell holds. */
export function selectActiveDrawingCount(state: WorkspaceStore): number {
  return activeChartOf(state.activeLayout()).drawings.length;
}

/** How many indicators the focused cell holds. */
export function selectActiveIndicatorCount(state: WorkspaceStore): number {
  return activeChartOf(state.activeLayout()).indicators.length;
}

/** The layout's grid arrangement. */
export function selectActiveGrid(state: WorkspaceStore): Layout["grid"] {
  return state.activeLayout().grid;
}

/** The index of the focused cell inside its layout. */
export function selectActiveChartIndex(state: WorkspaceStore): number {
  return state.activeLayout().activeChart;
}

/**
 * Several fields of the focused cell at once.
 *
 * `useShallow` compares the returned object field by field, so the
 * component re-renders only when one of the fields it asked for actually
 * changed — not whenever any part of the layout is replaced.
 */
export function useActiveChart<T extends Record<string, unknown>>(
  pick: (chart: ChartState) => T,
): T {
  return useWorkspace(useShallow((s) => pick(activeChartOf(s.activeLayout()))));
}
