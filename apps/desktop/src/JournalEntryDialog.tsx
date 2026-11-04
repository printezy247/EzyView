import { useState } from "react";
import type { TradeEmotion } from "@ezyview/journal";
import { useJournal } from "./journal";
import { Button, Dialog, Field, Input, NumberInput, Select } from "./ui";

interface Props {
  onClose: () => void;
}

const EMOTIONS: readonly TradeEmotion[] = ["calm", "confident", "anxious", "fomo", "revenge", "tired"];

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** `datetime-local` value for an epoch-ms timestamp (local time). */
function toDatetimeLocal(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** `datetime-local` string → epoch seconds; undefined when empty/invalid. */
function epochSeconds(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

/**
 * Manual trade capture. Everything optional stays optional — the entry lands
 * with only what was typed, so a quick "symbol + entry" note is one dialog away.
 */
export function JournalEntryDialog({ onClose }: Props) {
  const addEntry = useJournal((s) => s.addEntry);

  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"long" | "short">("long");
  const [qty, setQty] = useState<number | null>(null);
  const [entryPrice, setEntryPrice] = useState<number | null>(null);
  const [entryTime, setEntryTime] = useState(() => toDatetimeLocal(Date.now()));
  const [exitPrice, setExitPrice] = useState<number | null>(null);
  const [exitTime, setExitTime] = useState("");
  const [pnl, setPnl] = useState<number | null>(null);
  const [stopPrice, setStopPrice] = useState<number | null>(null);
  const [targetPrice, setTargetPrice] = useState<number | null>(null);
  const [fees, setFees] = useState<number | null>(null);
  const [plannedRisk, setPlannedRisk] = useState<number | null>(null);
  const [setup, setSetup] = useState("");
  const [tags, setTags] = useState("");
  const [emotion, setEmotion] = useState<TradeEmotion | "">("");
  const [rulesText, setRulesText] = useState("");
  const [rating, setRating] = useState("0");
  const [notes, setNotes] = useState("");
  const [shot, setShot] = useState<string | null>(null);

  const valid = symbol.trim() !== "" && (qty ?? 0) > 0 && (entryPrice ?? 0) > 0;

  const submit = () => {
    if (!valid) return;
    const rules = rulesText
      .split("\n")
      .map((line) => line.trim())
      .filter((label) => label !== "")
      .map((label) => ({ label, done: false }));
    addEntry({
      symbol: symbol.trim(),
      side,
      qty: qty ?? 0,
      entryPrice: entryPrice ?? 0,
      entryTime: epochSeconds(entryTime) ?? Math.floor(Date.now() / 1000),
      exitPrice: exitPrice ?? undefined,
      exitTime: epochSeconds(exitTime),
      pnl: pnl ?? undefined,
      stopPrice: stopPrice ?? undefined,
      targetPrice: targetPrice ?? undefined,
      fees: fees ?? undefined,
      plannedRisk: plannedRisk ?? undefined,
      setup: setup.trim() || undefined,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag !== ""),
      emotion: emotion === "" ? undefined : emotion,
      rules: rules.length > 0 ? rules : undefined,
      rating: rating === "0" ? undefined : Number(rating),
      notes: notes.trim() || undefined,
      screenshots: shot ? [shot] : undefined,
      source: "manual",
    });
    onClose();
  };

  const onScreenshot = (file: File | undefined) => {
    if (!file) {
      setShot(null);
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => setShot(typeof reader.result === "string" ? reader.result : null));
    reader.readAsDataURL(file);
  };

  return (
    <Dialog
      onClose={onClose}
      title="Manual entry"
      size="lg"
      actions={
        <>
          {!valid && <span className="mr-auto text-dense text-ev-faint">Symbol, qty &gt; 0 and entry price &gt; 0 are required.</span>}
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="solid" size="md" onClick={submit} disabled={!valid}>
            Add trade
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Field label="Symbol" required>
          {({ controlId, describedBy, invalid }) => (
            <Input id={controlId} autoFocus value={symbol} onChange={(e) => setSymbol(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid || undefined} block />
          )}
        </Field>
        <Select
          label="Side"
          value={side}
          onChange={(v) => setSide(v === "short" ? "short" : "long")}
          options={[
            { value: "long", label: "Long" },
            { value: "short", label: "Short" },
          ]}
          className="w-full"
        />
        <NumberInput label="Qty" required value={qty} min={0} onValueChange={setQty} />
        <NumberInput label="Entry price" required value={entryPrice} min={0} onValueChange={setEntryPrice} />
        <Field label="Entry time">
          {({ controlId }) => (
            <Input id={controlId} type="datetime-local" value={entryTime} onChange={(e) => setEntryTime(e.target.value)} block />
          )}
        </Field>
        <NumberInput label="Exit price" value={exitPrice} min={0} onValueChange={setExitPrice} />
        <Field label="Exit time">
          {({ controlId }) => (
            <Input id={controlId} type="datetime-local" value={exitTime} onChange={(e) => setExitTime(e.target.value)} block />
          )}
        </Field>
        <NumberInput label="P&L" value={pnl} onValueChange={setPnl} />
        <NumberInput label="Fees" value={fees} min={0} onValueChange={setFees} />
        <NumberInput label="Stop" value={stopPrice} min={0} onValueChange={setStopPrice} />
        <NumberInput label="Target" value={targetPrice} min={0} onValueChange={setTargetPrice} />
        <NumberInput label="Planned risk" value={plannedRisk} min={0} onValueChange={setPlannedRisk} />
        <Field label="Setup">
          {({ controlId }) => <Input id={controlId} value={setup} onChange={(e) => setSetup(e.target.value)} block />}
        </Field>
        <Field label="Tags" hint="Comma separated">
          {({ controlId, describedBy }) => (
            <Input id={controlId} placeholder="breakout, A+ setup" value={tags} onChange={(e) => setTags(e.target.value)} aria-describedby={describedBy} block />
          )}
        </Field>
        <Select
          label="Emotion"
          value={emotion}
          onChange={(v) => setEmotion(v as TradeEmotion | "")}
          options={[{ value: "", label: "—" }, ...EMOTIONS.map((option) => ({ value: option, label: option }))]}
          className="w-full"
        />
        <Select
          label="Rating"
          value={rating}
          onChange={setRating}
          options={[
            { value: "0", label: "—" },
            ...[1, 2, 3, 4, 5].map((star) => ({ value: String(star), label: `${star}/5` })),
          ]}
          className="w-full"
        />
        <Field label="Screenshot">
          {({ controlId }) => (
            <Input
              id={controlId}
              type="file"
              accept="image/*"
              onChange={(e) => onScreenshot(e.target.files?.[0])}
              className="w-full file:mr-2 file:rounded file:border-0 file:bg-ev-raised file:px-2 file:py-0.5 file:text-dense file:text-ev-text"
            />
          )}
        </Field>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Rules (one per line)">
          {({ controlId }) => (
            <textarea id={controlId} rows={3} value={rulesText} onChange={(e) => setRulesText(e.target.value)} className="w-full resize-none rounded border border-ev-line bg-ev-bg px-2 py-1 text-base text-ev-text focus:border-ev-accent" />
          )}
        </Field>
        <Field label="Notes">
          {({ controlId }) => (
            <textarea id={controlId} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full resize-none rounded border border-ev-line bg-ev-bg px-2 py-1 text-base text-ev-text focus:border-ev-accent" />
          )}
        </Field>
      </div>

      {shot && (
        <div className="mt-2 flex items-center gap-2">
          <img src={shot} alt="Screenshot preview" className="h-16 rounded border border-ev-line" />
          <Button variant="outline" size="sm" onClick={() => setShot(null)}>
            Remove
          </Button>
        </div>
      )}
    </Dialog>
  );
}
