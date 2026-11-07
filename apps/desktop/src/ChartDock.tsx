import { useMemo } from "react";
import { useWorkspace } from "./store";
import { selectActiveDrawingCount, selectActiveSymbol } from "./store/selectors";
import { RightDock } from "./RightDock";
import type { DockTab, DockTabId } from "./RightDock";
import { Watchlist } from "./Watchlist";
import { DepthOfMarket } from "./DepthOfMarket";
import { ObjectTree } from "./ObjectTree";
import { TimeAndSales } from "./TimeAndSales";
import { precisionForSymbol } from "./pricePrecision";

interface Props {
  /** Which dock tab is visible, or null when the dock is closed. */
  active: DockTabId | null;
  onSelect: (id: DockTabId | null) => void;
  onOpenAlerts: () => void;
}

/**
 * The chart's right-hand dock and the panels it hosts. Kept beside the chart
 * page so the page itself only composes regions, not panel wiring.
 */
export function ChartDock({ active, onSelect, onOpenAlerts }: Props) {
  const symbol = useWorkspace(selectActiveSymbol);
  const drawingCount = useWorkspace(selectActiveDrawingCount);

  const tabs = useMemo<DockTab[]>(
    () => [
      {
        id: "watchlist",
        label: "Watchlist",
        hint: "Quotes for the symbols you track",
        render: () => <Watchlist onOpenAlerts={onOpenAlerts} />,
      },
      {
        id: "depth",
        label: "Depth",
        hint: "Depth of market around the current price",
        render: () => <DepthOfMarket symbol={symbol} precision={precisionForSymbol(symbol, null)} />,
      },
      {
        id: "objects",
        label: "Objects",
        hint: "Drawings and indicators on this chart",
        badge: drawingCount,
        render: () => <ObjectTree onClose={() => onSelect("objects")} />,
      },
      {
        id: "tape",
        label: "Tape",
        hint: "Time & sales — recent quote ticks for the active symbol",
        render: () => <TimeAndSales />,
      },
    ],
    [drawingCount, onOpenAlerts, onSelect, symbol],
  );

  return <RightDock active={active} onSelect={onSelect} tabs={tabs} />;
}
