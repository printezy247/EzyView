import { lazy, Suspense, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { ChartPage } from "./ChartPage";
import { ErrorBoundary } from "./ErrorBoundary";
import { IndicatorDialog } from "./IndicatorDialog";
import { ChartSettingsDialog } from "./ChartSettingsDialog";
import { TabBar } from "./TabBar";
import { Toolbar } from "./Toolbar";
import type { DockTabId } from "./Toolbar";
import { AlertDialog } from "./AlertDialog";
import { ApiKeysDialog } from "./ApiKeysDialog";
import { useApiKeys } from "./apiKeys";
import { openChartWindow } from "./windows";
import { NavRail } from "./NavRail";
import { useZen } from "./zen";
import { TradeConfirmDialog } from "./TradeConfirmDialog";
import { HotkeySheet } from "./HotkeySheet";
import { MarketClock } from "./MarketClockBar";
import { useWorkspace } from "./store";
import { activeChartOf } from "./layout";
import { themeWindowColor } from "@ezyview/brand";
import { normalizePath, rememberRoute } from "./nav";
import { bootstrapMt5, getMt5, useMt5 } from "./mt5";
import { useMt5Accounts } from "./mt5Accounts";
import { NoticeHost } from "./NoticeHost";
import { Button, Toaster, buttonClass } from "./ui";
import { useShortcut, useShortcutDispatcher } from "./shortcuts";
import { quoteOf } from "./data";
import { SourceToggle } from "./SourceToggle";
import { FeedStatus } from "./FeedStatus";

const MarketsPage = lazy(() => import("./MarketsPage").then((m) => ({ default: m.MarketsPage })));
const TradePage = lazy(() => import("./TradePage").then((m) => ({ default: m.TradePage })));
const ResearchPage = lazy(() => import("./ResearchPage").then((m) => ({ default: m.ResearchPage })));
const JournalPage = lazy(() => import("./JournalPage").then((m) => ({ default: m.JournalPage })));
const StrategiesPage = lazy(() => import("./StrategiesPage").then((m) => ({ default: m.StrategiesPage })));
const AlertsPage = lazy(() => import("./AlertsPage").then((m) => ({ default: m.AlertsPage })));
const SettingsPage = lazy(() => import("./SettingsPage").then((m) => ({ default: m.SettingsPage })));

/**
 * The persistent shell: left section rail, tab strip, toolbar, routed page
 * area, dialogs and the status footer. Navigation destinations are routes;
 * only the chart's side panels (watchlist/depth/objects/trading) are
 * page-local booleans, handed down to the chart page.
 */
/** Footer nav links share the kit ghost-button hover language. */
const footerLink = buttonClass({ size: "sm", variant: "ghost" });

export default function App() {
  const {
    layout,
    updateActive,
    setSymbol,
    alerts,
    addAlert,
    removeAlert,
  } = useWorkspace(
    useShallow((s) => ({
      layout: s.activeLayout(),
      updateActive: s.updateActive,
      setSymbol: s.setSymbol,
      alerts: s.alerts,
      addAlert: s.addAlert,
      removeAlert: s.removeAlert,
    })),
  );
  const state = activeChartOf(layout);

  // F11 toggles fullscreen "zen" mode (nav rail and tabs hidden); Esc leaves it.
  // Every binding registers with the one dispatcher; layers (modal, menu) own
  // the keyboard until they close, so Esc closes them before it exits zen.
  const zen = useZen((s) => s.on);
  useShortcutDispatcher();

  const [dialogOpen, setDialogOpen] = useState(false);
  const apiKeysOpen = useApiKeys((s) => s.dialogOpen);
  const openApiKeys = useApiKeys((s) => s.openDialog);
  useEffect(() => {
    void useApiKeys.getState().reload();
  }, []);
  const [tradingOpen, setTradingOpen] = useState(true);
  // One right-hand dock, one visible tab. Collapsed by default so chart has maximum workspace (TradingView style).
  const [dockTab, setDockTab] = useState<DockTabId | null>(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertSeedPrice, setAlertSeedPrice] = useState<number | null>(null);
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  const [chartSettingsOpen, setChartSettingsOpen] = useState(false);
  const [shortcutFeedback, setShortcutFeedback] = useState<string | null>(null);

  useShortcut({
    id: "app.fullscreen",
    combo: "F11",
    allowInInput: true,
    run: () => useZen.getState().toggle(),
  });
  useShortcut({
    id: "app.exit-zen",
    combo: "Escape",
    when: () => {
      const ws = useWorkspace.getState();
      return !ws.activeTool && !ws.selectedDrawingId;
    },
    run: () => useZen.getState().exit(),
  });
  useShortcut({
    id: "app.new-layout",
    combo: "Mod+Shift+N",
    run: () => useWorkspace.getState().addLayout(),
  });
  useShortcut({
    id: "app.hotkey-sheet",
    combo: "Shift+?",
    run: () => setHotkeysOpen((v) => !v),
  });
  useShortcut({
    id: "app.focus-mode",
    combo: "Mod+Alt+E",
    run: () => setShortcutFeedback("⚡ EzyView Focus Active (Ctrl+Alt+E)"),
  });

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      import("@tauri-apps/api/event")
        .then(({ listen }) => {
          listen("shortcut-focused", () => {
            setShortcutFeedback("⚡ EzyView Focus Active (Ctrl+Alt+E)");
          })
            .then((u) => {
              unlisten = u;
            })
            .catch(() => {});
        })
        .catch(() => {});
    }
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!shortcutFeedback) return;
    const t = setTimeout(() => setShortcutFeedback(null), 2000);
    return () => clearTimeout(t);
  }, [shortcutFeedback]);

  useEffect(() => {
    if (!alertOpen) return;
    let cancelled = false;
    const watched = useWorkspace.getState().watchlist.find((w) => w.symbol === state.symbol)?.price ?? null;
    if (watched !== null) setAlertSeedPrice(watched);
    void quoteOf(state.symbol)
      .then((q) => {
        if (!cancelled && q) setAlertSeedPrice(q.last);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [alertOpen, state.symbol]);

  // Remember the last visited route so reloads land where the user left off.
  const location = useLocation();
  useEffect(() => {
    rememberRoute(location.pathname);
  }, [location.pathname]);

  // Footer badge: broker status + whether an account session is live.
  const mt5Status = useMt5((s) => s.status);
  const session = useMt5Accounts((s) => s.session);
  const mt5Badge =
    mt5Status === "online" ? (session ? "bg-ev-up" : "bg-ev-accent") : mt5Status === "error" ? "bg-ev-down" : "";

  // The shell's colour tokens follow the app theme setting (Settings →
  // Appearance); `auto` follows the focused chart, which is how the app
  // behaved before the brand pass.
  const appTheme = useWorkspace((s) => s.appTheme);
  const shellTheme = appTheme === "auto" ? state.theme : appTheme;
  const density = useWorkspace((s) => s.density);
  useEffect(() => {
    document.documentElement.dataset.theme = shellTheme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", themeWindowColor(shellTheme));
  }, [shellTheme]);

  // Density is a CSS contract: `[data-density]` rules in styles.css scale the
  // shared row height, so a row does not need its own density prop.
  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  // Honour a remembered broker feed once, if MT5 answers on first load.
  useEffect(() => {
    void bootstrapMt5();
  }, []);

  // On the broker feed a demo ticker (BINANCE:…) resolves to nothing, so swap
  // to a symbol the terminal actually knows rather than leaving a blank chart.
  const source = useMt5((s) => s.source);
  useEffect(() => {
    if (source !== "mt5" || !state.symbol.includes(":")) return;
    let cancelled = false;
    void getMt5()
      .data.searchSymbols("")
      .then(([first]) => {
        if (!cancelled && first) setSymbol(first.symbol);
      });
    return () => {
      cancelled = true;
    };
  }, [source, state.symbol, updateActive]);

  // The dock holds the three side panels as tabs; trading is the bottom strip.
  // Journal, research and strategies are routes, not panels.
  const selectDockTab = (id: DockTabId) => setDockTab((v) => (v === id ? null : id));
  const setDockTabDirect = (id: DockTabId | null) => setDockTab(id);
  const toggleTrading = () => setTradingOpen((v) => !v);

  return (
    <div className="flex h-full">
      <h1 className="sr-only">EzyView</h1>
      {!zen && <NavRail />}
      <div className="flex min-w-0 flex-1 flex-col bg-ev-bg text-ev-text">
        <header className="contents">
          {!zen && <TabBar />}

          <Toolbar
            dockTab={dockTab}
            tradingOpen={tradingOpen}
            onOpenIndicators={() => setDialogOpen(true)}
            onOpenAlerts={() => setAlertOpen(true)}
            onOpenApiKeys={openApiKeys}
            onOpenWindow={() => void openChartWindow(state.symbol, state.resolution)}
            onOpenSettings={() => setChartSettingsOpen(true)}
            onSelectDockTab={selectDockTab}
            onToggleTrading={toggleTrading}
          />
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <Suspense
            fallback={
              <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-base text-ev-muted">
                Loading...
              </div>
            }
          >
            <Routes>
              <Route index element={<Navigate to={normalizePath("/")} replace />} />
              <Route
                path="/chart"
                element={
                  <ErrorBoundary
                    fallback={(reset) => (
                      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-ev-bg p-6 text-center">
                        <p className="text-body font-semibold text-ev-strong">Chart render encountered an error.</p>
                        <p className="max-w-md text-base text-ev-muted">
                          A chart error was caught and isolated so the rest of the application remains functional.
                        </p>
                        <div className="flex items-center gap-2">
                          <Button size="lg" onClick={reset}>
                            Retry Chart
                          </Button>
                          <Button
                            size="lg"
                            variant="ghost"
                            onClick={() => {
                              useWorkspace.getState().updateActive({ indicators: [], drawings: [] });
                              reset();
                            }}
                            className="bg-ev-raised text-ev-strong hover:bg-ev-line"
                          >
                            Reset Chart to Clean State
                          </Button>
                        </div>
                      </div>
                    )}
                  >
                    <ChartPage
                      dockTab={dockTab}
                      onSelectDockTab={selectDockTab}
                      onSetDockTab={setDockTabDirect}
                      tradingOpen={tradingOpen}
                      onToggleTrading={toggleTrading}
                      onOpenAlerts={() => setAlertOpen(true)}
                      onOpenHotkeys={() => setHotkeysOpen(true)}
                      onOpenSettings={() => setChartSettingsOpen(true)}
                    />
                  </ErrorBoundary>
                }
              />
              <Route path="/markets" element={<MarketsPage />} />
              <Route path="/trade" element={<TradePage />} />
              <Route path="/research" element={<ResearchPage />} />
              <Route path="/journal" element={<JournalPage />} />
              <Route path="/strategies" element={<StrategiesPage />} />
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              {/* Legacy paths: a persisted last route or an old bookmark still lands. */}
              <Route path="/fundamentals" element={<Navigate to="/research?tab=fundamentals" replace />} />
              <Route path="/options" element={<Navigate to="/research?tab=options" replace />} />
              <Route path="/pine" element={<Navigate to="/strategies" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </div>

        <IndicatorDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
        <ChartSettingsDialog open={chartSettingsOpen} onClose={() => setChartSettingsOpen(false)} />
        {shortcutFeedback && (
          <div
            role="status"
            aria-live="polite"
            className="fixed top-3 right-6 z-[9999] rounded bg-ev-accent px-3 py-1.5 text-dense font-semibold text-white shadow-lg animate-fade-in pointer-events-none"
          >
            {shortcutFeedback}
          </div>
        )}
        {apiKeysOpen && <ApiKeysDialog />}
        <TradeConfirmDialog />
        <AlertDialog
          open={alertOpen}
          onClose={() => setAlertOpen(false)}
          alerts={alerts.filter((a) => a.symbol === state.symbol)}
          onAdd={addAlert}
          onRemove={removeAlert}
          symbol={state.symbol}
          lastPrice={alertSeedPrice}
        />

        <footer className="flex h-7 shrink-0 items-center gap-3 overflow-x-auto border-t border-ev-raised bg-ev-chrome px-3 text-dense text-ev-muted">
          <SourceToggle />
          <FeedStatus symbol={state.symbol} />

          <div className="h-3.5 w-px shrink-0 bg-ev-raised" />

          {/* TradingView-style bottom drawer & workspace quick-toggles */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={tradingOpen}
              aria-label="Toggle bottom Trading Panel and Order Ticket"
              title="Toggle bottom Trading Panel & Order Ticket"
              onClick={toggleTrading}
              className={tradingOpen ? "bg-ev-accent/20 font-medium text-ev-accent-text" : undefined}
            >
              Trading Panel
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={dockTab === "watchlist"}
              aria-label="Toggle right-hand Watchlist dock"
              title="Toggle right-hand Watchlist dock"
              onClick={() => selectDockTab("watchlist")}
              className={dockTab === "watchlist" ? "bg-ev-raised font-medium text-ev-strong" : undefined}
            >
              Watchlist
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={dockTab === "depth"}
              aria-label="Toggle right-hand Depth of Market dock"
              title="Toggle right-hand Depth of Market (DOM)"
              onClick={() => selectDockTab("depth")}
              className={dockTab === "depth" ? "bg-ev-raised font-medium text-ev-strong" : undefined}
            >
              DOM
            </Button>
            <Link to="/markets" title="Open Stock, Crypto & Forex Screener / Heatmaps" className={footerLink}>
              Screener & Heatmaps
            </Link>
            <Link to="/strategies" title="Open Pine Script Editor & Strategy Tester" className={footerLink}>
              Pine Editor
            </Link>
            <Link to="/journal" title="Open Trading Journal & AI Coach" className={footerLink}>
              Journal
            </Link>
          </div>

          <span className="hidden lg:inline">
            {state.drawings.length} drawing{state.drawings.length === 1 ? "" : "s"}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-3">
            <MarketClock />
            <Link
              to="/settings"
              title="Settings — MT5 connection, broker logins, safety rails"
              className={footerLink}
            >
              Settings
              {mt5Badge && <span className={`ml-1 inline-block size-1.5 rounded-full ${mt5Badge}`} aria-hidden />}
            </Link>
            <span className="uppercase">{state.theme}</span>
          </span>
        </footer>
      </div>
      <NoticeHost />
      <Toaster />
      {hotkeysOpen && <HotkeySheet onClose={() => setHotkeysOpen(false)} />}
    </div>
  );
}

