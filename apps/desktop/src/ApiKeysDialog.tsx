import { useState } from "react";
import { KeyRound } from "lucide-react";
import type { ApiKeyName } from "@ezyview/fundamentals";
import { keyringAvailable, saveApiKey, useApiKeys } from "./apiKeys";
import { Modal } from "./Modal";

const PROVIDERS: { name: ApiKeyName; label: string; signup: string; covers: string; limit: string }[] = [
  {
    name: "finnhub",
    label: "Finnhub",
    signup: "https://finnhub.io/register",
    covers: "News, earnings, IPO calendar, dividends",
    limit: "Free plan: 60 requests / minute",
  },
  {
    name: "alphavantage",
    label: "Alpha Vantage",
    signup: "https://www.alphavantage.co/support/#api-key",
    covers: "Company profile, dividends (and earnings without Finnhub)",
    limit: "Free plan: 25 requests / day",
  },
];

/** Enter or remove provider API keys. Keys go straight to the OS keyring. */
export function ApiKeysDialog() {
  const { keys, closeDialog: onClose, reload } = useApiKeys();
  const onChanged = () => void reload();
  const canStore = keyringAvailable();
  return (
    <Modal
      onClose={onClose}
      labelledBy="api-keys-title"
      className="w-[30rem] rounded-md border border-ev-line bg-ev-panel text-[12px] shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-ev-raised px-4 py-2.5">
        <h2 id="api-keys-title" className="flex items-center gap-2 text-sm font-semibold text-ev-strong">
          <KeyRound size={14} aria-hidden />
          Data provider API keys
        </h2>
        <button type="button" onClick={onClose} className="text-ev-muted hover:text-ev-strong">
          Close
        </button>
      </div>
      <div className="space-y-4 p-4">
        <p className="text-ev-muted">
          Both providers have free plans. Keys are stored in your system keyring (never in a file), and
          any panel without a key keeps showing demo data.
        </p>
        {!canStore && (
          <p className="rounded border border-ev-warn/40 bg-ev-warn/10 p-2 text-ev-warn">
            Keys can only be saved in the EzyView desktop app. This browser preview uses demo data.
          </p>
        )}
        {PROVIDERS.map((p) => (
          <KeyRow key={p.name} provider={p} saved={Boolean(keys[p.name])} disabled={!canStore} onChanged={onChanged} />
        ))}
      </div>
    </Modal>
  );
}

function KeyRow({
  provider,
  saved,
  disabled,
  onChanged,
}: {
  provider: (typeof PROVIDERS)[number];
  saved: boolean;
  disabled: boolean;
  onChanged: () => void;
}) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const store = async (next: string) => {
    setBusy(true);
    setStatus(null);
    try {
      await saveApiKey(provider.name, next);
      setValue("");
      setStatus({ ok: true, text: next ? "Saved to keyring" : "Removed" });
      onChanged();
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const id = `key-${provider.name}`;
  return (
    <form
      className="space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) void store(value);
      }}
    >
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="font-medium text-ev-strong">
          {provider.label}
        </label>
        <span className={saved ? "text-ev-up" : "text-ev-muted"}>{saved ? "Key saved · live" : "No key · demo data"}</span>
      </div>
      <p className="text-[11px] text-ev-muted">
        {provider.covers}. {provider.limit}. Get a free key at{" "}
        <a href={provider.signup} target="_blank" rel="noopener noreferrer" className="select-all text-ev-accent-text hover:underline">
          {provider.signup}
        </a>
      </p>
      <div className="flex gap-2">
        <input
          id={id}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={saved ? "Paste a new key to replace the saved one" : "Paste your API key"}
          value={value}
          disabled={disabled || busy}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 rounded border border-ev-line bg-ev-bg px-2 py-1 text-ev-strong disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || busy || !value.trim()}
          className="rounded bg-ev-accent px-3 py-1 font-medium text-white disabled:opacity-40"
        >
          Save
        </button>
        {saved && (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => void store("")}
            className="rounded border border-ev-line px-3 py-1 text-ev-muted hover:text-ev-strong disabled:opacity-40"
          >
            Remove
          </button>
        )}
      </div>
      {status && (
        <p role="status" className={status.ok ? "text-ev-up" : "text-ev-down"}>
          {status.text}
        </p>
      )}
    </form>
  );
}
