import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { composeReview, reviewWindow } from "@ezyview/journal";
import type { JournalEntry, JournalNote } from "@ezyview/journal";
import { useJournal } from "./journal";

interface Props {
  entries: readonly JournalEntry[];
  notes: readonly JournalNote[];
  /** Selected local day as a `dateKey` string; shared with the Calendar tab. */
  selectedDay: string;
  onSelectDay: (key: string) => void;
}

/**
 * Daily/weekly review composer: preview of `composeReview`, an editable copy
 * the user can annotate, and the saved list with Load / Remove.
 *
 * The draft is keyed to `day|period` so switching either falls back to the
 * freshly composed text without a reset effect racing a Load.
 */
export function JournalReviews({ entries, notes, selectedDay, onSelectDay }: Props) {
  const savedReviews = useJournal((s) => s.savedReviews);
  const saveReview = useJournal((s) => s.saveReview);
  const removeReview = useJournal((s) => s.removeReview);

  const [period, setPeriod] = useState<"daily" | "weekly">("daily");
  const [draftKey, setDraftKey] = useState("");
  const [draft, setDraft] = useState<string>("");

  const win = useMemo(() => reviewWindow(selectedDay, period), [selectedDay, period]);
  const composed = useMemo(() => composeReview(entries, notes, win.start, win.end), [entries, notes, win]);

  const key = `${selectedDay}|${period}`;
  const editor = draftKey === key ? draft : composed;

  const edit = (value: string) => {
    setDraft(value);
    setDraftKey(key);
  };

  const load = (text: string, reviewKey: string, reviewPeriod: "daily" | "weekly") => {
    onSelectDay(reviewKey);
    setPeriod(reviewPeriod);
    setDraft(text);
    setDraftKey(`${reviewKey}|${reviewPeriod}`);
  };

  const periodBtn = (value: "daily" | "weekly", label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setPeriod(value)}
      aria-pressed={period === value}
      className={`rounded border px-2 py-0.5 text-[11px] ${
        period === value ? "border-ev-accent text-ev-strong" : "border-ev-line text-ev-muted hover:text-ev-strong"
      }`}
    >
      {label}
    </button>
  );

  const textarea =
    "w-full resize-none rounded border border-ev-line bg-ev-bg p-2 text-xs text-ev-text focus:border-ev-accent";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {periodBtn("daily", "Daily")}
        {periodBtn("weekly", "Weekly")}
        <input
          type="date"
          aria-label="Review date"
          value={selectedDay}
          onChange={(e) => {
            if (e.target.value) onSelectDay(e.target.value);
          }}
          className="rounded border border-ev-line bg-ev-bg px-2 py-0.5 text-ev-text focus:border-ev-accent"
        />
        <span className="text-ev-faint tabular-nums">
          {new Date(win.start * 1000).toLocaleString()} → {new Date(win.end * 1000).toLocaleString()}
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
        <div className="flex min-h-0 flex-col">
          <span className="mb-1 text-[10px] uppercase tracking-wider text-ev-faint">Preview</span>
          <textarea readOnly value={composed} aria-label="Composed review preview" className={`${textarea} min-h-40 flex-1`} />
        </div>
        <div className="flex min-h-0 flex-col">
          <span className="mb-1 text-[10px] uppercase tracking-wider text-ev-faint">Editor</span>
          <textarea
            value={editor}
            onChange={(e) => edit(e.target.value)}
            aria-label="Review text"
            className={`${textarea} min-h-40 flex-1`}
          />
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDraftKey("")}
              disabled={draftKey !== key}
              className="rounded border border-ev-line px-2 py-0.5 text-[11px] text-ev-muted hover:text-ev-strong disabled:opacity-40"
            >
              Reset to preview
            </button>
            <button
              type="button"
              onClick={() => saveReview({ key: selectedDay, period, text: editor })}
              disabled={editor.trim() === ""}
              className="ml-auto rounded bg-ev-accent px-3 py-1 text-[11px] font-medium text-white hover:bg-ev-accent-hover disabled:opacity-40"
            >
              Save review
            </button>
          </div>
        </div>
      </div>

      <section>
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ev-faint">Saved reviews</h3>
        {savedReviews.length === 0 ? (
          <p className="text-xs text-ev-faint">Nothing saved yet — compose above and hit Save.</p>
        ) : (
          <ul className="space-y-1">
            {savedReviews.map((review) => (
              <li
                key={review.id}
                className="flex items-center gap-3 rounded border border-ev-line bg-ev-panel px-2 py-1 text-[11px]"
              >
                <span className="w-24 shrink-0 tabular-nums text-ev-strong">{review.key}</span>
                <span className="w-14 shrink-0 rounded bg-ev-raised px-1.5 py-0.5 text-center text-ev-muted">
                  {review.period}
                </span>
                <span className="truncate text-ev-text">{review.text.split("\n")[0]}</span>
                <span className="ml-auto shrink-0 text-ev-faint">
                  saved {new Date(review.savedAt * 1000).toLocaleString()}
                </span>
                <button
                  type="button"
                  onClick={() => load(review.text, review.key, review.period)}
                  className="rounded border border-ev-line px-2 py-0.5 text-ev-muted hover:text-ev-strong"
                >
                  Load
                </button>
                <button
                  type="button"
                  aria-label={`Remove review ${review.key}`}
                  onClick={() => removeReview(review.id)}
                  className="flex size-5 items-center justify-center rounded text-ev-faint hover:bg-ev-raised hover:text-ev-down"
                >
                  <Trash2 size={12} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
