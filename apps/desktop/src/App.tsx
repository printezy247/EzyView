import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router";
import { ChartPage } from "./ChartPage";
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
import { JournalPage } from "./JournalPage";
import { ResearchPage } from "./ResearchPage";
import { StrategiesPage } from "./StrategiesPage";
import { MarketsPage } from "./MarketsPage";
import { TradePage } from "./TradePage";
import { AlertsPage } from "./AlertsPage";
import { SettingsPage } from "./SettingsPage";
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

/**
 * The persistent shell: left section rail, tab strip, toolbar, routed page
 * area, dialogs and the status footer. Navigation destinations are routes;
 * only the chart's side panels (watchlist/depth/objects/trading) are
 * page-local booleans, handed down to the chart page.
 */
export default function App() {
  const layout = useWorkspace((s) => s.activeLayout());
  const state = activeChartOf(layout);
  const setGrid = useWorkspace((s) => s.setGrid);
  const updateActive = useWorkspace((s) => s.updateActive);
  const setSymbol = useWorkspace((s) => s.setSymbol);
  const setResolution = useWorkspace((s) => s.setResolution);
  const alerts = useWorkspace((s) => s.alerts);
  const addAlert = useWorkspace((s) => s.addAlert);
  const removeAlert = useWorkspace((s) => s.removeAlert);
  const replayBar = useWorkspace((s) => s.replayBar);
  const setReplay = useWorkspace((s) => s.setReplay);

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
  const [hotkeysOpen, setHotkeysOpen] = useState(false);

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
            onToggleReplay={() => setReplay(replayBar === null ? 0 : null)}
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
          <Routes>
            <Route index element={<Navigate to={normalizePath("/")} replace />} />
            <Route
              path="/chart"
              element={
                <ChartPage
                  dockTab={dockTab}
                  onSelectDockTab={selectDockTab}
                  onSetDockTab={setDockTabDirect}
                  tradingOpen={tradingOpen}
                  onToggleTrading={toggleTrading}
                  onOpenAlerts={() => setAlertOpen(true)}
                  onOpenHotkeys={() => setHotkeysOpen(true)}
                />
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
          lastPrice={null}
        />

        <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-ev-raised bg-ev-chrome px-3 text-dense text-ev-muted">
          <SourceToggle />
          <FeedStatus />
          <span>
            {state.drawings.length} drawing{state.drawings.length === 1 ? "" : "s"}
          </span>
          <span className="ml-auto flex items-center gap-3">
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

  const pick = (id: ChartSource) => {
    if (busy || id === source) return;
    setBusy(true);
    void (async () => {
      await setSource(id);
      if (id !== "mt5" || useMt5.getState().source !== "mt5") return;
      const key = await realSourceKey();
      if (key && !realSourceAcked.has(key)) setRisk(key);
    })().finally(() => setBusy(false));
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

/** One dot that says whether the broker feed is answering. */
function FeedStatus() {
  const source = useMt5((s) => s.source);
  const status = useMt5((s) => s.status);
  const error = useMt5((s) => s.error);

  if (source !== "mt5") {
    return (
      <span className="flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-ev-up" aria-hidden />
        demo feed
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
