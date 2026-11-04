import { useState } from "react";
import { Modal } from "./Modal";
import { getMt5, useMt5 } from "./mt5";
import type { ChartSource } from "./mt5";
import { useMt5Accounts } from "./mt5Accounts";
import { maskLogin } from "./tradingSafety";
import { describeRealSource } from "./realSource";
import type { RealSource } from "./realSource";
import { useTrading } from "./trading";

const SOURCE_LABEL: Record<ChartSource, string> = {
  ezyview: "EzyView feed",
  mt5: "Broker · MT5",
};

/** Real accounts the user already acknowledged this session, keyed `server|login`. */
const realSourceAcked = new Set<string>();

/**
 * Which account the MT5 source would drive: the app-logged session, or — when
 * the bridge merely attached to a running terminal — the terminal's own
 * account type. Fails closed: an unreadable terminal is "unknown" and still
 * needs the user's acknowledgement.
 */
async function realSourceKey(): Promise<string | null> {
  const session = useMt5Accounts.getState().session;
  const source: RealSource = session
    ? { kind: "session", demo: session.demo, server: session.server, login: session.login }
    : await getMt5()
        .transport.account()
        .then((raw) => ({
          kind: "attached" as const,
          tradeMode: (raw as { trade_mode?: number }).trade_mode,
          login: (raw as { login?: number | string }).login,
        }))
        .catch((err: unknown) => ({ kind: "error" as const, message: err instanceof Error ? err.message : String(err) }));
  return describeRealSource(source).key;
}

/** Segmented switch between the bundled feed and the connected broker. */
export function SourceToggle() {
  const source = useMt5((s) => s.source);
  const setSource = useMt5((s) => s.setSource);
  const [busy, setBusy] = useState(false);
  const [risk, setRisk] = useState<string | null>(null);
  const [switchWarning, setSwitchWarning] = useState<string | null>(null);

  const executeSourceSwitch = (id: ChartSource) => {
    setBusy(true);
    void (async () => {
      await setSource(id);
      if (id !== "mt5" || useMt5.getState().source !== "mt5") return;
      const key = await realSourceKey();
      if (key && !realSourceAcked.has(key)) setRisk(key);
    })().finally(() => setBusy(false));
  };

  const pick = (id: ChartSource) => {
    if (busy || id === source) return;
    if (source === "mt5" && id === "ezyview") {
      const activeCount = useTrading.getState().positions.length;
      const isOnline = useMt5.getState().status === "online";
      if (isOnline && activeCount > 0) {
        setSwitchWarning(`${activeCount} active position${activeCount > 1 ? "s are" : " is"} currently open on MT5`);
        return;
      }
    }
    executeSourceSwitch(id);
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
      {switchWarning && (
        <SwitchWarningDialog
          warning={switchWarning}
          onStay={() => setSwitchWarning(null)}
          onSwitch={() => {
            setSwitchWarning(null);
            executeSourceSwitch("ezyview");
          }}
        />
      )}
      {risk && (
        <RealSourceRiskDialog
          maskedLogin={maskLogin(risk.split("|")[1] ?? "")}
          onRefuse={refuseRisk}
          onAccept={acceptRisk}
        />
      )}
    </div>
  );
}

/** Confirmation when leaving a live MT5 session with positions open. */
function SwitchWarningDialog({ warning, onStay, onSwitch }: { warning: string; onStay: () => void; onSwitch: () => void }) {
  return (
    <Modal
      onClose={onStay}
      labelledBy="switch-warn-title"
      className="w-[min(26rem,92vw)] rounded-md border border-ev-warn/40 bg-ev-panel text-base shadow-2xl"
    >
      <div className="space-y-3 p-4">
        <h2 id="switch-warn-title" className="text-body font-semibold text-ev-warn">
          Active MT5 Trading State
        </h2>
        <p className="text-ev-text leading-relaxed">
          {warning}. Switching your chart to the Demo feed will detach live chart execution and hide active broker levels.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={onStay}
            className="rounded border border-ev-line px-3 py-1 text-ev-muted hover:text-ev-strong"
          >
            Stay on MT5
          </button>
          <button
            type="button"
            onClick={onSwitch}
            className="rounded bg-ev-warn px-3 py-1 font-semibold text-white hover:brightness-110"
          >
            Switch to Demo anyway
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Confirmation before letting a real-money account drive the chart feed. */
function RealSourceRiskDialog({ maskedLogin, onRefuse, onAccept }: { maskedLogin: string; onRefuse: () => void; onAccept: () => void }) {
  return (
    <Modal
      onClose={onRefuse}
      labelledBy="real-source-title"
      className="w-[min(24rem,92vw)] rounded-md border border-ev-warn/40 bg-ev-panel text-base shadow-2xl"
    >
      <div className="space-y-3 p-4">
        <h2 id="real-source-title" className="text-body font-semibold text-ev-warn">
          Real account detected — {maskedLogin}
        </h2>
        <p className="text-ev-text">
          The broker feed is live on a real-money account. EzyView keeps asking to confirm every order, but
          a confirmation now trades real money.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" autoFocus onClick={onRefuse} className="rounded border border-ev-line px-3 py-1 text-ev-muted hover:text-ev-strong">
            Switch back to demo data
          </button>
          <button type="button" onClick={onAccept} className="rounded bg-ev-warn px-3 py-1 font-semibold text-white">
            I understand — continue
          </button>
        </div>
      </div>
    </Modal>
  );
}
