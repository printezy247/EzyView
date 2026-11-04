import { useState } from "react";
import type { KeyName } from "./apiKeys";
import { keyringAvailable, saveApiKey, useApiKeys } from "./apiKeys";
import { Button, Dialog, Input } from "./ui";

const PROVIDERS: { name: KeyName; label: string; signup: string; covers: string; limit: string }[] = [
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
  {
    name: "twelvedata",
    label: "Twelve Data",
    signup: "https://twelvedata.com/pricing",
    covers: "Live gold and forex prices for charts (pick it in the chart's Data source menu)",
    limit: "Free key from twelvedata.com; about 8 requests/minute",
  },
];

/** Enter or remove provider API keys. Keys go straight to the OS keyring. */
export function ApiKeysDialog() {
  const { keys, closeDialog: onClose, reload } = useApiKeys();
  const onChanged = () => void reload();
  const canStore = keyringAvailable();
  return (
    <Dialog
      onClose={onClose}
      title="Data provider API keys"
      description="All providers have free plans. Keys are stored in your system keyring (never in a file), and any panel without a key keeps showing demo data."
      size="md"
      actions={
        <Button variant="ghost" size="md" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-ev-muted">
          All providers have free plans. Keys are stored in your system keyring (never in a file), and
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
    </Dialog>
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
        <span className={saved ? "text-ev-up-text" : "text-ev-muted"}>{saved ? "Key saved · live" : "No key · demo data"}</span>
      </div>
      <p className="text-dense text-ev-muted">
        {provider.covers}. {provider.limit}. Get a free key at{" "}
        <a href={provider.signup} target="_blank" rel="noopener noreferrer" className="select-all text-ev-accent-text hover:underline">
          {provider.signup}
        </a>
      </p>
      <div className="flex gap-2">
        <Input
          id={id}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={saved ? "Paste a new key to replace the saved one" : "Paste your API key"}
          value={value}
          disabled={disabled || busy}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1"
        />
        <Button
          type="submit"
          disabled={disabled || busy || !value.trim()}
        >
          Save
        </Button>
        {saved && (
          <Button
            variant="outline"
            disabled={disabled || busy}
            onClick={() => void store("")}
          >
            Remove
          </Button>
        )}
      </div>
      {status && (
        <p role="status" className={status.ok ? "text-ev-up-text" : "text-ev-down-text"}>
          {status.text}
        </p>
      )}
    </form>
  );
}
