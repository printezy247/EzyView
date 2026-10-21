import { useState } from "react";
import { useSearchParams } from "react-router";
import { activeChartOf } from "./layout";
import { useWorkspace } from "./store";
import { useMt5 } from "./mt5";
import { useApiKeys } from "./apiKeys";
import { EventsControls } from "./EventsControls";
import { DesktopTab } from "./DesktopTab";
import { DiagnosticsTab } from "./DiagnosticsTab";
import { AuditTab, BrokerTab, ConnectionTab, SafetyTab } from "./Mt5Setup";

type Tab = "connection" | "broker" | "safety" | "audit" | "data" | "appearance" | "desktop" | "diagnostics";

const TABS: { id: Tab; label: string }[] = [
  { id: "connection", label: "Connection" },
  { id: "broker", label: "Broker" },
  { id: "safety", label: "Safety" },
  { id: "audit", label: "Audit" },
  { id: "data", label: "Data" },
  { id: "appearance", label: "Appearance" },
  { id: "desktop", label: "Desktop" },
  { id: "diagnostics", label: "Diagnostics" },
];

/**
 * Settings destination. The four MT5 setup tabs moved here from the footer
 * popover (Phase 2: every destination is a route), plus Data (provider API
 * keys) and Appearance (theme) for the same reason — nothing hides behind a
 * popover once navigation is a first-class concept.
 */
export function SettingsPage() {
  const settings = useMt5((s) => s.settings);
  const save = useMt5((s) => s.save);
  const layout = useWorkspace((s) => s.activeLayout());
  const updateActive = useWorkspace((s) => s.updateActive);
  const theme = activeChartOf(layout).theme;
  const appTheme = useWorkspace((s) => s.appTheme);
  const setAppTheme = useWorkspace((s) => s.setAppTheme);
  const density = useWorkspace((s) => s.density);
  const setDensity = useWorkspace((s) => s.setDensity);
  const openDialog = useApiKeys((s) => s.openDialog);
  // `?tab=appearance` deep-links a section (the chart's right-click "Settings…").
  const [params] = useSearchParams();
  const requested = TABS.find((t) => t.id === params.get("tab"))?.id;
  const [tab, setTab] = useState<Tab>(requested ?? "connection");
  const [busy, setBusy] = useState(false);

  return (
    <section aria-label="Settings" className="flex min-h-0 flex-1 flex-col overflow-y-auto text-base">
      <div className="flex items-center gap-2 border-b border-ev-raised px-4 py-3">
        <h1 className="text-body font-semibold text-ev-strong">Settings</h1>
      </div>

      <div role="tablist" aria-label="Settings sections" className="flex gap-1 border-b border-ev-raised px-4 py-2">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            className={
              tab === id
                ? "rounded bg-ev-raised px-2.5 py-1.5 text-dense font-medium text-ev-strong"
                : "rounded px-2.5 py-1.5 text-dense text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="max-w-2xl p-4">
        {tab === "connection" && <ConnectionTab settings={settings} save={save} busy={busy} setBusy={setBusy} />}
        {tab === "broker" && <BrokerTab />}
        {tab === "safety" && <SafetyTab />}
        {tab === "audit" && <AuditTab />}
        {tab === "data" && (
          <>
            <p className="mb-3 text-dense text-ev-muted">
              Provider API keys (Finnhub, Alpha Vantage) for fundamentals data. Keys live in the OS keyring only —
              never in a file or localStorage.
            </p>
            <button
              type="button"
              onClick={openDialog}
              className="rounded bg-ev-line px-3 py-1.5 text-dense text-ev-strong hover:bg-ev-line-strong"
            >
              Manage API keys
            </button>
          </>
        )}
        {tab === "desktop" && <DesktopTab />}
        {tab === "diagnostics" && <DiagnosticsTab />}
        {tab === "appearance" && (
          <>
            <p className="mb-3 text-dense text-ev-muted">Colour theme for the shell and the active chart.</p>
            <div className="flex gap-2" role="radiogroup" aria-label="App theme">
              {(["auto", "dark", "light", "tokyo"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={appTheme === t}
                  onClick={() => setAppTheme(t)}
                  className={
                    appTheme === t
                      ? "rounded bg-ev-raised px-3 py-1.5 text-dense font-medium capitalize text-ev-strong"
                      : "rounded border border-ev-line px-3 py-1.5 text-dense capitalize text-ev-muted hover:text-ev-strong"
                  }
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="mb-3 mt-1.5 text-dense text-ev-faint">
              Auto follows the focused chart. Pin a theme to keep the chrome still across a mixed grid.
            </p>
            <h2 className="mb-1 text-dense font-medium uppercase tracking-wider text-ev-faint">Chart theme</h2>
            <p className="mb-3 text-dense text-ev-muted">Palette for this chart cell only.</p>
            <div className="flex gap-2" role="radiogroup" aria-label="Theme">
              {(["dark", "light", "tokyo"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={theme === t}
                  onClick={() => updateActive({ theme: t })}
                  className={
                    theme === t
                      ? "rounded bg-ev-raised px-3 py-1.5 text-dense font-medium capitalize text-ev-strong"
                      : "rounded border border-ev-line px-3 py-1.5 text-dense capitalize text-ev-muted hover:text-ev-strong"
                  }
                >
                  {t}
                </button>
              ))}
            </div>
            <h2 className="mb-1 mt-5 text-dense font-medium uppercase tracking-wider text-ev-faint">Density</h2>
            <p className="mb-3 text-dense text-ev-muted">Row height for tables, blotter and lists.</p>
            <div className="flex gap-2" role="radiogroup" aria-label="Density">
              {(["compact", "comfortable"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={density === d}
                  onClick={() => setDensity(d)}
                  className={
                    density === d
                      ? "rounded bg-ev-raised px-3 py-1.5 text-dense font-medium capitalize text-ev-strong"
                      : "rounded border border-ev-line px-3 py-1.5 text-dense capitalize text-ev-muted hover:text-ev-strong"
                  }
                >
                  {d}
                </button>
              ))}
            </div>
            <p className="mb-3 mt-1.5 text-dense text-ev-faint">
              Comfortable gives each row a full line of breathing room for long table reading.
            </p>
            <h2 className="mb-1 mt-5 text-dense font-medium uppercase tracking-wider text-ev-faint">Chart events</h2>
            <p className="mb-2 text-dense text-ev-muted">
              What to draw on the chart. The same switches sit in the bar under the chart.
            </p>
            <EventsControls layout="panel" />
          </>
        )}
      </div>
    </section>
  );
}
