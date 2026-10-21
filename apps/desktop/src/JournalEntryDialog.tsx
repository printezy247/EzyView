import { useState } from "react";
import { X } from "lucide-react";
import type { TradeEmotion } from "@ezyview/journal";
import { useJournal } from "./journal";
import { Modal } from "./Modal";

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

/** Trimmed finite number, or undefined for empty/invalid input. */
function num(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
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
  const [qty, setQty] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [entryTime, setEntryTime] = useState(() => toDatetimeLocal(Date.now()));
  const [exitPrice, setExitPrice] = useState("");
  const [exitTime, setExitTime] = useState("");
  const [pnl, setPnl] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [fees, setFees] = useState("");
  const [plannedRisk, setPlannedRisk] = useState("");
  const [setup, setSetup] = useState("");
  const [tags, setTags] = useState("");
  const [emotion, setEmotion] = useState<TradeEmotion | "">("");
  const [rulesText, setRulesText] = useState("");
  const [rating, setRating] = useState("0");
  const [notes, setNotes] = useState("");
  const [shot, setShot] = useState<string | null>(null);

  const valid = symbol.trim() !== "" && (num(qty) ?? 0) > 0 && (num(entryPrice) ?? 0) > 0;

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
      qty: num(qty) ?? 0,
      entryPrice: num(entryPrice) ?? 0,
      entryTime: epochSeconds(entryTime) ?? Math.floor(Date.now() / 1000),
      exitPrice: num(exitPrice),
      exitTime: epochSeconds(exitTime),
      pnl: num(pnl),
      stopPrice: num(stopPrice),
      targetPrice: num(targetPrice),
      fees: num(fees),
      plannedRisk: num(plannedRisk),
      setup: setup.trim() || undefined,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag !== ""),
      emotion: emotion === "" ? undefined : emotion,
      rules: rules.length > 0 ? rules : undefined,
      rating: num(rating),
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

  const field =
    "w-full rounded border border-ev-line bg-ev-bg px-2 py-1 text-base text-ev-text focus:border-ev-accent";
  const label = "block text-micro uppercase tracking-wider text-ev-faint";

  return (
    <Modal
      onClose={onClose}
      labelledBy="manual-entry-title"
      className="flex max-h-[90vh] w-[40rem] flex-col rounded-md border border-ev-line bg-ev-panel shadow-2xl"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-ev-raised px-4 py-2.5">
        <h2 id="manual-entry-title" className="text-body font-semibold text-ev-strong">
          Manual entry
        </h2>
        <button type="button" onClick={onClose} aria-label="Close" className="text-ev-muted hover:text-ev-strong">
          <X size={16} aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={label} htmlFor="je-symbol">
              Symbol *
            </label>
            <input id="je-symbol" autoFocus value={symbol} onChange={(e) => setSymbol(e.target.value)} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="je-side">
              Side
            </label>
            <select id="je-side" value={side} onChange={(e) => setSide(e.target.value === "short" ? "short" : "long")} className={field}>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="je-qty">
              Qty *
            </label>
            <input id="je-qty" type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="je-entry-price">
              Entry price *
            </label>
            <input id="je-entry-price" type="number" step="any" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="je-entry-time">
              Entry time
            </label>
            <input id="je-entry-time" type="datetime-local" value={entryTime} onChange={(e) => setEntryTime(e.target.value)} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="je-exit-price">
              Exit price
            </label>
            <input id="je-exit-price" type="number" step="any" value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="je-exit-time">
              Exit time
            </label>
            <input id="je-exit-time" type="datetime-local" value={exitTime} onChange={(e) => setExitTime(e.target.value)} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="je-pnl">
              P&amp;L
            </label>
            <input id="je-pnl" type="number" step="any" value={pnl} onChange={(e) => setPnl(e.target.value)} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="je-fees">
              Fees
            </label>
            <input id="je-fees" type="number" step="any" value={fees} onChange={(e) => setFees(e.target.value)} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="je-stop">
              Stop
            </label>
            <input id="je-stop" type="number" step="any" value={stopPrice} onChange={(e) => setStopPrice(e.target.value)} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="je-target">
              Target
            </label>
            <input id="je-target" type="number" step="any" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="je-risk">
              Planned risk
            </label>
            <input id="je-risk" type="number" step="any" value={plannedRisk} onChange={(e) => setPlannedRisk(e.target.value)} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="je-setup">
              Setup
            </label>
            <input id="je-setup" value={setup} onChange={(e) => setSetup(e.target.value)} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="je-tags">
              Tags
            </label>
            <input id="je-tags" placeholder="breakout, A+ setup" value={tags} onChange={(e) => setTags(e.target.value)} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="je-emotion">
              Emotion
            </label>
            <select id="je-emotion" value={emotion} onChange={(e) => setEmotion(e.target.value as TradeEmotion | "")} className={field}>
              <option value="">—</option>
              {EMOTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="je-rating">
              Rating
            </label>
            <select id="je-rating" value={rating} onChange={(e) => setRating(e.target.value)} className={field}>
              <option value="0">—</option>
              {[1, 2, 3, 4, 5].map((star) => (
                <option key={star} value={String(star)}>
                  {star}/5
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="je-shot">
              Screenshot
            </label>
            <input
              id="je-shot"
              type="file"
              accept="image/*"
              onChange={(e) => onScreenshot(e.target.files?.[0])}
              className="w-full rounded border border-ev-line bg-ev-bg px-1 py-0.5 text-dense text-ev-muted file:mr-2 file:rounded file:border-0 file:bg-ev-raised file:px-2 file:py-0.5 file:text-dense file:text-ev-text"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="je-rules">
              Rules (one per line)
            </label>
            <textarea id="je-rules" rows={3} value={rulesText} onChange={(e) => setRulesText(e.target.value)} className={`${field} resize-none`} />
          </div>
          <div>
            <label className={label} htmlFor="je-notes">
              Notes
            </label>
            <textarea id="je-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${field} resize-none`} />
          </div>
        </div>

        {shot && (
          <div className="flex items-center gap-2">
            <img src={shot} alt="Screenshot preview" className="h-16 rounded border border-ev-line" />
            <button
              type="button"
              onClick={() => setShot(null)}
              className="rounded border border-ev-line px-2 py-1 text-dense text-ev-muted hover:text-ev-strong"
            >
              Remove
            </button>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-ev-raised px-4 py-2.5">
        {!valid && <span className="text-dense text-ev-faint">Symbol, qty &gt; 0 and entry price &gt; 0 are required.</span>}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onClose} className="rounded border border-ev-line px-3 py-1 text-dense text-ev-muted hover:text-ev-strong">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid}
            className="rounded bg-ev-accent px-3 py-1 text-dense font-medium text-white hover:bg-ev-accent-hover disabled:opacity-40"
          >
            Add trade
          </button>
        </div>
      </div>
    </Modal>
  );
}
