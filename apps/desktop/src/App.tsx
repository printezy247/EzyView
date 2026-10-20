import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { ChartPage } from "./ChartPage";
import { IndicatorDialog } from "./IndicatorDialog";
import { TabBar } from "./TabBar";
import { Toolbar } from "./Toolbar";
import type { PanelId } from "./Toolbar";
import { AlertDialog } from "./AlertDialog";
import { ApiKeysDialog } from "./ApiKeysDialog";
import { useApiKeys } from "./apiKeys";
import { openChartWindow } from "./windows";
import { Mt5Setup } from "./Mt5Setup";
import { NavRail } from "./NavRail";
import { TradeConfirmDialog } from "./TradeConfirmDialog";
import { JournalPage } from "./JournalPage";
import { FundamentalsPage } from "./FundamentalsPage";
import { OptionsPage } from "./OptionsPage";
import { PinePage } from "./PinePage";
import { SettingsPage } from "./SettingsPage";
import { useWorkspace } from "./store";
import { activeChartOf } from "./layout";
import { normalizePath, rememberRoute } from "./nav";
import { bootstrapMt5, getMt5, useMt5 } from "./mt5";
import type { ChartSource } from "./mt5";
import { useMt5Accounts } from "./mt5Accounts";
import { maskLogin } from "./tradingSafety";
import { Modal } from "./Modal";

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
  const alerts = useWorkspace((s) => s.alerts);
  const addAlert = useWorkspace((s) => s.addAlert);
  const removeAlert = useWorkspace((s) => s.removeAlert);
  const replayBar = useWorkspace((s) => s.replayBar);
  const setReplay = useWorkspace((s) => s.setReplay);

  const [dialogOpen, setDialogOpen] = useState(false);
  const apiKeysOpen = useApiKeys((s) => s.dialogOpen);
  const openApiKeys = useApiKeys((s) => s.openDialog);
  useEffect(() => {
    void useApiKeys.getState().reload();
  }, []);
  const [tradingOpen, setTradingOpen] = useState(true);
  const [watchlistOpen, setWatchlistOpen] = useState(true);
  const [domOpen, setDomOpen] = useState(true);
  const [objectsOpen, setObjectsOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);

  // Remember the last visited route so reloads land where the user left off.
  const location = useLocation();
  useEffect(() => {
    rememberRoute(location.pathname);
  }, [location.pathname]);

  // The shell's colour tokens follow the active chart's theme.
  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", state.theme === "light" ? "#ffffff" : "#0e1117");
  }, [state.theme]);

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
        if (!cancelled && first) updateActive({ symbol: first.symbol });
      });
    return () => {
      cancelled = true;
    };
  }, [source, state.symbol, updateActive]);

  // Two independent side rails plus one shared bottom slot (trading only —
  // journal, fundamentals, options and pine are routes now).
  const togglePanel = (id: PanelId) => {
    if (id === "watchlist") setWatchlistOpen((v) => !v);
    else if (id === "depth") setDomOpen((v) => !v);
    else if (id === "objects") setObjectsOpen((v) => !v);
    else setTradingOpen((v) => !v);
  };

  const panels: Record<PanelId, boolean> = {
    watchlist: watchlistOpen,
    depth: domOpen,
    objects: objectsOpen,
    trading: tradingOpen,
  };

  return (
    <div className="flex h-full">
      <h1 className="sr-only">EzyView</h1>
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col bg-ev-bg text-ev-text">
        <header className="contents">
          <TabBar />

          <Toolbar
            symbol={state.symbol}
            resolution={state.resolution}
            chartType={state.chartType}
            showVolume={state.showVolume}
            showVolumeProfile={state.showVolumeProfile ?? false}
            showGrid={state.showGrid}
            indicatorCount={state.indicators.length}
            onSymbol={(symbol) => updateActive({ symbol })}
            onResolution={(resolution) => updateActive({ resolution })}
            onChartType={(chartType) => updateActive({ chartType })}
            onToggleVolume={() => updateActive({ showVolume: !state.showVolume })}
            onToggleVolumeProfile={() => updateActive({ showVolumeProfile: !state.showVolumeProfile })}
            boxSize={state.boxSize ?? null}
            onBoxSize={(boxSize) => updateActive({ boxSize })}
            onToggleGrid={() => updateActive({ showGrid: !state.showGrid })}
            onToggleTheme={() => updateActive({ theme: state.theme === "dark" ? "light" : "dark" })}
            theme={state.theme}
            onOpenIndicators={() => setDialogOpen(true)}
            onToggleReplay={() => setReplay(replayBar === null ? 0 : null)}
            replayActive={replayBar !== null}
            panels={panels}
            onOpenWindow={() => void openChartWindow(state.symbol, state.resolution)}
            onOpenAlerts={() => setAlertOpen(true)}
            onOpenApiKeys={openApiKeys}
            onTogglePanel={togglePanel}
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
                  watchlistOpen={watchlistOpen}
                  domOpen={domOpen}
                  objectsOpen={objectsOpen}
                  tradingOpen={tradingOpen}
                  onToggle={togglePanel}
                  onOpenAlerts={() => setAlertOpen(true)}
                />
              }
            />
            <Route path="/journal" element={<JournalPage />} />
            <Route path="/fundamentals" element={<FundamentalsPage />} />
            <Route path="/options" element={<OptionsPage />} />
            <Route path="/pine" element={<PinePage />} />
            <Route path="/settings" element={<SettingsPage />} />
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

        <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-ev-raised px-3 text-[11px] text-ev-muted">
          <SourceToggle />
          <FeedStatus />
          <span>
            {state.drawings.length} drawing{state.drawings.length === 1 ? "" : "s"}
          </span>
          <span className="ml-auto flex items-center gap-3">
            <Mt5Setup />
            <span className="uppercase">{state.theme}</span>
          </span>
        </footer>
      </div>
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
          backdropClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          className="w-[24rem] rounded-md border border-ev-warn/40 bg-ev-panel text-[12px] shadow-2xl"
        >
          <div className="space-y-3 p-4">
            <h2 id="real-source-title" className="text-sm font-semibold text-ev-warn">
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
