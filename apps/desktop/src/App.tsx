import { lazy, Suspense, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { ChartPage } from "./ChartPage";
import { ErrorBoundary } from "./ErrorBoundary";
import { IndicatorDialog } from "./IndicatorDialog";
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
import type { ChartSource } from "./mt5";
import { useMt5Accounts } from "./mt5Accounts";
import { maskLogin } from "./tradingSafety";
import { Modal } from "./Modal";
import { NoticeHost } from "./NoticeHost";
import { isTypingTarget } from "./hotkeys";
import { isLivePublicSymbol, quoteOf } from "./data";
import { useTrading } from "./trading";

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
export default function App() {
  const {
    layout,
    setGrid,
    updateActive,
    setSymbol,
    setResolution,
    alerts,
    addAlert,
    removeAlert,
    replayBar,
    setReplay,
  } = useWorkspace(
    useShallow((s) => ({
      layout: s.activeLayout(),
      setGrid: s.setGrid,
      updateActive: s.updateActive,
      setSymbol: s.setSymbol,
      setResolution: s.setResolution,
      alerts: s.alerts,
      addAlert: s.addAlert,
      removeAlert: s.removeAlert,
      replayBar: s.replayBar,
      setReplay: s.setReplay,
    })),
  );
  const state = activeChartOf(layout);

  // F11 toggles fullscreen "zen" mode (nav rail and tabs hidden); Esc leaves it.
  // An open menu swallows Escape first, so Esc closes the menu before it exits.
  const zen = useZen((s) => s.on);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        useZen.getState().toggle();
      } else if (e.key === "Escape") {
        useZen.getState().exit();
      } else if (
        e.key === "?" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !(e.target instanceof HTMLElement && isTypingTarget(e.target))
      ) {
        e.preventDefault();
        setHotkeysOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [dialogOpen, setDialogOpen] = useState(false);
  const apiKeysOpen = useApiKeys((s) => s.dialogOpen);
  const openApiKeys = useApiKeys((s) => s.openDialog);
  useEffect(() => {
    void useApiKeys.getState().reload();
  }, []);
  const [tradingOpen, setTradingOpen] = useState(true);
  // One right-hand dock, one visible tab. The watchlist used to default open;
  // the dock starts on watchlist so the default view is unchanged.
  const [dockTab, setDockTab] = useState<DockTabId | null>("watchlist");
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertSeedPrice, setAlertSeedPrice] = useState<number | null>(null);
  const [hotkeysOpen, setHotkeysOpen] = useState(false);

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
            symbol={state.symbol}
            resolution={state.resolution}
            chartType={state.chartType}
            showVolume={state.showVolume}
            showVolumeProfile={state.showVolumeProfile ?? false}
            showGrid={state.showGrid}
            indicatorCount={state.indicators.length}
            onSymbol={(symbol) => setSymbol(symbol)}
            onResolution={(resolution) => setResolution(resolution)}
            onChartType={(chartType) => updateActive({ chartType })}
            onToggleVolume={() => updateActive({ showVolume: !state.showVolume })}
            onToggleVolumeProfile={() => updateActive({ showVolumeProfile: !state.showVolumeProfile })}
            boxSize={state.boxSize ?? null}
            onBoxSize={(boxSize) => updateActive({ boxSize })}
            onToggleGrid={() => updateActive({ showGrid: !state.showGrid })}
            onSetTheme={(theme) => updateActive({ theme })}
            theme={state.theme}
            crosshairMode={state.crosshairMode ?? "normal"}
            onCrosshairMode={(crosshairMode) => updateActive({ crosshairMode })}
            priceScale={state.priceScale ?? "normal"}
            onPriceScale={(priceScale) => updateActive({ priceScale })}
            invertScale={state.invertScale ?? false}
            onInvertScale={() => updateActive({ invertScale: !state.invertScale })}
            timezone={state.timezone}
            onTimezone={(timezone) => updateActive({ timezone })}
            watermark={state.watermark ?? false}
            onWatermark={() => updateActive({ watermark: !state.watermark })}
            sessionBreaks={state.showSessionBreaks !== false}
            onToggleSessionBreaks={() => updateActive({ showSessionBreaks: state.showSessionBreaks === false })}
            onOpenIndicators={() => setDialogOpen(true)}
            onToggleReplay={() => setReplay(replayBar === null ? -30 : null)}
            replayActive={replayBar !== null}
            dockTab={dockTab}
            tradingOpen={tradingOpen}
            onOpenWindow={() => void openChartWindow(state.symbol, state.resolution)}
            onOpenAlerts={() => setAlertOpen(true)}
            onOpenApiKeys={openApiKeys}
            onSelectDockTab={selectDockTab}
            onToggleTrading={toggleTrading}
            grid={layout.grid}
            onGrid={setGrid}
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
                          <button
                            type="button"
                            onClick={reset}
                            className="rounded bg-ev-accent px-3 py-1.5 text-base font-medium text-white hover:bg-ev-accent-hover"
                          >
                            Retry Chart
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              useWorkspace.getState().updateActive({ indicators: [], drawings: [] });
                              reset();
                            }}
                            className="rounded bg-ev-raised px-3 py-1.5 text-base font-medium text-ev-strong hover:bg-ev-line"
                          >
                            Reset Chart to Clean State
                          </button>
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
            <button
              type="button"
              aria-pressed={tradingOpen}
              title="Toggle bottom Trading Panel & Order Ticket"
              onClick={toggleTrading}
              className={`rounded px-2 py-0.5 font-medium ${
                tradingOpen ? "bg-ev-accent/20 text-ev-accent-text" : "hover:bg-ev-raised hover:text-ev-strong"
              }`}
            >
              Trading Panel
            </button>
            <button
              type="button"
              aria-pressed={dockTab === "watchlist"}
              title="Toggle right-hand Watchlist dock"
              onClick={() => selectDockTab("watchlist")}
              className={`rounded px-2 py-0.5 ${
                dockTab === "watchlist" ? "bg-ev-raised font-medium text-ev-strong" : "hover:bg-ev-raised hover:text-ev-strong"
              }`}
            >
              Watchlist
            </button>
            <button
              type="button"
              aria-pressed={dockTab === "depth"}
              title="Toggle right-hand Depth of Market (DOM)"
              onClick={() => selectDockTab("depth")}
              className={`rounded px-2 py-0.5 ${
                dockTab === "depth" ? "bg-ev-raised font-medium text-ev-strong" : "hover:bg-ev-raised hover:text-ev-strong"
              }`}
            >
              DOM
            </button>
            <Link
              to="/markets"
              title="Open Stock, Crypto & Forex Screener / Heatmaps"
              className="rounded px-2 py-0.5 hover:bg-ev-raised hover:text-ev-strong"
            >
              Screener & Heatmaps
            </Link>
            <Link
              to="/strategies"
              title="Open Pine Script Editor & Strategy Tester"
              className="rounded px-2 py-0.5 hover:bg-ev-raised hover:text-ev-strong"
            >
              Pine Editor
            </Link>
            <Link
              to="/journal"
              title="Open Trading Journal & AI Coach"
              className="rounded px-2 py-0.5 hover:bg-ev-raised hover:text-ev-strong"
            >
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
              className="rounded px-1.5 py-0.5 hover:bg-ev-raised hover:text-ev-strong"
            >
              Settings
              {mt5Badge && <span className={`ml-1 inline-block size-1.5 rounded-full ${mt5Badge}`} aria-hidden />}
            </Link>
            <span className="uppercase">{state.theme}</span>
          </span>
        </footer>
      </div>
      <NoticeHost />
      {hotkeysOpen && <HotkeySheet onClose={() => setHotkeysOpen(false)} />}
    </div>
  );
}

