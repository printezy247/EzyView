import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useMt5Accounts } from "./mt5Accounts";
import { useTrading } from "./trading";
import type { PendingAction } from "./trading";
import { maskLogin } from "./tradingSafety";
import { Modal } from "./Modal";

function price(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? "market" : String(value);
}

/** One-line human summary of the parked action, for the dialog body. */
function describe(action: PendingAction): { title: string; lines: string[] } {
  switch (action.kind) {
    case "place":
      return {
        title: `Send ${action.request.side} ${action.request.type} order`,
        lines: [
          `${action.request.qty} ${action.request.symbol} @ ${price(action.request.price ?? action.request.stopPrice)}`,
          ...(action.request.stopLoss !== undefined ? [`SL ${action.request.stopLoss}`] : []),
          ...(action.request.takeProfit !== undefined ? [`TP ${action.request.takeProfit}`] : []),
        ],
      };
    case "close":
      return { title: "Close position", lines: [`${action.qty ?? "full"} ${action.symbol}`] };
    case "cancel":
      return { title: "Delete pending order", lines: [`ticket ${action.id}`] };
    case "close-all":
      return {
        title: `Close all ${action.rows.length} positions`,
        lines: action.rows.map((row) => `${row.qty} ${row.symbol}`),
      };
  }
}

/**
 * The gate's dialog: shows what the rails found, then sends exactly once.
 * Real accounts get a second, explicit acknowledgment before Send unlocks.
 */
export function TradeConfirmDialog() {
  const pending = useTrading((s) => s.pending);
  const approve = useTrading((s) => s.approve);
  const decline = useTrading((s) => s.decline);
  const session = useMt5Accounts((s) => s.session);
  const [riskOk, setRiskOk] = useState(false);
  const [sending, setSending] = useState(false);

  if (!pending) return null;
  const { title, lines } = describe(pending);
  const real = pending.gate.secondConfirm;
  const canSend = !sending && (!real || riskOk);

  const send = () => {
    setSending(true);
    void approve().finally(() => setSending(false));
  };

  return (
    <Modal
      onClose={decline}
      labelledBy="trade-confirm-title"
      backdropClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      className="w-[26rem] rounded-md border border-ev-line bg-ev-panel text-[12px] shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-ev-raised px-4 py-2.5">
        <h2 id="trade-confirm-title" className="flex items-center gap-2 text-sm font-semibold text-ev-strong">
          <ShieldAlert size={14} aria-hidden />
          {title}
        </h2>
        <button type="button" onClick={decline} className="text-ev-muted hover:text-ev-strong">
          Cancel
        </button>
      </div>
      <div className="space-y-3 p-4">
        <p className="font-mono text-ev-strong">
          {session ? `${real ? "REAL" : "demo"} · ${maskLogin(session.login)} @ ${session.server}` : "attached terminal · account type not confirmed"}
        </p>
        <ul className="space-y-0.5 text-ev-muted">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {pending.gate.reasons.length > 0 && (
          <ul className="space-y-1 rounded border border-ev-warn/40 bg-ev-warn/10 p-2 text-ev-warn">
            {pending.gate.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        {real && (
          <label className="flex items-start gap-2 text-ev-strong">
            <input
              type="checkbox"
              checked={riskOk}
              onChange={(e) => setRiskOk(e.target.checked)}
              className="mt-0.5"
              data-testid="real-account-ack"
            />
            <span>I understand this order goes to a real account with real money.</span>
          </label>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={decline} className="rounded border border-ev-line px-3 py-1 text-ev-muted hover:text-ev-strong">
            Discard
          </button>
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            className="rounded bg-ev-accent px-3 py-1 font-semibold text-white disabled:opacity-50"
          >
            {sending ? "Sending…" : pending.gate.dryRun ? "Validate (dry-run)" : real ? "Send to real account" : "Send"}
          </button>
        </div>
        <p className="text-[11px] text-ev-faint">
          This confirmation can be used once. Anything changed since the ticket was filled must be re-confirmed.
        </p>
      </div>
    </Modal>
  );
}
