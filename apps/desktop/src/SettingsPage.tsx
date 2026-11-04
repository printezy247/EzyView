import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { activeChartOf } from "./layout";
import { useWorkspace } from "./store";
import { useMt5 } from "./mt5";
import { useApiKeys } from "./apiKeys";
import { EventsControls } from "./EventsControls";
import { DesktopTab } from "./DesktopTab";
import { DiagnosticsTab } from "./DiagnosticsTab";
import { AuditTab, BrokerTab, ConnectionTab, SafetyTab } from "./Mt5Setup";
import { downloadBlob } from "./exportUi";
import { Button, RadioGroup, Tabs } from "./ui";
import {
  applyWorkspaceBackup,
  dismissParkedCorrupt,
  downloadCorruptBackup,
  parkedCorruptKeys,
  parseWorkspaceBackup,
  readWorkspaceBackup,
  serializeWorkspaceBackup,
} from "./workspaceBackup";

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
 * Backup / restore card for the Data tab.
 *
 * One JSON file carries every persisted namespace (workspace, journal, MT5,
 * paper account, drawings, shell settings). Import is additive: namespaces the
 * file does not carry keep their current data. A park-place of corrupt
 * payloads (`.corrupt`) is surfaced here so a bad save can be recovered.
 */
export function BackupsSection() {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [corruptVersion, setCorruptVersion] = useState(0);
  const parked = useMemo(() => parkedCorruptKeys(), [corruptVersion]);
  const fileInput = useRef<HTMLInputElement>(null);

  const exportNow = (): void => {
    const backup = readWorkspaceBackup();
    const filename = `ezyview-backup-${new Date(backup.createdAt * 1000).toISOString().slice(0, 10)}.json`;
    downloadBlob(new Blob([serializeWorkspaceBackup(backup)], { type: "application/json" }), filename);
    setNotice("Backup downloaded.");
  };

  const importNow = async (file: File): Promise<void> => {
    setNotice(null);
    setError(null);
    let raw = "";
    try {
      raw = await file.text();
    } catch {
      setError("Could not read the file.");
      return;
    }
    const parsed = parseWorkspaceBackup(raw);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    const result = applyWorkspaceBackup(parsed.backup);
    setNotice(
      `Restored ${result.applied.length} namespace${result.absent.length === 1 ? "" : "s"}` +
        (result.absent.length > 0 ? ` (${result.absent.length} not present in this backup kept their data)` : "") +
        " — restart EzyView to see everything.",
    );
  };

  return (
    <div className="mt-6 border-t border-ev-raised pt-4">
      <h2 className="mb-1 text-dense font-medium uppercase tracking-wider text-ev-faint">Backups</h2>
      <p className="mb-3 text-dense text-ev-muted">
        Exports and restores workspace layouts, drawings, journal, MT5 settings, paper account and shell settings as a
        single JSON file. Secrets (API keys, bridge tokens) are never included.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="md" onClick={exportNow}>
          Export workspace backup
        </Button>
        <Button variant="outline" size="md" onClick={() => fileInput.current?.click()}>
          Import workspace backup
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importNow(file);
            e.target.value = "";
          }}
        />
      </div>
      {notice && (
        <p role="status" className="mt-2 rounded border border-ev-up/40 bg-ev-up/10 px-2 py-1.5 text-dense text-ev-up-text">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 rounded border border-ev-down/40 bg-ev-down/10 px-2 py-1.5 text-dense text-ev-down-text">
          {error}
        </p>
      )}

      {parked.length > 0 && (
        <>
          <h3 className="mb-1 mt-5 text-dense font-medium uppercase tracking-wider text-ev-faint">
            Parked corrupt data
          </h3>
          <p className="mb-2 text-dense text-ev-muted">
            These storage payloads could not be read and were parked instead of deleted. Download them if you want to
            try to recover anything by hand.
          </p>
          <ul className="space-y-1.5">
            {parked.map((key) => (
              <li key={key} className="flex items-center gap-2">
                <code className="flex-1 text-dense text-ev-text">{key}</code>
                {["export", "dismiss"].map((action) =>
                  action === "export" ? (
                    <Button key="export" variant="outline" size="sm" onClick={() => {
                        const raw = downloadCorruptBackup(key);
                        if (raw === null) return;
                        downloadBlob(new Blob([raw], { type: "application/json" }), `${key}.json`);
                      }}>
                      Download
                    </Button>
                  ) : (
                    <Button key="dismiss" variant="ghost" size="sm" onClick={() => {
                        dismissParkedCorrupt(key);
                        setCorruptVersion((v) => v + 1);
                      }}>
                      Discard
                    </Button>
                  ),
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

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

      <div className="border-b border-ev-raised px-4 py-2">
        <Tabs label="Settings sections" items={TABS} value={tab} onChange={(v) => setTab(v as Tab)} />
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
            <Button variant="outline" size="md" onClick={openDialog}>
              Manage API keys
            </Button>
            <BackupsSection />
          </>
        )}
        {tab === "desktop" && <DesktopTab />}
        {tab === "diagnostics" && <DiagnosticsTab />}
        {tab === "appearance" && (
          <>
            <p className="mb-3 text-dense text-ev-muted">Colour theme for the shell and the active chart.</p>
            <RadioGroup label="App theme" value={appTheme} onChange={(v) => setAppTheme(v as typeof appTheme)} options={["auto", "dark", "light", "tokyo"].map((v) => ({ value: v, label: v }))} inline />
            <p className="mb-3 mt-1.5 text-dense text-ev-faint">
              Auto follows the focused chart. Pin a theme to keep the chrome still across a mixed grid.
            </p>
            <h2 className="mb-1 text-dense font-medium uppercase tracking-wider text-ev-faint">Chart theme</h2>
            <p className="mb-3 text-dense text-ev-muted">Palette for this chart cell only.</p>
            <RadioGroup label="Theme" value={theme} onChange={(v) => updateActive({ theme: v as typeof theme })} options={["dark", "light", "tokyo"].map((v) => ({ value: v, label: v }))} inline />
            <h2 className="mb-1 mt-5 text-dense font-medium uppercase tracking-wider text-ev-faint">Density</h2>
            <p className="mb-3 text-dense text-ev-muted">Row height for tables, blotter and lists.</p>
            <RadioGroup label="Density" value={density} onChange={(v) => setDensity(v as typeof density)} options={["compact", "comfortable"].map((v) => ({ value: v, label: v }))} inline />
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
