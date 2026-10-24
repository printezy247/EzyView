import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FundamentalEventOverlay, TradingLine } from "@ezyview/chart-engine";
import { buildSources } from "@ezyview/fundamentals";
import { ChartHost } from "./ChartHost";
import type { DrawingBox } from "./ChartHost";
import { SourceWarning } from "./SourceWarning";
import { ChartCommandInput } from "./ChartCommandInput";
import { DrawingToolbar } from "./DrawingToolbar";
import { DrawingSettingsModal } from "./DrawingSettingsModal";
import { FavoriteDrawingsBar } from "./FavoriteDrawingsBar";
import { FloatingDrawingBar } from "./FloatingDrawingBar";
import { ReplayBar } from "./ReplayBar";
import { RightDock } from "./RightDock";
import type { DockTab, DockTabId } from "./RightDock";
import { DepthOfMarket } from "./DepthOfMarket";
import { TradingPanel } from "./TradingPanel";
import { Watchlist } from "./Watchlist";
import { activeChartOf, cellCount } from "./layout";
import { groupsInUse, linkGroupOf } from "./linkGroups";
import type { Layout } from "./store";
import type { GridMode } from "./layout";
import { ObjectTree } from "./ObjectTree";
import { TimeAndSales } from "./TimeAndSales";
import { LinkGroupDialog } from "./LinkGroupDialog";
import { sessionForSymbol } from "./sessionFor";
import { safeHistory } from "./data";
import { precisionForSymbol } from "./pricePrecision";
import { useQuote } from "./quotePoller";
import { useWorkspace } from "./store";
import type { ChartState } from "./store";
import { themeColors } from "@ezyview/brand";
import { useTrading, useTradingTicks } from "./trading";
import { useApiKeys } from "./apiKeys";
import { BarsTable } from "./BarsTable";
import { ChartBottomBar } from "./ChartBottomBar";
import { ChartMenuHost } from "./ChartMenuHost";
import type { ChartMenuRequest } from "./ChartMenuHost";
import { TemplateNameDialog } from "./TemplateNameDialog";
import { eventsActive } from "./eventOptions";
import { EMPTY_FUNDAMENTAL_EVENTS, fetchFundamentalEvents } from "./fundamentalEvents";
import { publishCrosshair, subscribeCrosshair } from "./crosshairBus";
import type { CrosshairMessage } from "./crosshairBus";
import { getActiveExportSource, setActiveExportSource } from "./exportBridge";
import { useShortcut } from "./shortcuts";
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
  const layout = useWorkspace((s) => s.activeLayout());
  const state = activeChartOf(layout);
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
  }, [layout.activeChart]);

  useEffect(() => {
    const st = useWorkspace.getState();
    if (st.selectedDrawingId && !state.drawings.some((d) => d.id === st.selectedDrawingId)) {
      st.selectDrawing(null);
    }
  }, [layout.activeChart, state.drawings]);

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
    when: () => useWorkspace.getState().selectedDrawingId !== null,
    run: () => {
      const id = useWorkspace.getState().selectedDrawingId;
      if (id) useWorkspace.getState().deleteDrawing(id);
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
    when: () => useWorkspace.getState().selectedDrawingId !== null,
    run: () => useWorkspace.getState().copyDrawing(),
  });
  useShortcut({
    id: "chart.duplicate",
    combo: "Mod+D",
    when: () => useWorkspace.getState().selectedDrawingId !== null,
    run: () => {
      const id = useWorkspace.getState().selectedDrawingId;
      if (id) useWorkspace.getState().duplicateDrawing(id);
    },
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

  // The dock tabs were rebuilt on every render, and the chart page re-renders
  // on every crosshair frame.
  const dockTabs = useMemo<DockTab[]>(
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
        render: () => <DepthOfMarket symbol={state.symbol} precision={precisionForSymbol(state.symbol, null)} />,
      },
      {
        id: "objects",
        label: "Objects",
        hint: "Drawings and indicators on this chart",
        badge: state.drawings.length,
        render: () => <ObjectTree onClose={() => onSelectDockTab("objects")} />,
      },
      {
        id: "tape",
        label: "Tape",
        hint: "Time & sales — recent quote ticks for the active symbol",
        render: () => <TimeAndSales />,
      },
    ],
    [onOpenAlerts, onSelectDockTab, state.symbol, state.drawings.length],
  );

  return (
    <>
      <div className="relative flex min-h-0 flex-1">
        <DrawingToolbar />

        <main aria-label="Charts" className="relative min-w-0 flex-1">
          <ChartGrid
            layout={layout}
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

        <RightDock
          active={dockTab}
          onSelect={onSetDockTab}
          tabs={dockTabs}
        />
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
          current={linkGroupOf(state)}
          available={groupsInUse(layout.charts)}
          onPick={setLinkGroup}
          onClose={() => setLinkGroupOpen(false)}
        />
      )}

      {tradingOpen && <TradingPanel symbol={state.symbol} />}

      <ReplayBar totalBars={historyBars} />
    </>
  );
}

