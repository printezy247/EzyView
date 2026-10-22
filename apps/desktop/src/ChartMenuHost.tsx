import { useNavigate } from "react-router";
import { ChartContextMenu } from "./ChartContextMenu";
import type { DockTabId } from "./RightDock";
import { buildChartMenu } from "./chartMenu";
import type { ChartMenuActions } from "./chartMenu";
import { brokerFeed, precisionFor } from "./data";
import { toggleEventSwitch } from "./EventsControls";
import { getActiveExportSource } from "./exportBridge";
import { draftSideForPrice, useOrderDraft } from "./orderDraft";
import { DEFAULT_DRAWING_STYLE } from "@ezyview/drawing-tools";
import { uid, useWorkspace } from "./store";
import { linkGroupOf } from "./linkGroups";

/** Name of the vertical line "Lock vertical cursor line by time" drops on the chart. */
const LOCK_NAME = "Cursor lock";

export interface ChartMenuRequest {
  /** Viewport position of the right-click. */
  x: number;
  y: number;
  /** Time and price under the cursor. */
  time: number;
  price: number;
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
  const ws = useWorkspace();
  const chart = ws.activeChart();
  const { price, time } = request;
  const precision = precisionFor(price);

  const prefill = (side: "buy" | "sell", type: "limit" | "stop") => {
    if (!tradingOpen) onToggleTrading();
    useOrderDraft.getState().setDraft({ symbol: chart.symbol, side, type, price: price.toFixed(precision) });
  };

  const actions: ChartMenuActions = {
    resetView: () => getActiveExportSource()?.view?.reset(),
    copyPrice: () => {
      void navigator.clipboard?.writeText(price.toFixed(precision)).catch(() => {});
    },
    paste: () => ws.pasteDrawing({ time, price }),
    addAlert: () =>
      ws.addAlert(chart.symbol, { kind: "crossing", value: Number(price.toFixed(precision)) }, "once", `${chart.symbol} crossing ${price.toFixed(precision)}`),
    sellLimit: () => prefill("sell", "limit"),
    buyStop: () => prefill("buy", "stop"),
    addOrder: () => prefill(draftSideForPrice(price, getActiveExportSource()?.getCandles().at(-1)?.close ?? null), "limit"),
    toggleCursorLock: () => {
      const existing = chart.drawings.find((d) => d.name === LOCK_NAME);
      if (existing) ws.deleteDrawing(existing.id);
      else
        ws.setDrawings([
          ...chart.drawings,
          { id: uid(), tool: "vertical_line", points: [{ time, price }], style: { ...DEFAULT_DRAWING_STYLE }, name: LOCK_NAME },
        ]);
    },
    openTable: onOpenTable,
    toggleObjectTree: () => onOpenDockTab("objects"),
    saveTemplate: onSaveTemplate,
    applyTemplate: ws.applyChartTemplate,
    deleteTemplate: ws.deleteChartTemplate,
    removeIndicator: ws.removeIndicator,
    toggleEvent: (key) => toggleEventSwitch(useWorkspace.getState().eventOptions, key),
    openSettings: () => (onOpenSettings ? onOpenSettings() : navigate("/settings?tab=appearance")),
    openLinkGroup: onOpenLinkGroup,
  };

  const entries = buildChartMenu({
    symbol: chart.symbol,
    price,
    precision,
    mt5: brokerFeed(),
    hasClipboard: ws.drawingClipboard !== null,
    cursorLocked: chart.drawings.some((d) => d.name === LOCK_NAME),
    objectTreeOpen: dockTab === "objects",
    indicators: chart.indicators.map((i) => ({ uid: i.uid, name: i.name ?? i.def.name })),
    templates: ws.chartTemplates.map((t) => ({ id: t.id, name: t.name })),
    eventOptions: ws.eventOptions,
    linkGroup: linkGroupOf(chart),
    actions,
  });

  return <ChartContextMenu x={request.x} y={request.y} entries={entries} onClose={onClose} />;
}
