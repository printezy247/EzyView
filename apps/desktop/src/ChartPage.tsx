import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FundamentalEventOverlay, TradingLine } from "@ezyview/chart-engine";
import { buildSources } from "@ezyview/fundamentals";
import type { DrawingBox } from "./ChartHost";
import { ChartGrid } from "./ChartGrid";
import { ChartCommandInput } from "./ChartCommandInput";
import { DrawingToolbar } from "./DrawingToolbar";
import { DrawingSettingsModal } from "./DrawingSettingsModal";
import { FavoriteDrawingsBar } from "./FavoriteDrawingsBar";
import { ReplayBar } from "./ReplayBar";
import type { DockTabId } from "./RightDock";
import { ChartDock } from "./ChartDock";
import { TradingPanel } from "./TradingPanel";
import { groupsInUse, linkGroupOf } from "./linkGroups";
import { LinkGroupDialog } from "./LinkGroupDialog";
import { RESOLUTION_SECONDS, safeHistory } from "./data";
import { useShallow } from "zustand/react/shallow";
import { useWorkspace } from "./store";
import { selectActiveChartIndex, useActiveChart } from "./store/selectors";
import { themeColors } from "@ezyview/brand";
import { useTrading, useTradingTicks } from "./trading";
import { useApiKeys } from "./apiKeys";
import { BarsTable } from "./BarsTableView";
import { ChartBottomBar } from "./ChartBottomBar";
import { ChartMenuHost } from "./ChartMenuHost";
import type { ChartMenuRequest } from "./ChartMenuHost";
import { TemplateNameDialog } from "./TemplateNameDialog";
import { eventsActive } from "./eventOptions";
import { EMPTY_FUNDAMENTAL_EVENTS, fetchFundamentalEvents } from "./fundamentalEvents";
import { publishCrosshair, subscribeCrosshair } from "./crosshairBus";
import type { CrosshairMessage } from "./crosshairBus";
import { useShortcut } from "./shortcuts";
import { useDrawingUi } from "./drawingUi";
import { effectiveSource } from "./chartSource";
import { useMt5 } from "./mt5";

interface ChartPageProps {
  /** Which right-dock tab is visible, or null when the dock is closed. */
  dockTab: DockTabId | null;
  onSelectDockTab: (id: DockTabId) => void;
  /** Set the dock tab directly (null closes the dock); used by the dock's tabs. */
  onSetDockTab: (id: DockTabId | null) => void;
  tradingOpen: boolean;
  onToggleTrading: () => void;
  onOpenAlerts: () => void;
  /** Opens the `?` shortcut sheet from the chart's bottom bar. */
  onOpenHotkeys: () => void;
  onOpenSettings?: () => void;
}

/**
 * The chart workspace: grid, drawing toolbar, side panels, trading ticket,
 * replay bar and the quick command input. Navigation destinations live on
 * their own routes; only these side panels stay page-local booleans.
 */