const NO_LINES: TradingLine[] = [];

const GRID_CLASS: Record<GridMode, string> = {
  "1": "grid-cols-1 grid-rows-1",
  "2h": "grid-cols-2 grid-rows-1",
  "2v": "grid-cols-1 grid-rows-2",
  "4": "grid-cols-2 grid-rows-2",
  "6": "grid-cols-3 grid-rows-2",
  "8": "grid-cols-4 grid-rows-2",
  "9": "grid-cols-3 grid-rows-3",
};

interface ChartGridProps {
  layout: Layout;
  replayBar: number | null;
  linesFor: (symbol: string) => TradingLine[];
  /** Which levels on a symbol a pointer may drag, or undefined = none. */
  draggableLevelsFor: (symbol: string) => { id: string; price: number }[] | undefined;
  onLevelPreview: (symbol: string, id: string, price: number) => void;
  onLevelCommit: (symbol: string, levels: { stopLoss?: number; takeProfit?: number }) => void;
  /** Focused cell's symbol — its overlays apply to matching cells only. */
  activeSymbol: string;
  fundamentalEvents: FundamentalEventOverlay;
  onCrosshairTime: (t: number | null) => void;
  crosshairTime: number | null;
  /** Focused cell's pointer position, mirrored into the other cells. */
  syncCrosshair: { time: number; price: number } | null;
  /** Crosshair from another EzyView window; used for cells on the same symbol. */
  remoteCrosshair: CrosshairMessage | null;
  /** Cell under the pointer; its crosshair is the user's, never a mirror. */
  hoverIndex: number | null;
  onHover: (index: number | null) => void;
  syncOn: boolean;
  onCrosshairMove: (t: number | null, p: number | null) => void;
  onFocus: (index: number) => void;
  onContextMenu: (index: number, info: { clientX: number; clientY: number; time: number; price: number; drawingId?: string }) => void;
  /** Box of the selected drawing in the focused cell, for the floating bar. */
  drawingBox: { index: number; box: DrawingBox } | null;
  onDrawingBox: (index: number, box: DrawingBox | null) => void;
}

/**
 * The layout's chart cells. Each cell keeps its own symbol and interval; the
 * focused one (blue outline) is what the toolbar, studies and drawings act on.
 */
