import { useEffect, useRef, useState } from "react";
import { BellRing, Bell } from "lucide-react";
import type { AlertCondition, AlertFrequency, PriceAlert } from "@ezyview/data-adapters";
import { Button, Dialog, IconButton, Input, NumberInput, Select } from "./ui";

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
    <Dialog
      open={open}
      onClose={onClose}
      title={`Alerts on ${symbol}`}
      size="lg"
      className="h-[28rem]"
      actions={
        <Button variant="ghost" size="md" onClick={onClose}>
          Close
        </Button>
      }
    >
      <AlertForm symbol={symbol} lastPrice={lastPrice} onAdd={onAdd} />

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {alerts.length === 0 ? (
          <p className="py-6 text-center text-body text-ev-muted">
            No alerts yet. Set a condition above to get notified when price reaches it.
          </p>
        ) : (
          <ul className="space-y-1" role="list" aria-label={`Alerts on ${symbol}`}>
            {alerts.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded border border-ev-raised px-2.5 py-1.5"
              >
                {a.state === "triggered" ? (
                  <BellRing size={13} aria-hidden className="shrink-0 text-ev-orange" />
                ) : (
                  <Bell size={13} aria-hidden className="shrink-0 text-ev-muted" />
                )}
                <span className="text-base text-ev-strong">{describeCondition(a.condition)}</span>
                <span className="text-dense text-ev-muted">{FREQ_LABELS[a.frequency]}</span>
                {a.state === "triggered" && (
                  <span className="rounded bg-ev-line px-1.5 text-dense text-ev-orange">triggered</span>
                )}
                {a.message && <span className="truncate text-dense text-ev-muted">{a.message}</span>}
                <IconButton
                  label="Delete alert"
                  size="sm"
                  onClick={() => onRemove(a.id)}
                  className="ml-auto hover:text-ev-down-text"
                >
                  <Bell size={13} aria-hidden className="hidden" />
                  <span aria-hidden className="text-base leading-none">×</span>
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
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
  const [value, setValue] = useAlertField<number | null>(lastPrice);
  const [bars, setBars] = useAlertField<number | null>(3);
  const [mult, setMult] = useAlertField<number | null>(2);
  const [frequency, setFrequency] = useAlertField<AlertFrequency>("once_per_bar_close");
  const [message, setMessage] = useAlertField<string>("");
  const [busy, setBusy] = useState(false);

  // The live price usually arrives after the dialog opens, so fill the field
  // in once it lands - unless the trader already typed their own level.
  const touched = useRef(false);
  useEffect(() => {
    if (touched.current) return;
    if (lastPrice === null) return;
    setValue(lastPrice);
  }, [lastPrice, setValue]);

  const needsValue = ["crossing", "crossing_up", "crossing_down", "greater", "less"].includes(kind);
  const needsBars = kind.startsWith("moving_");
  const needsMult = kind.startsWith("channel_exit_");

  const submit = () => {
    if (disabled || busy) return;
    setBusy(true);
    const condition: AlertCondition = needsValue
      ? ({ kind, value: value ?? 0 } as AlertCondition)
      : needsBars
        ? ({ kind, bars: Number(bars) } as AlertCondition)
        : ({ kind, mult: Number(mult) } as AlertCondition);
    try {
      onAdd(symbol, condition, frequency, message.trim());
      setMessage("");
    } finally {
      setTimeout(() => setBusy(false), 300);
    }
  };

  // An empty field is not a price: it reports null, which stays disabled
  // instead of arming an alert at zero.
  const disabled =
    (needsValue && (value === null || !Number.isFinite(value) || value <= 0)) ||
    (needsBars && (bars === null || bars < 1)) ||
    busy;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-ev-raised pb-3">
      <Select
        label="Alert condition"
        value={kind}
        onChange={(v) => setKind(v as AlertCondition["kind"])}
        options={Object.entries(CONDITION_LABELS).map(([k, label]) => ({ value: k, label }))}
      />

      {needsValue && (
        <NumberInput
          label="Alert price"
          value={value}
          min={0}
          onValueChange={(v) => {
            touched.current = true;
            setValue(v);
          }}
          placeholder="Price"
          className="w-28"
        />
      )}
      {needsBars && (
        <NumberInput
          label="Bars"
          value={bars}
          min={1}
          step={1}
          precision={0}
          onValueChange={setBars}
          className="w-20"
        />
      )}
      {needsMult && (
        <NumberInput
          label="Multiplier"
          value={mult}
          min={0}
          step={0.5}
          onValueChange={setMult}
          placeholder="σ mult"
          className="w-20"
        />
      )}

      <Select
        label="Alert frequency"
        value={frequency}
        onChange={(v) => setFrequency(v as AlertFrequency)}
        options={Object.entries(FREQ_LABELS).map(([k, label]) => ({ value: k, label }))}
      />

      <Input
        aria-label="Alert message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Message (optional)"
        className="min-w-32 flex-1"
      />

      <Button
        onClick={submit}
        disabled={disabled}
      >
        {busy ? "Creating…" : "Create"}
      </Button>
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
