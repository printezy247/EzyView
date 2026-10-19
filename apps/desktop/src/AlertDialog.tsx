import { useState } from "react";
import { Bell, BellRing, Trash2 } from "lucide-react";
import type { AlertCondition, AlertFrequency, PriceAlert } from "@ezyview/data-adapters";

/** One controlled field in the alert form. */
function useAlertField<T>(initial: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(initial);
  return [value, setValue];
}

interface Props {
  alerts: PriceAlert[];
  onAdd: (symbol: string, condition: AlertCondition, frequency: AlertFrequency, message: string) => void;
  onRemove: (id: string) => void;
  symbol: string;
  lastPrice: number | null;
}

const CONDITION_LABELS: Record<AlertCondition["kind"], string> = {
  crossing: "Crossing",
  crossing_up: "Crossing up",
  crossing_down: "Crossing down",
  greater: "Greater than",
  less: "Less than",
  moving_up: "Moving up",
  moving_down: "Moving down",
  channel_exit_up: "Exits channel up",
  channel_exit_down: "Exits channel down",
};

const FREQ_LABELS: Record<AlertFrequency, string> = {
  once: "Only once",
  once_per_bar: "Once per bar",
  once_per_bar_close: "Once per bar close",
};

export function AlertDialog({
  open,
  onClose,
  alerts,
  onAdd,
  onRemove,
  symbol,
  lastPrice,
}: Props & { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex h-[28rem] w-[32rem] flex-col rounded-md border border-[#2a2e39] bg-[#131722] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#1e222d] px-4 py-2.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Bell size={14} aria-hidden />
            Alerts on {symbol}
          </h2>
          <button type="button" onClick={onClose} className="text-[#787b86] hover:text-white">
            Close
          </button>
        </div>

        <AlertForm symbol={symbol} lastPrice={lastPrice} onAdd={onAdd} />

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
          {alerts.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#787b86]">
              No alerts yet. Set a condition above to get notified when price reaches it.
            </p>
          ) : (
            <ul className="space-y-1">
              {alerts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-2 rounded border border-[#1e222d] px-2.5 py-1.5"
                >
                  {a.state === "triggered" ? (
                    <BellRing size={13} aria-hidden className="shrink-0 text-[#ff9800]" />
                  ) : (
                    <Bell size={13} aria-hidden className="shrink-0 text-[#787b86]" />
                  )}
                  <span className="text-xs text-white">{describeCondition(a.condition)}</span>
                  <span className="text-[11px] text-[#787b86]">{FREQ_LABELS[a.frequency]}</span>
                  {a.state === "triggered" && (
                    <span className="rounded bg-[#2a2e39] px-1.5 text-[10px] text-[#ff9800]">triggered</span>
                  )}
                  {a.message && <span className="truncate text-[11px] text-[#787b86]">{a.message}</span>}
                  <button
                    type="button"
                    onClick={() => onRemove(a.id)}
                    className="ml-auto text-[#434651] hover:text-[#ef5350]"
                    aria-label="Delete alert"
                  >
                    <Trash2 size={13} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function AlertForm({
  symbol,
  lastPrice,
  onAdd,
}: {
  symbol: string;
  lastPrice: number | null;
  onAdd: Props["onAdd"];
}) {
  const [kind, setKind] = useAlertField<AlertCondition["kind"]>("crossing_up");
  const [value, setValue] = useAlertField<string>(lastPrice === null ? "" : String(lastPrice));
  const [bars, setBars] = useAlertField<string>("3");
  const [mult, setMult] = useAlertField<string>("2");
  const [frequency, setFrequency] = useAlertField<AlertFrequency>("once_per_bar_close");
  const [message, setMessage] = useAlertField<string>("");

  const needsValue = ["crossing", "crossing_up", "crossing_down", "greater", "less"].includes(kind);
  const needsBars = kind.startsWith("moving_");
  const needsMult = kind.startsWith("channel_exit_");

  const submit = () => {
    const condition: AlertCondition = needsValue
      ? ({ kind, value: Number(value) } as AlertCondition)
      : needsBars
        ? ({ kind, bars: Number(bars) } as AlertCondition)
        : ({ kind, mult: Number(mult) } as AlertCondition);
    onAdd(symbol, condition, frequency, message.trim());
    setMessage("");
  };

  const disabled = (needsValue && !Number.isFinite(Number(value))) || (needsBars && Number(bars) < 1);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[#1e222d] px-4 py-3">
      <select
        aria-label="Alert condition"
        value={kind}
        onChange={(e) => setKind(e.target.value as AlertCondition["kind"])}
        className="rounded border border-[#2a2e39] bg-[#0e1117] px-2 py-1 text-xs text-white"
      >
        {Object.entries(CONDITION_LABELS).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>

      {needsValue && (
        <input
          aria-label="Alert price"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Price"
          inputMode="decimal"
          className="w-24 rounded border border-[#2a2e39] bg-[#0e1117] px-2 py-1 text-xs text-white"
        />
      )}
      {needsBars && (
        <input
          aria-label="Bars"
          value={bars}
          onChange={(e) => setBars(e.target.value)}
          placeholder="Bars"
          inputMode="numeric"
          className="w-16 rounded border border-[#2a2e39] bg-[#0e1117] px-2 py-1 text-xs text-white"
        />
      )}
      {needsMult && (
        <input
          aria-label="Multiplier"
          value={mult}
          onChange={(e) => setMult(e.target.value)}
          placeholder="σ mult"
          inputMode="decimal"
          className="w-16 rounded border border-[#2a2e39] bg-[#0e1117] px-2 py-1 text-xs text-white"
        />
      )}

      <select
        aria-label="Alert frequency"
        value={frequency}
        onChange={(e) => setFrequency(e.target.value as AlertFrequency)}
        className="rounded border border-[#2a2e39] bg-[#0e1117] px-2 py-1 text-xs text-white"
      >
        {Object.entries(FREQ_LABELS).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>

      <input
        aria-label="Alert message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Message (optional)"
        className="min-w-32 flex-1 rounded border border-[#2a2e39] bg-[#0e1117] px-2 py-1 text-xs text-white"
      />

      <button
        type="button"
        onClick={submit}
        disabled={disabled}
        className="rounded bg-[#2962ff] px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
      >
        Create
      </button>
    </div>
  );
}

export function describeCondition(c: AlertCondition): string {
  switch (c.kind) {
    case "crossing":
      return `Crossing ${c.value}`;
    case "crossing_up":
      return `Crossing up through ${c.value}`;
    case "crossing_down":
      return `Crossing down through ${c.value}`;
    case "greater":
      return `Price above ${c.value}`;
    case "less":
      return `Price below ${c.value}`;
    case "moving_up":
      return `Rising for ${c.bars} bars`;
    case "moving_down":
      return `Falling for ${c.bars} bars`;
    case "channel_exit_up":
      return `Exits ${c.mult}σ channel upward`;
    case "channel_exit_down":
      return `Exits ${c.mult}σ channel downward`;
    default:
      return "Alert";
  }
}
