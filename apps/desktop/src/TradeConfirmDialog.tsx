import { useEffect, useState } from "react";
import { useMt5Accounts } from "./mt5Accounts";
import { useTrading } from "./trading";
import type { PendingAction } from "./trading";
import { maskLogin } from "./tradingSafety";
import { Button, Checkbox, Dialog } from "./ui";

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
    case "amend": {
      const changes = [
        action.stopLoss !== undefined ? `SL ${action.stopLoss ?? "none"}` : null,
        action.takeProfit !== undefined ? `TP ${action.takeProfit ?? "none"}` : null,
      ].filter((v): v is string => v !== null);
      return { title: `Amend ${action.symbol} levels`, lines: changes.length > 0 ? changes : ["no change"] };
    }
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

  // The dialog stays mounted between actions, so the real-money
  // acknowledgement has to be re-earned for every new order.
  const token = pending?.token ?? null;
  useEffect(() => {
    setRiskOk(false);
    setSending(false);
  }, [token]);

  if (!pending) return null;
  const { title, lines } = describe(pending);
  const real = pending.gate.secondConfirm;
  const canSend = !sending && (!real || riskOk);

  const send = () => {
    setSending(true);
    void approve().finally(() => setSending(false));
  };

  return (
    <Dialog
      onClose={decline}
      title={title}
      description={
        session
          ? `${real ? "REAL" : "demo"} · ${maskLogin(session.login)} @ ${session.server}`
          : "attached terminal · account type not confirmed"
      }
      size="sm"
      actions={
        <>
          <Button variant="ghost" size="md" onClick={decline}>
            Discard
          </Button>
          <Button
            variant="solid"
            size="md"
            onClick={send}
            disabled={!canSend}
          >
            {sending ? "Sending…" : pending.gate.dryRun ? "Validate (dry-run)" : real ? "Send to real account" : "Send"}
          </Button>
        </>
      }
    >
      <ul className="space-y-0.5 font-mono text-ev-strong">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {pending.gate.reasons.length > 0 && (
        <ul className="mt-2 space-y-1 rounded border border-ev-warn/40 bg-ev-warn/10 p-2 text-ev-warn">
          {pending.gate.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {real && (
        <div className="mt-2" data-testid="real-account-ack-wrap">
          <Checkbox
            label="I understand this order goes to a real account with real money."
            checked={riskOk}
            onChange={setRiskOk}
          />
          {/* Hidden input preserves the legacy test id. */}
          <input
            type="checkbox"
            checked={riskOk}
            onChange={(e) => setRiskOk(e.target.checked)}
            className="sr-only"
            data-testid="real-account-ack"
            tabIndex={-1}
            aria-hidden
          />
        </div>
      )}
      <p className="mt-2 text-dense text-ev-faint">
        This confirmation can be used once. Anything changed since the ticket was filled must be re-confirmed.
      </p>
    </Dialog>
  );
}