const SOURCE_LABEL: Record<ChartSource, string> = {
  ezyview: "EzyView feed",
  mt5: "Broker · MT5",
};

/** Real accounts the user already acknowledged this session, keyed `server|login`. */
const realSourceAcked = new Set<string>();

/**
 * Which account the MT5 source would drive: the app-logged session, or — when
 * the bridge merely attached to a running terminal — the terminal's own
 * account type. Returns the risk key only for a real account.
 */
async function realSourceKey(): Promise<string | null> {
  const session = useMt5Accounts.getState().session;
  if (session) return session.demo ? null : `${session.server}|${session.login}`;
  try {
    const raw = (await getMt5().transport.account()) as { trade_mode?: number; login?: number | string };
    return raw.trade_mode === 1 ? `attached|${String(raw.login ?? "")}` : null;
  } catch {
    return null;
  }
}

/** Segmented switch between the bundled feed and the connected broker. */
function SourceToggle() {
  const source = useMt5((s) => s.source);
  const setSource = useMt5((s) => s.setSource);
  const [busy, setBusy] = useState(false);
  const [risk, setRisk] = useState<string | null>(null);
  const [switchWarning, setSwitchWarning] = useState<string | null>(null);

  const executeSourceSwitch = (id: ChartSource) => {
    setBusy(true);
    void (async () => {
      await setSource(id);
      if (id !== "mt5" || useMt5.getState().source !== "mt5") return;
      const key = await realSourceKey();
      if (key && !realSourceAcked.has(key)) setRisk(key);
    })().finally(() => setBusy(false));
  };

  const pick = (id: ChartSource) => {
    if (busy || id === source) return;
    if (source === "mt5" && id === "ezyview") {
      const activeCount = useTrading.getState().positions.length;
      const isOnline = useMt5.getState().status === "online";
      if (isOnline && activeCount > 0) {
        setSwitchWarning(`${activeCount} active position${activeCount > 1 ? "s are" : " is"} currently open on MT5`);
        return;
      }
    }
    executeSourceSwitch(id);
  };

  const acceptRisk = () => {
    if (risk) realSourceAcked.add(risk);
    setRisk(null);
  };
  const refuseRisk = () => {
    setRisk(null);
    void setSource("ezyview");
  };

  return (
    <div
      role="group"
      aria-label="Chart price source"
      className="flex items-center rounded border border-ev-line p-px"
    >
      {(Object.keys(SOURCE_LABEL) as ChartSource[]).map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={source === id}
          disabled={busy}
          onClick={() => pick(id)}
          title={
            id === "mt5"
              ? "Candles, quotes, account and orders from the connected MT5 terminal"
              : "Bundled demo market feed"
          }
          className={
            source === id
              ? `rounded px-2 py-px font-medium ${id === "mt5" ? "bg-ev-accent text-white" : "bg-ev-raised text-ev-strong"}`
              : "rounded px-2 py-px text-ev-muted hover:text-ev-strong"
          }
        >
          {SOURCE_LABEL[id]}
        </button>
      ))}
      {switchWarning && (
        <Modal
          onClose={() => setSwitchWarning(null)}
          labelledBy="switch-warn-title"
          className="w-[26rem] rounded-md border border-ev-warn/40 bg-ev-panel text-base shadow-2xl"
        >
          <div className="space-y-3 p-4">
            <h2 id="switch-warn-title" className="text-body font-semibold text-ev-warn">
              Active MT5 Trading State
            </h2>
            <p className="text-ev-text leading-relaxed">
              {switchWarning}. Switching your chart to the Demo feed will detach live chart execution and hide active broker levels.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setSwitchWarning(null)}
                className="rounded border border-ev-line px-3 py-1 text-ev-muted hover:text-ev-strong"
              >
                Stay on MT5
              </button>
              <button
                type="button"
                onClick={() => {
                  setSwitchWarning(null);
                  executeSourceSwitch("ezyview");
                }}
                className="rounded bg-ev-warn px-3 py-1 font-semibold text-white hover:brightness-110"
              >
                Switch to Demo anyway
              </button>
            </div>
          </div>
        </Modal>
      )}
      {risk && (
        <Modal
          onClose={refuseRisk}
          labelledBy="real-source-title"
          className="w-[24rem] rounded-md border border-ev-warn/40 bg-ev-panel text-base shadow-2xl"
        >
          <div className="space-y-3 p-4">
            <h2 id="real-source-title" className="text-body font-semibold text-ev-warn">
              Real account detected — {maskLogin(risk.split("|")[1] ?? "")}
            </h2>
            <p className="text-ev-text">
              The broker feed is live on a real-money account. EzyView keeps asking to confirm every order, but
              a confirmation now trades real money.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" autoFocus onClick={refuseRisk} className="rounded border border-ev-line px-3 py-1 text-ev-muted hover:text-ev-strong">
                Switch back to demo data
              </button>
              <button type="button" onClick={acceptRisk} className="rounded bg-ev-warn px-3 py-1 font-semibold text-white">
                I understand — continue
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** One dot that says whether the broker or public live feed is answering. */
function FeedStatus({ symbol }: { symbol: string }) {
  const source = useMt5((s) => s.source);
  const status = useMt5((s) => s.status);
  const error = useMt5((s) => s.error);

  if (source !== "mt5") {
    const livePublic = isLivePublicSymbol(symbol);
    return (
      <span className="flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-ev-up" aria-hidden />
        {livePublic ? "live market feed" : "market feed"}
      </span>
    );
  }

  const dot =
    status === "online"
      ? "var(--ev-up)"
      : status === "connecting"
        ? "var(--ev-warn)"
        : status === "error"
          ? "var(--ev-down)"
          : "var(--ev-dim)";
  const label =
    status === "online" ? "MT5 live" : status === "connecting" ? "MT5 connecting…" : status === "error" ? "MT5 offline" : "MT5";

  return (
    <span role="status" className="flex items-center gap-1.5" title={error ?? undefined}>
      <span className="size-1.5 rounded-full" style={{ background: dot }} aria-hidden />
      {label}
    </span>
  );
}
