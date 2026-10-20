import { useState } from "react";
import { useMt5 } from "./mt5";
import { keyringAvailable } from "./apiKeys";
import type { Mt5Settings } from "./mt5";
import type { TransportKind } from "@ezyview/mt5-adapter";

/**
 * Connection settings for the broker feed.
 *
 * Two transports, one form: the local bridge (works wherever the terminal can
 * be attached, including Wine) and MT5's built-in MCP server (no sidecar, but
 * needs a key MT5 will actually accept).
 */
export function Mt5Setup() {
  const settings = useMt5((s) => s.settings);
  const save = useMt5((s) => s.save);
  const status = useMt5((s) => s.status);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Mt5Settings>(settings);
  const [busy, setBusy] = useState(false);

  const show = () => {
    setDraft(settings);
    setOpen(true);
  };

  const submit = async () => {
    setBusy(true);
    await save(draft);
    setBusy(false);
    setOpen(false);
  };

  const field =
    "w-full rounded border border-ev-line bg-ev-bg px-2 py-1 text-[11px] text-ev-text focus:border-ev-accent";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : show())}
        aria-expanded={open}
        title="MT5 connection settings"
        className={`rounded px-1.5 py-0.5 hover:bg-ev-raised ${open ? "text-ev-strong" : ""}`}
      >
        MT5 setup
        {status === "online" && <span className="ml-1 inline-block size-1.5 rounded-full bg-ev-up" aria-hidden />}
        {status === "error" && <span className="ml-1 inline-block size-1.5 rounded-full bg-ev-down" aria-hidden />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="MT5 connection settings"
          className="absolute bottom-6 right-0 z-50 w-72 rounded border border-ev-line bg-ev-panel p-3 shadow-2xl"
        >
          <p className="mb-2 text-[11px] text-ev-muted">
            Where MetaTrader 5 answers from. The app only connects to this computer (127.0.0.1 or localhost); reach a
            terminal on another machine through an SSH tunnel.
          </p>

          <div className="mb-2 flex gap-1">
            {(["bridge", "mcp"] as TransportKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={draft.kind === kind}
                onClick={() => setDraft({ ...draft, kind })}
                className={
                  draft.kind === kind
                    ? "flex-1 rounded bg-ev-raised px-2 py-1 text-[11px] font-medium text-ev-strong"
                    : "flex-1 rounded px-2 py-1 text-[11px] text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
                }
              >
                {kind === "bridge" ? "Local bridge" : "Built-in MCP"}
              </button>
            ))}
          </div>

          {draft.kind === "bridge" ? (
            <label className="mb-2 block text-[11px] text-ev-muted">
              Bridge URL
              <input
                className={field}
                value={draft.bridgeUrl}
                onChange={(e) => setDraft({ ...draft, bridgeUrl: e.target.value })}
                spellCheck={false}
              />
            </label>
          ) : (
            <>
              <label className="mb-2 block text-[11px] text-ev-muted">
                MCP endpoint
                <input
                  className={field}
                  value={draft.mcpUrl}
                  onChange={(e) => setDraft({ ...draft, mcpUrl: e.target.value })}
                  spellCheck={false}
                />
              </label>
              <label className="mb-2 block text-[11px] text-ev-muted">
                API key
                <input
                  className={field}
                  type="password"
                  value={draft.mcpKey}
                  onChange={(e) => setDraft({ ...draft, mcpKey: e.target.value })}
                  placeholder="Tools → Options → MCP"
                  spellCheck={false}
                />
                <span className="mt-0.5 block text-[11px] text-ev-muted">
                  {keyringAvailable() ? "Saved in your OS keyring." : "Kept for this session only (desktop app saves it to the keyring)."}
                </span>
              </label>
            </>
          )}

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded px-2 py-1 text-[11px] text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="rounded bg-ev-accent px-3 py-1 text-[11px] font-medium text-white hover:bg-ev-accent-hover disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