function ChartGrid({
  layout,
  replayBar,
  linesFor,
  draggableLevelsFor,
  onLevelPreview,
  onLevelCommit,
  activeSymbol,
  fundamentalEvents,
  onCrosshairTime,
  crosshairTime,
  syncCrosshair,
  remoteCrosshair,
  hoverIndex,
  onHover,
  syncOn,
  onCrosshairMove,
  onFocus,
  onContextMenu,
  drawingBox,
  onDrawingBox,
}: ChartGridProps) {
  const [maximizedCell, setMaximizedCell] = useState<number | null>(null);
  const cells: ChartState[] = layout.charts.slice(0, cellCount(layout.grid));
  const multi = cells.length > 1;

  // Alt+Enter toggles single-cell maximize
  useShortcut({
    id: "chart.maximize-cell",
    combo: "Alt+Enter",
    when: () => layout.grid !== "1",
    run: () => setMaximizedCell((cur) => (cur === null ? layout.activeChart : null)),
  });

  // The focused cell's link group. When it has one, the crosshair mirror stays
  // inside that group; when it has none, the mirror keeps reaching every cell.
  const focusedGroup = linkGroupOf(cells[layout.activeChart] ?? {});
  const remoteFor = (symbol: string) =>
    remoteCrosshair && remoteCrosshair.symbol === symbol && remoteCrosshair.time !== null && remoteCrosshair.price !== null
      ? { time: remoteCrosshair.time, price: remoteCrosshair.price }
      : null;
  // Export acts on the focused cell (the same `index === layout.activeChart`
  // test each cell uses below): its bridge id is the cell index. This lives in
  // the component body — a hook cannot run inside the cells.map callback —
  // and runs after ChartHost's registration effect, child-before-parent.
  useEffect(() => {
    setActiveExportSource(layout.activeChart);
  }, [layout.activeChart]);

  const renderCells = maximizedCell !== null ? [cells[maximizedCell] ?? cells[0]!] : cells;
  const gridClass = maximizedCell !== null ? "grid-cols-1 grid-rows-1" : GRID_CLASS[layout.grid];

  return (
    <div className={`absolute inset-0 grid gap-px bg-ev-raised ${gridClass}`}>
      {renderCells.map((chart, i) => {
        const index = maximizedCell !== null ? maximizedCell : i;
        const focused = index === layout.activeChart;
        return (
          <section
            key={index}
            aria-label={`Chart ${index + 1}: ${chart.symbol} ${chart.resolution}`}
            aria-current={multi && focused ? "true" : undefined}
            // Capture so focus moves before the chart handles the click.
            onPointerDownCapture={() => onFocus(index)}
            onFocusCapture={() => onFocus(index)}
            onPointerEnter={() => onHover(index)}
            onPointerLeave={() => onHover(null)}
            className="relative min-h-0 min-w-0 bg-ev-bg"
          >
            <ChartHost
              key={`${layout.id}:${index}`}
              chartIndex={index}
              symbol={chart.symbol}
              resolution={chart.resolution}
              chartType={chart.chartType}
              showVolume={chart.showVolume}
              showVolumeProfile={chart.showVolumeProfile ?? false}
              boxSize={chart.boxSize ?? null}
              showGrid={chart.showGrid}
              showVertGrid={chart.showVertGrid}
              showHorzGrid={chart.showHorzGrid}
              gridVertColor={chart.chartSettings?.canvas.vertGridColor}
              gridHorzColor={chart.chartSettings?.canvas.horzGridColor}
              crosshairColor={chart.chartSettings?.canvas.crosshairColor}
              crosshairStyle={chart.chartSettings?.canvas.crosshairStyle}
              showLastPrice={chart.chartSettings?.scales.symbolLastPriceLabel ?? true}
              theme={chart.theme}
              indicators={chart.indicators}
              drawings={chart.drawings}
              replayBar={focused ? replayBar : null}
              tradingLines={linesFor(chart.symbol)}
              session={chart.showSessionBreaks !== false ? sessionForSymbol(chart.symbol) : null}
              draggableLevels={focused ? draggableLevelsFor(chart.symbol) : undefined}
              onLevelPreview={onLevelPreview}
              onLevelCommit={onLevelCommit}
              fundamentalEvents={chart.symbol === activeSymbol ? fundamentalEvents : undefined}
              crosshairMode={chart.crosshairMode}
              priceScale={chart.priceScale}
              invertScale={chart.invertScale}
              timezone={chart.timezone}
              dataSource={chart.dataSource}
              watermark={chart.watermark}
              syncCrosshair={
                !syncOn || hoverIndex === index
                  ? null
                  : focused
                    ? remoteFor(chart.symbol)
                    : focusedGroup && linkGroupOf(chart) !== focusedGroup
                      ? // A linked cell mirrors only into its own group.
                        null
                      : (syncCrosshair ?? remoteFor(chart.symbol))
              }
              onContextMenu={(info) => onContextMenu(index, info)}
              onCrosshairTime={focused ? onCrosshairTime : undefined}
              onCrosshairMove={focused ? onCrosshairMove : undefined}
              onDrawingBox={focused ? (box) => onDrawingBox(index, box) : undefined}
            />
            {focused && <FloatingDrawingBar anchor={drawingBox?.index === index ? drawingBox.box : null} />}
            <Readout
              symbol={multi ? `${chart.symbol} · ${chart.resolution}` : chart.symbol}
              rawSymbol={chart.symbol}
              time={focused ? crosshairTime : null}
              indicators={chart.indicators}
              showGrid={chart.showGrid}
              showVolume={chart.showVolume}
              focused={focused}
              chartIndex={index}
              multi={multi}
              isMaximized={maximizedCell !== null}
              onToggleMaximize={() => setMaximizedCell((cur) => (cur === null ? index : null))}
              dataSource={chart.dataSource}
            />
            {multi && focused && (
              <div className="pointer-events-none absolute inset-0 z-10 ring-1 ring-inset ring-ev-accent" aria-hidden />
            )}
          </section>
        );
      })}
    </div>
  );
}

