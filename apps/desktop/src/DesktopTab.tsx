import { useEffect, useId, useState } from "react";
import {
  DEFAULT_SHELL_SETTINGS,
  factoryReset,
  loadShellSettings,
  nativeNotificationsEnabled,
  notifyNative,
  relaunchApp,
  saveShellSettings,
  setNativeNotifications,
} from "./shell";
import type { ShellSettings } from "./shell";
import { checkForUpdate, openReleasePage } from "./updateCheck";
import type { UpdateResult } from "./updateCheck";
import { notice } from "./notice";

const button =
  "rounded bg-ev-line px-3 py-1.5 text-[11px] text-ev-strong hover:bg-ev-line-strong disabled:opacity-40";
const heading = "mb-1 text-[11px] font-medium uppercase tracking-wider text-ev-faint";

/** Settings → Desktop: notifications, shortcut, rendering, proxy, reset. */
export function DesktopTab() {
  const [settings, setSettings] = useState<ShellSettings>(DEFAULT_SHELL_SETTINGS);
  const [notify, setNotify] = useState(nativeNotificationsEnabled);
  const [status, setStatus] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [update, setUpdate] = useState<UpdateResult | "checking" | null>(null);
  const proxyId = useId();

  useEffect(() => {
    void loadShellSettings().then(setSettings);
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
        <button
          type="button"
          className={button}
          disabled={update === "checking"}
          onClick={() => {
            setUpdate("checking");
            void checkForUpdate().then(setUpdate);
          }}
        >
          {update === "checking" ? "Checking…" : "Check for updates"}
        </button>
        {update && update !== "checking" && (
          <p role="status" className="mt-2 text-[12px] text-ev-text">
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
        <label className="flex items-center gap-2 text-[12px] text-ev-text">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => {
              setNotify(e.target.checked);
              setNativeNotifications(e.target.checked);
            }}
          />
          System notification when a price alert fires
        </label>
        <button type="button" className={`${button} mt-2`} onClick={() => void notifyNative("EzyView", "Notifications are working.")}>
          Send test notification
        </button>
      </section>

      <section aria-label="Shortcut">
        <h2 className={heading}>Global shortcut</h2>
        <p className="text-[12px] text-ev-text">
          <kbd className="rounded border border-ev-line px-1.5">Ctrl+Alt+E</kbd> brings EzyView to the front from any app.
          If another program already uses it, the shortcut is skipped.
        </p>
      </section>

      <section aria-label="Rendering and network">
        <h2 className={heading}>Rendering and network</h2>
        <label className="mb-2 flex items-center gap-2 text-[12px] text-ev-text">
          <input
            type="checkbox"
            checked={settings.hardwareAcceleration !== false}
            onChange={(e) => edit({ hardwareAcceleration: e.target.checked ? null : false })}
          />
          Hardware acceleration (turn off if the window is blank or flickers)
        </label>
        <label htmlFor={proxyId} className="mb-1 block text-[12px] text-ev-muted">
          Proxy (http://, https:// or socks5://host:port; empty = none)
        </label>
        <input
          id={proxyId}
          value={settings.proxy}
          onChange={(e) => edit({ proxy: e.target.value.trim() })}
          placeholder="http://127.0.0.1:8080"
          spellCheck={false}
          className="w-full max-w-sm rounded border border-ev-line bg-ev-panel px-2 py-1 text-[12px] text-ev-text placeholder:text-ev-faint"
        />
        <div className="mt-2 flex gap-2">
          <button type="button" className={button} disabled={!dirty} onClick={() => void save()}>
            Save
          </button>
          <button type="button" className={button} onClick={() => void relaunchApp()}>
            Restart now
          </button>
        </div>
        {status && (
          <p role="status" className="mt-2 text-[11px] text-ev-muted">
            {status}
          </p>
        )}
      </section>

      <section aria-label="Factory reset">
        <h2 className={heading}>Factory reset</h2>
        <p className="mb-2 text-[11px] text-ev-muted">Wipes local app data and restarts. API keys in the OS keyring are kept.</p>
        <button type="button" className={`${button} text-ev-down`} onClick={() => void reset()}>
          Factory reset…
        </button>
      </section>
    </div>
  );
}
