import { useNavigate } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { ChartContextMenu } from "./ChartContextMenu";
import type { DockTabId } from "./RightDock";
import { buildChartMenu } from "./chartMenu";
import type { ChartMenuActions } from "./chartMenu";
import { brokerFeed, precisionFor } from "./data";
import { toggleEventSwitch } from "./EventsControls";
import { getActiveExportSource } from "./exportBridge";
import { draftSideForPrice, useOrderDraft } from "./orderDraft";
import { DEFAULT_DRAWING_STYLE, getDrawingLevels, priceAt } from "@ezyview/drawing-tools";
import { uid, useWorkspace } from "./store";
import { activeChartOf } from "./layout";
import { linkGroupOf } from "./linkGroups";
import { applyDrawingTemplate, listDrawingTemplates, saveDrawingTemplate } from "./drawingTemplates";
import { useDrawingUi } from "./drawingUi";
import { drawingLabel } from "./ObjectTree";

/** Name of the vertical line "Lock vertical cursor line by time" drops on the chart. */
const LOCK_NAME = "Cursor lock";

export interface ChartMenuRequest {
  /** Viewport position of the right-click. */
  x: number;
  y: number;
  /** Time and price under the cursor. */
  time: number;
  price: number;
  /** Drawing under the cursor, when it opened on one. */
  drawingId?: string;
}

interface Props {
  request: ChartMenuRequest;
  tradingOpen: boolean;
  /** Which dock tab is visible, or null when the dock is closed. */
  dockTab: DockTabId | null;
  /** Toggle a docked panel ("objects", "trading", ...). */
  onOpenDockTab: (id: "objects") => void;
  onToggleTrading: () => void;
  onOpenTable: () => void;
  onSaveTemplate: () => void;
  /** Open the link-group dialog for the focused cell. */
  onOpenLinkGroup: () => void;
  onOpenSettings?: () => void;
  onClose: () => void;
}

/**
 * Wires the chart's right-click menu to the app: builds the entries from the
 * store and the cursor position, and gives each one its action. Order items
 * only prefill the order ticket; they never send anything.
 */
