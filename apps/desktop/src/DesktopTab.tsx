import { useEffect, useId, useState } from "react";
import {
  DEFAULT_SHELL_SETTINGS,
  alertSoundEnabled,
  alertSoundVolume,
  clearKeyringSecrets,
  factoryReset,
  loadShellSettings,
  nativeNotificationsEnabled,
  notifyNative,
  playAlertChime,
  relaunchApp,
  saveShellSettings,
  setAlertSoundEnabled,
  setAlertSoundVolume,
  setNativeNotifications,
} from "./shell";
import type { ShellSettings } from "./shell";
import { checkForUpdate, openReleasePage } from "./updateCheck";
import type { UpdateResult } from "./updateCheck";
import { fetchMcpRuntimeStatus, mcpStatusLine } from "./mcpRuntime";
import type { McpRuntimeStatus } from "./mcpRuntime";
import { notice } from "./notice";
import { Button, Checkbox, Input, Slider } from "./ui";

const heading = "mb-1 text-dense font-medium uppercase tracking-wider text-ev-faint";

/** Settings → Desktop: notifications, shortcut, rendering, proxy, reset. */
export function DesktopTab() {
  const [settings, setSettings] = useState<ShellSettings>(DEFAULT_SHELL_SETTINGS);
  const [notify, setNotify] = useState(nativeNotificationsEnabled);
  const [sound, setSound] = useState(alertSoundEnabled);
  const [volume, setVolume] = useState(alertSoundVolume);
  const [status, setStatus] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [update, setUpdate] = useState<UpdateResult | "checking" | null>(null);
  const [mcp, setMcp] = useState<McpRuntimeStatus | null>(null);
  const proxyId = useId();

  useEffect(() => {
    void loadShellSettings().then(setSettings);
    void fetchMcpRuntimeStatus().then(setMcp);
  }, []);

  const edit = (patch: Partial<ShellSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    setDirty(true);
    setStatus(null);
  };

  const save = async () => {
    const error = await saveShellSettings(settings);
    setStatus(error ?? "Saved. Restart EzyView for rendering and proxy changes to take effect.");
    if (error === null) setDirty(false);
  };

  const reset = async () => {
    const ok = await notice.confirm("Factory reset EzyView?", {
      body: "This deletes all layouts, drawings, alerts, the journal and settings stored by EzyView, then restarts. API keys in your OS keyring are kept.",
      confirmLabel: "Reset and restart",
    });
    if (!ok) return;
    try {
      await factoryReset();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-5">
      <section aria-label="Updates">
        <h2 className={heading}>Updates</h2>
        <Button
          size="sm"
          variant="outline"
          disabled={update === "checking"}
          onClick={() => {
            setUpdate("checking");
            void checkForUpdate().then(setUpdate);
          }}
        >
          {update === "checking" ? "Checking…" : "Check for updates"}
        </Button>
        {update && update !== "checking" && (
          <p role="status" className="mt-2 text-base text-ev-text">
            {update.kind === "current" && `You are on the latest version (${update.version}).`}
            {update.kind === "none" && "No published releases yet."}
            {update.kind === "error" && `Could not check: ${update.message}`}
            {update.kind === "available" && (
              <>
                Version {update.version} is available.{" "}
                <button type="button" className="text-ev-accent-text underline" onClick={() => void openReleasePage(update.url)}>
                  Open release page
                </button>
              </>
            )}
          </p>
        )}
      </section>

      <section aria-label="Notifications">
        <h2 className={heading}>Notifications</h2>
        <Checkbox
          label="System notification when a price alert fires"
          checked={notify}
          onChange={(checked) => {
            setNotify(checked);
            setNativeNotifications(checked);
          }}
        />
        <div className="mt-2">
          <Checkbox
            label="Play audio chime when an alert fires"
            checked={sound}
            onChange={(checked) => {
              setSound(checked);
              setAlertSoundEnabled(checked);
            }}
          />
        </div>
        <div className="mt-2 flex items-end gap-3">
          <div className="w-32">
            <Slider
              label="Chime volume"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              disabled={!sound}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => {
                setVolume(v);
                setAlertSoundVolume(v);
              }}
            />
          </div>
          <Button size="sm" variant="outline" disabled={!sound} onClick={() => playAlertChime()}>
            Test chime
          </Button>
        </div>
        <Button size="sm" variant="outline" onClick={() => void notifyNative("EzyView", "Notifications are working.")} className="mt-2">
          Send test notification
        </Button>
      </section>

      <section aria-label="Shortcut">
        <h2 className={heading}>Global shortcut</h2>
        <p className="text-base text-ev-text">
          <kbd className="rounded border border-ev-line px-1.5">Ctrl+Alt+E</kbd> brings EzyView to the front from any app.
          If another program already uses it, the shortcut is skipped.
        </p>
      </section>

      <section aria-label="MCP server">
        <h2 className={heading}>MCP server (AI assistants)</h2>
        <p role="status" className="text-base text-ev-text">
          {mcpStatusLine(mcp)}
        </p>
        <Button size="sm" variant="outline" onClick={() => void fetchMcpRuntimeStatus().then(setMcp)} className="mt-2">
          Recheck
        </Button>
      </section>

      <section aria-label="Rendering and network">
        <h2 className={heading}>Rendering and network</h2>
        <div className="mb-2">
          <Checkbox
            label="Hardware acceleration (turn off if the window is blank or flickers)"
            checked={settings.hardwareAcceleration !== false}
            onChange={(checked) => edit({ hardwareAcceleration: checked ? null : false })}
          />
        </div>
        <label htmlFor={proxyId} className="mb-1 block text-base text-ev-muted">
          Proxy (http://, https:// or socks5://host:port; empty = none)
        </label>
        <Input
          id={proxyId}
          aria-label="Proxy"
          value={settings.proxy}
          onChange={(e) => edit({ proxy: e.target.value.trim() })}
          placeholder="http://127.0.0.1:8080"
          spellCheck={false}
          className="max-w-sm"
        />
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="solid" disabled={!dirty} onClick={() => void save()}>
            Save
          </Button>
          <Button size="sm" variant="outline" onClick={() => void relaunchApp()}>
            Restart now
          </Button>
        </div>
        {status && (
          <p role="status" className="mt-2 text-dense text-ev-muted">
            {status}
          </p>
        )}
      </section>

      <section aria-label="Factory reset">
        <h2 className={heading}>Factory reset</h2>
        <p className="mb-2 text-dense text-ev-muted">Wipes local app data and restarts. API keys in the OS keyring are kept unless cleared separately.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="danger" onClick={() => void reset()}>
            Factory reset…
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void clearKeyringSecrets()
                .then(() => setStatus("Cleared provider API keys from OS keyring."))
                .catch((e) => setStatus(e instanceof Error ? e.message : String(e)));
            }}
          >
            Clear keyring API keys
          </Button>
        </div>
      </section>
    </div>
  );
}