function Readout({
  symbol,
  rawSymbol,
  time,
  indicators,
  showGrid,
  showVolume,
  focused = true,
  chartIndex,
  multi = false,
  isMaximized = false,
  onToggleMaximize,
  dataSource,
}: {
  symbol: string;
  rawSymbol: string;
  time: number | null;
  indicators: ChartState["indicators"];
  showGrid: boolean;
  showVolume: boolean;
  focused?: boolean;
  chartIndex?: number;
  multi?: boolean;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  dataSource?: ChartState["dataSource"];
}) {
  const submit = useTrading((s) => s.submit);
  const updateIndicator = useWorkspace((s) => s.updateIndicator);
  const removeIndicator = useWorkspace((s) => s.removeIndicator);
  const addIndicator = useWorkspace((s) => s.addIndicator);
  const updateChart = useWorkspace((s) => s.updateChart);
  const activeIndex = useWorkspace((s) => s.activeLayout().activeChart);
  const targetIndex = chartIndex ?? activeIndex;
  const watchedPrice = useWorkspace((s) => s.watchlist.find((w) => w.symbol === rawSymbol)?.price ?? null);
  const { quote } = useQuote(rawSymbol, { source: dataSource, intervalMs: 2000 });

  const [qty, setQty] = useState<number>(1);
  const [collapsed, setCollapsed] = useState(false);
  const [tradeBoxVisible, setTradeBoxVisible] = useState(true);
  const [studyQuickOpen, setStudyQuickOpen] = useState(false);
  const [floatHudVisible, setFloatHudVisible] = useState(true);

  const displayPrice = quote?.last ?? watchedPrice;
  const liveChangePct = quote?.changePercent ?? null;
  const digits = precisionForSymbol(rawSymbol, displayPrice);
  const spread = displayPrice !== null ? Math.max(Math.pow(10, -digits) * 2, displayPrice * 0.00015) : 0;
  const bid = displayPrice !== null ? (displayPrice - spread / 2).toFixed(digits) : null;
  const ask = displayPrice !== null ? (displayPrice + spread / 2).toFixed(digits) : null;

  return (
    <>
      <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-col gap-1.5 text-dense text-ev-muted">
        {/* Top Symbol + Live Price + Quick Controls Row */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded bg-ev-bg/85 px-2 py-1 backdrop-blur-xs">
          <button
            type="button"
            title={collapsed ? "Expand chart legend" : "Collapse chart legend"}
            aria-label="Chart legend"
            aria-expanded={!collapsed}
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed((v) => !v);
            }}
            className="min-h-6 min-w-6 rounded px-1 text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
          >
            <span aria-hidden>{collapsed ? "▸" : "▾"}</span>
          </button>
          {multi && onToggleMaximize && (
            <button
              type="button"
              title={isMaximized ? "Restore grid (Alt+Enter)" : "Maximize chart (Alt+Enter)"}
              aria-label="Maximize chart"
              aria-pressed={isMaximized}
              onClick={(e) => {
                e.stopPropagation();
                onToggleMaximize();
              }}
              className="min-h-6 min-w-6 rounded px-1 text-ev-muted hover:bg-ev-raised hover:text-ev-strong cursor-pointer"
            >
              <span aria-hidden>{isMaximized ? "⤡" : "⤢"}</span>
            </button>
          )}
          <span role="status" className="sr-only">
            {multi && onToggleMaximize ? (isMaximized ? "Chart maximized" : "Chart grid restored") : ""}
            {collapsed ? ". Legend collapsed" : ""}
          </span>
          <span className="font-semibold text-ev-strong">{symbol}</span>
          {displayPrice !== null && (
            <span className="num font-semibold text-ev-strong">{displayPrice.toFixed(digits)}</span>
          )}
          {liveChangePct !== null && (
            <span className={`num text-micro font-medium ${liveChangePct >= 0 ? "text-ev-up-text" : "text-ev-down-text"}`}>
              {liveChangePct >= 0 ? "+" : ""}
              {liveChangePct.toFixed(2)}%
            </span>
          )}
          {time !== null && <span className="text-micro text-ev-faint">{new Date(time * 1000).toLocaleString()}</span>}

          <button
            type="button"
            title={tradeBoxVisible ? "Hide 1-click Buy/Sell buttons" : "Show 1-click Buy/Sell buttons"}
            aria-pressed={tradeBoxVisible}
            onClick={(e) => {
              e.stopPropagation();
              setTradeBoxVisible((v) => !v);
            }}
            className={`ml-1 rounded border px-1.5 py-px text-micro ${
              tradeBoxVisible
                ? "border-ev-accent/40 bg-ev-accent/15 text-ev-accent-text"
                : "border-ev-line text-ev-muted hover:text-ev-strong"
            }`}
          >
            B/S
          </button>

          <div className="relative">
            <button
              type="button"
              title="Quickly add popular indicator to chart"
              onClick={(e) => {
                e.stopPropagation();
                setStudyQuickOpen((v) => !v);
              }}
              className="rounded border border-ev-line bg-ev-panel px-1.5 py-px text-micro text-ev-muted hover:border-ev-dim hover:text-ev-strong"
            >
              + Study ▾
            </button>
            {studyQuickOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute left-0 top-full z-20 mt-1 flex w-36 flex-col rounded border border-ev-line bg-ev-panel py-1 shadow-xl"
              >
                {[
                  { id: "ema", label: "EMA (20)" },
                  { id: "sma", label: "SMA (20)" },
                  { id: "rsi", label: "RSI (14)" },
                  { id: "bb", label: "Bollinger Bands" },
                  { id: "macd", label: "MACD" },
                  { id: "vwap", label: "VWAP" },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      addIndicator(s.id);
                      setStudyQuickOpen(false);
                    }}
                    className="px-2.5 py-1 text-left text-dense text-ev-text hover:bg-ev-raised hover:text-ev-strong"
                  >
                    + {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* TradingView-style 1-Click Bid / Qty / Ask Trade Box (hideable) */}
        {!collapsed && tradeBoxVisible && (
          <div className="pointer-events-auto flex items-center gap-1">
            <button
              type="button"
              title={`Quick market sell ${qty} of ${rawSymbol}`}
              onClick={(e) => {
                e.stopPropagation();
                void submit({ symbol: rawSymbol, side: "sell", type: "market", qty });
              }}
              className="flex items-center gap-1.5 rounded border border-ev-down/60 bg-ev-down/15 px-2 py-0.5 text-micro font-semibold text-ev-down-text shadow-xs hover:bg-ev-down hover:text-white"
            >
              <span>SELL</span>
              {bid && <span className="num font-bold">{bid}</span>}
            </button>

            <select
              aria-label="Quick order quantity"
              title="1-click order quantity / lot size"
              value={qty}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setQty(Number(e.target.value))}
              className="num h-5 rounded border border-ev-line bg-ev-panel px-1 text-center text-micro text-ev-strong"
            >
              {[0.01, 0.1, 0.5, 1, 2, 5, 10].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>

            <button
              type="button"
              title={`Quick market buy ${qty} of ${rawSymbol}`}
              onClick={(e) => {
                e.stopPropagation();
                void submit({ symbol: rawSymbol, side: "buy", type: "market", qty });
              }}
              className="flex items-center gap-1.5 rounded border border-ev-up/60 bg-ev-up/15 px-2 py-0.5 text-micro font-semibold text-ev-up-text shadow-xs hover:bg-ev-up hover:text-white"
            >
              <span>BUY</span>
              {ask && <span className="num font-bold">{ask}</span>}
            </button>
          </div>
        )}
        {!collapsed && tradeBoxVisible && <SourceWarning source={dataSource} className="pointer-events-auto rounded bg-ev-bg/85 px-2 py-0.5" />}

        {/* Active Study Legend Chips */}
        {!collapsed && indicators.length > 0 && (
          <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
            {indicators.map((ind) => (
              <span
                key={ind.uid}
                className={`inline-flex items-center gap-1 rounded border border-ev-line/60 bg-ev-panel/90 px-1.5 py-0.5 text-micro shadow-xs ${
                  ind.hidden ? "text-ev-faint line-through" : "text-ev-text"
                }`}
              >
                <button
                  type="button"
                  title={ind.hidden ? `Show ${ind.def.name}` : `Hide ${ind.def.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateIndicator(ind.uid, { hidden: !ind.hidden });
                  }}
                  className="hover:text-ev-strong"
                >
                  {ind.name ?? ind.def.name}
                  {Object.keys(ind.params).length > 0 && ` (${Object.values(ind.params).join(",")})`}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${ind.name ?? ind.def.name}`}
                  title="Remove indicator"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeIndicator(ind.uid);
                  }}
                  className="text-ev-faint hover:text-ev-down-text"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Hideable Floating Bottom-Center Chart Controls Pill (TradingView style) - focused cell only */}
      {focused && (
        <div className="pointer-events-auto absolute bottom-8 left-1/2 z-10 -translate-x-1/2">
          {floatHudVisible ? (
            <div className="flex items-center gap-1 rounded-full border border-ev-line bg-ev-panel/90 px-2.5 py-0.5 text-micro text-ev-muted shadow-lg backdrop-blur-xs">
              <button
                type="button"
                title="Reset chart zoom & scroll"
                onClick={(e) => {
                  e.stopPropagation();
                  getActiveExportSource()?.view?.reset();
                }}
                className="rounded px-1.5 py-0.5 hover:bg-ev-raised hover:text-ev-strong"
              >
                Reset view
              </button>
              <button
                type="button"
                title="Fit price scale to visible bars"
                onClick={(e) => {
                  e.stopPropagation();
                  getActiveExportSource()?.view?.autoScale();
                }}
                className="rounded px-1.5 py-0.5 hover:bg-ev-raised hover:text-ev-strong"
              >
                Auto fit
              </button>
              <button
                type="button"
                title="Toggle chart grid lines"
                onClick={(e) => {
                  e.stopPropagation();
                  updateChart(targetIndex, { showGrid: !showGrid });
                }}
                className={`rounded px-1.5 py-0.5 ${showGrid ? "text-ev-accent-text" : "hover:text-ev-strong"}`}
              >
                Grid
              </button>
              <button
                type="button"
                title="Toggle volume histogram"
                onClick={(e) => {
                  e.stopPropagation();
                  updateChart(targetIndex, { showVolume: !showVolume });
                }}
                className={`rounded px-1.5 py-0.5 ${showVolume ? "text-ev-accent-text" : "hover:text-ev-strong"}`}
              >
                Vol
              </button>
              <button
                type="button"
                title="Hide floating chart controls"
                onClick={(e) => {
                  e.stopPropagation();
                  setFloatHudVisible(false);
                }}
                className="ml-0.5 rounded px-1 text-ev-faint hover:text-ev-strong"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              type="button"
              title="Show floating chart controls"
              onClick={(e) => {
                e.stopPropagation();
                setFloatHudVisible(true);
              }}
              className="rounded-full border border-ev-line bg-ev-panel/75 px-2 py-0.5 text-micro text-ev-faint hover:bg-ev-panel hover:text-ev-strong"
            >
              •••
            </button>
          )}
        </div>
      )}
    </>
  );
}

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