export function ChartPage({
  dockTab,
  onSelectDockTab,
  onSetDockTab,
  tradingOpen,
  onToggleTrading,
  onOpenAlerts,
  onOpenHotkeys,
  onOpenSettings,
}: ChartPageProps) {
  // The chart page reads the focused cell's fields, not the whole layout: a
  // drawing drag replaces the layout object on every pointer move, and a page
  // subscribed to it would re-render its entire tree on every frame.
  const state = useActiveChart((c) => ({
    symbol: c.symbol,
    resolution: c.resolution,
    theme: c.theme,
    dataSource: c.dataSource,
    linkGroup: c.linkGroup,
  }));
  const activeChartIndex = useWorkspace(selectActiveChartIndex);
  const selectedDrawingId = useWorkspace((s) => s.selectedDrawingId);
  // The link-group names change only when a cell's group changes, so the
  // list is compared element by element rather than by reference.
  const linkGroupsInUse = useWorkspace(useShallow((s) => groupsInUse(s.activeLayout().charts)));
  const setLinkGroup = useWorkspace((s) => s.setLinkGroup);
  const setActiveChart = useWorkspace((s) => s.setActiveChart);
  const setSymbol = useWorkspace((s) => s.setSymbol);
  const setResolution = useWorkspace((s) => s.setResolution);
  const activeTool = useWorkspace((s) => s.activeTool);
  const replayBar = useWorkspace((s) => s.replayBar);
  const setReplay = useWorkspace((s) => s.setReplay);
  const positions = useTrading((s) => s.positions);
  const orders = useTrading((s) => s.orders);

  const watchlistSymbolKey = useWorkspace((s) => s.watchlistSymbolKey);
  const symbols = useMemo(() => (watchlistSymbolKey ? watchlistSymbolKey.split(",") : []), [watchlistSymbolKey]);
  // The command input offers only symbols this cell's feed can serve, and its
  // recents are kept per feed rather than in one cross-broker list.
  const globalFeed = useMt5((s) => s.source);
  const source = effectiveSource(state.dataSource, globalFeed);
  const allLayouts = useWorkspace((s) => s.layouts);
  const layoutChoices = useMemo(() => allLayouts.map((l) => ({ id: l.id, name: l.name })), [allLayouts]);
  const eventOptions = useWorkspace((s) => s.eventOptions);
  const apiKeys = useApiKeys((s) => s.keys);
  const [commandOpen, setCommandOpen] = useState(false);
  const [fundamentalEvents, setFundamentalEvents] = useState<FundamentalEventOverlay>(EMPTY_FUNDAMENTAL_EVENTS);
  const [historyBars, setHistoryBars] = useState(0);
  const [crosshairTime, setCrosshairTime] = useState<number | null>(null);
  const crosshairSync = useWorkspace((s) => s.crosshairSync);
  // Focused cell's pointer position, mirrored into every other cell when on.
  const [syncCross, setSyncCross] = useState<{ time: number; price: number } | null>(null);

  // Cell the pointer is over. Only a real hover publishes to other windows:
  // a mirrored crosshair also fires move events, and echoing those would
  // ping-pong between windows forever.
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const hoverRef = useRef<number | null>(null);
  const onHover = useCallback((index: number | null) => {
    const prev = hoverRef.current;
    hoverRef.current = index;
    setHoverIndex(index);
    const ws = useWorkspace.getState();
    if (index === null && prev !== null && ws.crosshairSync && prev === ws.activeLayout().activeChart) {
      publishCrosshair(ws.activeChart().symbol, null, null);
    }
  }, []);

  // Another window's pointer, mirrored onto cells showing the same symbol.
  const [remoteCross, setRemoteCross] = useState<CrosshairMessage | null>(null);
  useEffect(() => subscribeCrosshair((m) => setRemoteCross(m.time === null ? null : m)), []);

  // Right-click menu, Table view and the template-name dialog.
  const [menu, setMenu] = useState<ChartMenuRequest | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [linkGroupOpen, setLinkGroupOpen] = useState(false);
  const saveChartTemplate = useWorkspace((s) => s.saveChartTemplate);
  const onCellContextMenu = useCallback(
    (index: number, info: { clientX: number; clientY: number; time: number; price: number; drawingId?: string }) => {
      useWorkspace.getState().setActiveChart(index);
      setMenu({
        x: info.clientX,
        y: info.clientY,
        time: info.time,
        price: info.price,
        ...(info.drawingId ? { drawingId: info.drawingId } : {}),
      });
    },
    [],
  );

  // Screen box of the selected drawing on the focused cell, for the floating
  // mini-settings bar. Cleared when the cell switches or the drawing goes.
  const [drawingBox, setDrawingBox] = useState<{ index: number; box: DrawingBox } | null>(null);
  const onDrawingBox = useCallback((index: number, box: DrawingBox | null) => {
    setDrawingBox((prev) => {
      if (box) return { index, box };
      return prev && prev.index === index ? null : prev;
    });
  }, []);

  // A selection belongs to the cell it was made in; focusing another cell
  // must not leave the floating bar editing a drawing that is off-screen.
  useEffect(() => {
    setDrawingBox(null);
  }, [activeChartIndex]);

  useEffect(() => {
    if (!selectedDrawingId) return;
    // The drawings are read imperatively: the page must not subscribe to
    // them, or a drawing drag would re-render the whole page every frame.
    const drawings = useWorkspace.getState().activeChart().drawings;
    if (!drawings.some((d) => d.id === selectedDrawingId)) {
      useWorkspace.getState().selectDrawing(null);
    }
  }, [activeChartIndex, selectedDrawingId]);

  // Where the pointer last was on the focused chart; Ctrl+V pastes there.
  const lastCursorRef = useRef<{ time: number; price: number } | null>(null);

  const onCrosshairTime = useCallback((t: number | null) => setCrosshairTime(t), []);

  // Read at event time so the handler never re-subscribes on a toggle.
  // The pointer fires far faster than the screen refreshes, so the work is
  // coalesced into one update per frame: a mouse move used to re-render the
  // whole chart page, every cell and every side panel.
  const crosshairFrame = useRef<number | null>(null);
  const crosshairPending = useRef<{ t: number | null; p: number | null } | null>(null);

  const flushCrosshair = useCallback(() => {
    crosshairFrame.current = null;
    const next = crosshairPending.current;
    crosshairPending.current = null;
    if (!next) return;
    const { t, p } = next;
    setCrosshairTime(t);
    if (t !== null && p !== null) lastCursorRef.current = { time: t, price: p };
    const ws = useWorkspace.getState();
    const on = ws.crosshairSync;
    if (on && hoverRef.current === ws.activeLayout().activeChart) {
      publishCrosshair(ws.activeChart().symbol, t, p);
    }
    if (!on || t === null || p === null) {
      // Same-ref no-op keeps an already-cleared mirror from re-rendering.
      setSyncCross((prev) => (prev === null ? prev : null));
      return;
    }
    setSyncCross((prev) => (prev && prev.time === t && prev.price === p ? prev : { time: t, price: p }));
  }, []);

  const onCrosshairMove = useCallback(
    (t: number | null, p: number | null) => {
      crosshairPending.current = { t, p };
      if (crosshairFrame.current === null) {
        crosshairFrame.current = requestAnimationFrame(flushCrosshair);
      }
    },
    [flushCrosshair],
  );

  // A pending frame must not land on an unmounted page.
  useEffect(
    () => () => {
      if (crosshairFrame.current !== null) cancelAnimationFrame(crosshairFrame.current);
    },
    [],
  );

  // Turning sync off drops the mirror so every cell clears its imposed crosshair.
  useEffect(() => {
    if (!crosshairSync) setSyncCross(null);
  }, [crosshairSync]);

  // The replay transport needs the bar count for its slider range.
  useEffect(() => {
    let cancelled = false;
    setReplay(null);
    void safeHistory(state.symbol, state.resolution).then((candles) => {
      if (!cancelled) setHistoryBars(candles.length);
    });
    return () => {
      cancelled = true;
    };
  }, [state.symbol, state.resolution, setReplay]);

  // Earnings markers + macro lines for the active symbol. The sources factory
  // resolves live providers from saved API keys and falls back to demo data;
  // any fetch failure degrades to an empty overlay (no toast).
  useEffect(() => {
    if (!eventsActive(eventOptions)) {
      setFundamentalEvents(EMPTY_FUNDAMENTAL_EVENTS);
      return;
    }
    let cancelled = false;
    const sources = buildSources(apiKeys);
    void fetchFundamentalEvents(sources, state.symbol, Date.now() / 1000, eventOptions).then((overlay) => {
      if (!cancelled) setFundamentalEvents(overlay);
    });
    return () => {
      cancelled = true;
    };
  }, [eventOptions, state.symbol, apiKeys]);

  // Escape clears the armed drawing tool, like TradingView.
  // Undo/redo: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z. "/" or Ctrl+K opens commands.
  useShortcut({
    id: "chart.escape",
    combo: "Escape",
    priority: 20,
    allowInInput: true,
    when: () => {
      const ws = useWorkspace.getState();
      return ws.activeTool !== null || ws.selectedDrawingId !== null || commandOpen;
    },
    run: () => {
      useWorkspace.getState().setActiveTool(null);
      useWorkspace.getState().selectDrawing(null);
      setCommandOpen(false);
    },
  });
  useShortcut({
    id: "chart.delete-drawing",
    combo: ["Delete", "Backspace"],
    when: () => useWorkspace.getState().selectedDrawingIds.length > 0,
    run: () => useWorkspace.getState().deleteSelectedDrawings(),
  });
  useShortcut({
    id: "chart.select-all-drawings",
    combo: "Mod+A",
    when: () => useWorkspace.getState().activeChart().drawings.length > 0,
    run: () => useWorkspace.getState().selectAllDrawings(),
  });
  useShortcut({
    id: "chart.cycle-drawings",
    combo: ["Tab", "Shift+Tab"],
    priority: 30,
    when: () => useWorkspace.getState().selectedDrawingIds.length > 0,
    run: (event) => {
      const ws = useWorkspace.getState();
      const drawings = [...ws.activeChart().drawings].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
      if (drawings.length === 0) return;
      const current = drawings.findIndex((d) => d.id === ws.selectedDrawingId);
      const delta = event.shiftKey ? -1 : 1;
      const next = drawings[(current + delta + drawings.length) % drawings.length]!;
      ws.selectDrawing(next.id);
    },
  });
  useShortcut({
    id: "chart.open-drawing-settings",
    combo: "Enter",
    when: () => useWorkspace.getState().selectedDrawingId !== null,
    run: () => {
      const id = useWorkspace.getState().selectedDrawingId;
      if (id) useDrawingUi.getState().openSettings(id, "style");
    },
  });
  useShortcut({
    id: "chart.nudge-drawing",
    combo: [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Shift+ArrowLeft",
      "Shift+ArrowRight",
      "Shift+ArrowUp",
      "Shift+ArrowDown",
      "Alt+ArrowLeft",
      "Alt+ArrowRight",
    ],
    priority: 40,
    allowRepeat: true,
    when: () => useWorkspace.getState().selectedDrawingIds.length > 0,
    run: (event) => {
      const ws = useWorkspace.getState();
      const drawing = ws.activeChart().drawings.find((d) => d.id === ws.selectedDrawingId);
      const price = Math.abs(drawing?.points[0]?.price ?? 1);
      const bar = RESOLUTION_SECONDS[ws.activeChart().resolution] ?? 60;
      const tStep = event.altKey ? bar : bar / 10;
      const pStep = Math.max(price * 0.0005, 1e-8) * (event.altKey ? 1 : event.shiftKey ? 10 : 1);
      const dTime = event.key === "ArrowLeft" ? -tStep : event.key === "ArrowRight" ? tStep : 0;
      const dPrice = event.key === "ArrowDown" ? -pStep : event.key === "ArrowUp" ? pStep : 0;
      ws.nudgeSelectedDrawings(dTime, dPrice);
    },
  });
  useShortcut({
    id: "chart.command-input",
    combo: "/",
    when: () => !commandOpen,
    run: () => setCommandOpen(true),
  });
  useShortcut({
    id: "chart.command-input-shift",
    combo: "Mod+Shift+K",
    run: () => setCommandOpen((v) => !v),
  });
  useShortcut({
    id: "chart.undo",
    combo: "Mod+Z",
    run: () => useWorkspace.getState().undoDrawing(),
  });
  useShortcut({
    id: "chart.redo",
    combo: ["Mod+Y", "Mod+Shift+Z"],
    run: () => useWorkspace.getState().redoDrawing(),
  });
  useShortcut({
    id: "chart.copy",
    combo: "Mod+C",
    when: () => useWorkspace.getState().selectedDrawingIds.length > 0,
    run: () => useWorkspace.getState().copyDrawing(),
  });
  useShortcut({
    id: "chart.duplicate",
    combo: "Mod+D",
    when: () => useWorkspace.getState().selectedDrawingIds.length > 0,
    run: () => useWorkspace.getState().duplicateSelectedDrawings(),
  });
  useShortcut({
    id: "chart.paste",
    combo: "Mod+V",
    when: () => lastCursorRef.current !== null && useWorkspace.getState().drawingClipboard !== null,
    run: () => {
      const at = lastCursorRef.current;
      if (at) useWorkspace.getState().pasteDrawing(at);
    },
  });

  // The engine only needs ticks where it has something at stake: an open
  // position or a resting order, plus the chart's symbol while the ticket can
  // be used to open one.
  const amend = useTrading((s) => s.amend);
  const exposure = new Set<string>(positions.map((p) => p.symbol));
  for (const order of orders) exposure.add(order.symbol);
  if (tradingOpen) exposure.add(state.symbol);
  useTradingTicks([...exposure].sort().join("|"));

  // Entry/stop/target for the position on this chart, as constant price lines.
  // Built once per positions change, so each cell gets a stable array and the
  // chart only redraws its lines when a fill actually changes them.
  const lineColor = useCallback((role: "accent" | "up" | "down") => themeColors(state.theme)[role], [state.theme]);
  const linesBySymbol = useMemo(() => {
    const out = new Map<string, TradingLine[]>();
    for (const position of positions) {
      const lines: TradingLine[] = [
        { price: position.entryPrice, color: lineColor("accent"), title: position.side === "long" ? "LONG" : "SHORT" },
      ];
      if (position.stopLoss !== undefined) {
        lines.push({ price: position.stopLoss, color: lineColor("down"), title: "SL", dashed: true });
      }
      if (position.takeProfit !== undefined) {
        lines.push({ price: position.takeProfit, color: lineColor("up"), title: "TP", dashed: true });
      }
      if (!out.has(position.symbol)) out.set(position.symbol, lines);
    }
    return out;
  }, [positions, lineColor]);
  const linesFor = useCallback((symbol: string) => linesBySymbol.get(symbol) ?? NO_LINES, [linesBySymbol]);

  // The stop/target a drag may grab, plus the price the line should render at
  // while the drag is live. Kept here rather than in the store: it is a
  // transient pointer preview, not workspace state.
  const [levelPreview, setLevelPreview] = useState<{ symbol: string; id: string; price: number } | null>(null);
  const draggableLevelsFor = useCallback(
    (symbol: string) => {
      const position = positions.find((p) => p.symbol === symbol);
      if (!position) return undefined;
      const out: { id: string; price: number }[] = [];
      if (position.stopLoss !== undefined) {
        out.push({ id: "SL", price: levelPreview?.symbol === symbol && levelPreview.id === "SL" ? levelPreview.price : position.stopLoss });
      }
      if (position.takeProfit !== undefined) {
        out.push({ id: "TP", price: levelPreview?.symbol === symbol && levelPreview.id === "TP" ? levelPreview.price : position.takeProfit });
      }
      return out.length > 0 ? out : undefined;
    },
    [positions, levelPreview],
  );
  const onLevelPreview = useCallback((symbol: string, id: string, price: number) => setLevelPreview({ symbol, id, price }), []);
  const onLevelCommit = useCallback(
    (symbol: string, levels: { stopLoss?: number; takeProfit?: number }) => {
      setLevelPreview(null);
      void amend(symbol, levels);
    },
    [amend],
  );

  return (
    <>
      <div className="relative flex min-h-0 flex-1">
        <DrawingToolbar />

        <main aria-label="Charts" className="relative min-w-0 flex-1">
          <ChartGrid
            replayBar={replayBar}
            linesFor={linesFor}
            draggableLevelsFor={draggableLevelsFor}
            onLevelPreview={onLevelPreview}
            onLevelCommit={onLevelCommit}
            activeSymbol={state.symbol}
            fundamentalEvents={fundamentalEvents}
            onCrosshairTime={onCrosshairTime}
            crosshairTime={crosshairTime}
            syncCrosshair={syncCross}
            remoteCrosshair={remoteCross}
            hoverIndex={hoverIndex}
            onHover={onHover}
            syncOn={crosshairSync}
            onCrosshairMove={onCrosshairMove}
            onFocus={setActiveChart}
            onContextMenu={onCellContextMenu}
            drawingBox={drawingBox}
            onDrawingBox={onDrawingBox}
          />
          {activeTool && <ToolHint tool={activeTool} />}
          <FavoriteDrawingsBar />
          {commandOpen && (
            <ChartCommandInput
              open={commandOpen}
              symbols={symbols}
              currentSymbol={state.symbol}
              currentResolution={state.resolution}
              source={source}
              layouts={layoutChoices}
              onClose={() => setCommandOpen(false)}
              onApply={(symbol, resolution) => {
                if (symbol) setSymbol(symbol);
                if (resolution) setResolution(resolution as never);
              }}
              onApplyLayout={(id) => useWorkspace.getState().setActiveLayout(id)}
            />
          )}
        </main>

        <ChartDock active={dockTab} onSelect={onSetDockTab} onOpenAlerts={onOpenAlerts} />
      </div>

      <ChartBottomBar onOpenHotkeys={onOpenHotkeys} />

      <DrawingSettingsModal />

      {menu && (
        <ChartMenuHost
          request={menu}
          tradingOpen={tradingOpen}
          dockTab={dockTab}
          onOpenDockTab={onSelectDockTab}
          onToggleTrading={onToggleTrading}
          onOpenTable={() => setTableOpen(true)}
          onSaveTemplate={() => setNameOpen(true)}
          onOpenLinkGroup={() => setLinkGroupOpen(true)}
          onOpenSettings={onOpenSettings}
          onClose={() => setMenu(null)}
        />
      )}
      {tableOpen && <BarsTable onClose={() => setTableOpen(false)} />}
      {nameOpen && <TemplateNameDialog onSave={saveChartTemplate} onClose={() => setNameOpen(false)} />}
      {linkGroupOpen && (
        <LinkGroupDialog
          open
          current={linkGroupOf({ linkGroup: state.linkGroup })}
          available={linkGroupsInUse}
          onPick={setLinkGroup}
          onClose={() => setLinkGroupOpen(false)}
        />
      )}

      {tradingOpen && <TradingPanel symbol={state.symbol} />}

      <ReplayBar totalBars={historyBars} symbol={state.symbol} resolution={state.resolution} />
    </>
  );
}

const NO_LINES: TradingLine[] = [];

const TOOL_HINTS: Record<string, string> = {
  trend_line: "Click two points",
  ray: "Click the origin and a direction",
  extended_line: "Click two points on the line",
  horizontal_line: "Click once",
  vertical_line: "Click once",
  parallel_channel: "Click the base start, base end, then offset",
  rectangle: "Click two corners",
  ellipse: "Click two opposite corners of the bounding box",
  triangle: "Click three corners",
  fib_retracement: "Click the swing start and end",
  fib_extension: "Click start, end, then the projection anchor",
  arrow: "Click the tail and the head",
  text: "Click where the text should sit",
  brush: "Drag to paint, release to commit",
  measure: "Click the start and end of the range",
  long_position: "Click entry, stop, then target",
  short_position: "Click entry, stop, then target",
};

function ToolHint({ tool }: { tool: string }) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded border border-ev-line bg-ev-panel px-2.5 py-1 text-dense text-ev-text shadow-lg">
      {TOOL_HINTS[tool] ?? "Click to place"} · Esc to cancel
    </div>
  );
}
