import { useState } from "react";
import { activeChartOf } from "./layout";
import { useWorkspace } from "./store";
import { useMt5 } from "./mt5";
import { useApiKeys } from "./apiKeys";
import { AuditTab, BrokerTab, ConnectionTab, SafetyTab } from "./Mt5Setup";

type Tab = "connection" | "broker" | "safety" | "audit" | "data" | "appearance";

const TABS: { id: Tab; label: string }[] = [
  { id: "connection", label: "Connection" },
  { id: "broker", label: "Broker" },
  { id: "safety", label: "Safety" },
  { id: "audit", label: "Audit" },
  { id: "data", label: "Data" },
  { id: "appearance", label: "Appearance" },
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
  const openDialog = useApiKeys((s) => s.openDialog);
  const [tab, setTab] = useState<Tab>("connection");
  const [busy, setBusy] = useState(false);

  return (
    <section aria-label="Settings" className="flex min-h-0 flex-1 flex-col overflow-y-auto text-[12px]">
      <div className="flex items-center gap-2 border-b border-ev-raised px-4 py-3">
        <h1 className="text-sm font-semibold text-ev-strong">Settings</h1>
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
                ? "rounded bg-ev-raised px-2.5 py-1.5 text-[11px] font-medium text-ev-strong"
                : "rounded px-2.5 py-1.5 text-[11px] text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
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
            <p className="mb-3 text-[11px] text-ev-muted">
              Provider API keys (Finnhub, Alpha Vantage) for fundamentals data. Keys live in the OS keyring only —
              never in a file or localStorage.
            </p>
            <button
              type="button"
              onClick={openDialog}
              className="rounded bg-ev-line px-3 py-1.5 text-[11px] text-ev-strong hover:bg-ev-line-strong"
            >
              Manage API keys
            </button>
          </>
        )}
        {tab === "appearance" && (
          <>
            <p className="mb-3 text-[11px] text-ev-muted">Colour theme for the shell and the active chart.</p>
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
                      ? "rounded bg-ev-raised px-3 py-1.5 text-[11px] font-medium capitalize text-ev-strong"
                      : "rounded border border-ev-line px-3 py-1.5 text-[11px] capitalize text-ev-muted hover:text-ev-strong"
                  }
                >
                  {t}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