export function ChartMenuHost({
  request,
  tradingOpen,
  dockTab,
  onOpenDockTab,
  onToggleTrading,
  onOpenTable,
  onSaveTemplate,
  onOpenLinkGroup,
  onOpenSettings,
  onClose,
}: Props) {
  const navigate = useNavigate();
  // Only the focused chart and the actions the menu calls: a whole-store
  // subscription re-rendered the menu on every quote tick and drawing drag.
  const {
    symbol,
    drawings,
    indicators,
    linkGroup,
    alerts,
    drawingClipboard,
    chartTemplates,
    eventOptions,
    pasteDrawing,
    addAlert,
    deleteDrawing,
    setDrawings,
    applyChartTemplate,
    deleteChartTemplate,
    removeIndicator,
    duplicateDrawing,
    copyDrawing,
    updateDrawing,
    moveDrawing,
  } = useWorkspace(
    useShallow((s) => ({
      symbol: activeChartOf(s.activeLayout()).symbol,
      drawings: activeChartOf(s.activeLayout()).drawings,
      indicators: activeChartOf(s.activeLayout()).indicators,
      linkGroup: activeChartOf(s.activeLayout()).linkGroup,
      alerts: s.alerts,
      drawingClipboard: s.drawingClipboard,
      chartTemplates: s.chartTemplates,
      eventOptions: s.eventOptions,
      pasteDrawing: s.pasteDrawing,
      addAlert: s.addAlert,
      deleteDrawing: s.deleteDrawing,
      setDrawings: s.setDrawings,
      applyChartTemplate: s.applyChartTemplate,
      deleteChartTemplate: s.deleteChartTemplate,
      removeIndicator: s.removeIndicator,
      duplicateDrawing: s.duplicateDrawing,
      copyDrawing: s.copyDrawing,
      updateDrawing: s.updateDrawing,
      moveDrawing: s.moveDrawing,
    })),
  );
  const { price, time } = request;
  const precision = precisionFor(price);

  const prefill = (side: "buy" | "sell", type: "limit" | "stop") => {
    if (!tradingOpen) onToggleTrading();
    useOrderDraft.getState().setDraft({ symbol: symbol, side, type, price: price.toFixed(precision) });
  };

  const actions: ChartMenuActions = {
    resetView: () => getActiveExportSource()?.view?.reset(),
    copyPrice: () => {
      void navigator.clipboard?.writeText(price.toFixed(precision)).catch(() => {});
    },
    paste: () => pasteDrawing({ time, price }),
    addAlert: () =>
      addAlert(symbol, { kind: "crossing", value: Number(price.toFixed(precision)) }, "once", `${symbol} crossing ${price.toFixed(precision)}`),
    sellLimit: () => prefill("sell", "limit"),
    buyStop: () => prefill("buy", "stop"),
    addOrder: () => prefill(draftSideForPrice(price, getActiveExportSource()?.getCandles().at(-1)?.close ?? null), "limit"),
    toggleCursorLock: () => {
      const existing = drawings.find((d) => d.name === LOCK_NAME);
      if (existing) deleteDrawing(existing.id);
      else
        setDrawings([
          ...drawings,
          { id: uid(), tool: "vertical_line", points: [{ time, price }], style: { ...DEFAULT_DRAWING_STYLE }, name: LOCK_NAME },
        ]);
    },
    openTable: onOpenTable,
    toggleObjectTree: () => onOpenDockTab("objects"),
    saveTemplate: onSaveTemplate,
    applyTemplate: applyChartTemplate,
    deleteTemplate: deleteChartTemplate,
    removeIndicator: removeIndicator,
    toggleEvent: (key) => toggleEventSwitch(useWorkspace.getState().eventOptions, key),
    openSettings: () => (onOpenSettings ? onOpenSettings() : navigate("/settings?tab=appearance")),
    openLinkGroup: onOpenLinkGroup,
  };

  // A right-click on a drawing gets its own section; the rest of the chart
  // menu still follows, so nothing is lost when the target is a shape.
  const target = request.drawingId ? drawings.find((d) => d.id === request.drawingId) : undefined;
  const levels = target ? getDrawingLevels(target, request.time) : [];
  const targetLevel = levels[0];
  const levelPrice = targetLevel?.price ?? (target ? (priceAt(target, request.time) ?? target.points[0]?.price) : undefined);
  const hasLevel = target !== undefined && levelPrice !== undefined && Number.isFinite(levelPrice);
  const drawing = target
    ? {
        id: target.id,
        label: drawingLabel(target),
        locked: target.locked === true,
        hidden: target.hidden === true,
        hasAlert: alerts.some((a) => a.drawingId === target.id),
        hasLevel,
        templates: listDrawingTemplates().map((t) => ({ id: t.id, name: t.name })),
        actions: {
          settings: () => useDrawingUi.getState().openSettings(target.id, "style"),
          addAlert: () => {
            if (levelPrice === undefined) return;
            addAlert(
              symbol,
              { kind: "crossing", value: levelPrice },
              "once_per_bar_close",
              `${drawingLabel(target)} @ ${levelPrice.toFixed(precision)}`,
              target.id,
              targetLevel?.key,
            );
          },
          saveTemplate: () => saveDrawingTemplate(uniqueDrawingTemplateName(drawingLabel(target)), target.style),
          applyTemplate: (id: string) => void applyDrawingTemplate(id, target.id),
          clone: () => duplicateDrawing(target.id),
          copy: () => copyDrawing(target.id),
          toggleLock: () => updateDrawing(target.id, { locked: !target.locked }),
          toggleHide: () => updateDrawing(target.id, { hidden: !target.hidden }),
          move: (to: "front" | "forward" | "backward" | "back") => moveDrawing(target.id, to),
          remove: () => deleteDrawing(target.id),
        },
      }
    : undefined;

  const entries = buildChartMenu({
    symbol: symbol,
    price,
    precision,
    mt5: brokerFeed(),
    hasClipboard: drawingClipboard !== null,
    cursorLocked: drawings.some((d) => d.name === LOCK_NAME),
    objectTreeOpen: dockTab === "objects",
    indicators: indicators.map((i) => ({ uid: i.uid, name: i.name ?? i.def.name })),
    templates: chartTemplates.map((t) => ({ id: t.id, name: t.name })),
    eventOptions: eventOptions,
    linkGroup: linkGroupOf({ linkGroup }),
    ...(drawing ? { drawing } : {}),
    actions,
  });

  return <ChartContextMenu x={request.x} y={request.y} entries={entries} onClose={onClose} />;
}

/** "Trend line" → "Trend line template", bumped until it is unique. */
function uniqueDrawingTemplateName(base: string): string {
  const names = new Set(listDrawingTemplates().map((t) => t.name));
  const root = `${base} template`;
  if (!names.has(root)) return root;
  for (let i = 2; i < 100; i++) {
    const candidate = `${root} ${i}`;
    if (!names.has(candidate)) return candidate;
  }
  return `${root} ${Date.now().toString(36)}`;
}
