import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Camera, Trash2, X } from "lucide-react";
import { computeStats, dateKey } from "@ezyview/journal";
import type { JournalEntry, JournalNote } from "@ezyview/journal";
import { captureChart, useJournal } from "./journal";
import { entriesToCsv } from "./journalCsv";
import { useMt5 } from "./mt5";
import { useTrading } from "./trading";
import { JournalCalendar } from "./JournalCalendar";
import { JournalEntryDialog } from "./JournalEntryDialog";
import { JournalPlans } from "./JournalPlans";
import { JournalPropFirmBar } from "./JournalPropFirmBar";
import { JournalReviews } from "./JournalReviews";
import { JournalStatsView } from "./JournalStatsView";
import { buttonClass, chipClass } from "./ui";

interface Props {
  onClose: () => void;
}

interface Row {
  key: string;
  time: number;
  node: ReactNode;
}

type Tab = "feed" | "plans" | "calendar" | "stats" | "reviews";

const TABS: readonly { id: Tab; label: string }[] = [
  { id: "feed", label: "Feed" },
  { id: "plans", label: "Plans" },
  { id: "calendar", label: "Calendar" },
  { id: "stats", label: "Stats" },
  { id: "reviews", label: "Reviews" },
];

const clock = (epoch: number): string => new Date(epoch * 1000).toLocaleString(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const money = (value: number): string =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Download every entry as a CSV blob; revoke the object URL right after the click. */
function exportCsv(): void {
  const blob = new Blob([entriesToCsv(useJournal.getState().entries)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "journal-export.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * The daily driver: what you traded, what you thought, what it scored.
 *
 * Feed rows mix deal history and notes; the other tabs (calendar heatmap,
 * stats, review composer) read the same entries so every number agrees.
 */
export function JournalPanel({ onClose }: Props) {
  const entries = useJournal((s) => s.entries);
  const notes = useJournal((s) => s.notes);
  const query = useJournal((s) => s.query);
  const setQuery = useJournal((s) => s.setQuery);
  const addNote = useJournal((s) => s.addNote);
  const removeNote = useJournal((s) => s.removeNote);
  const removeEntry = useJournal((s) => s.removeEntry);
  const importDeals = useJournal((s) => s.importDeals);
  const deals = useTrading((s) => s.deals);
  const source = useMt5((s) => s.source);

  const [tab, setTab] = useState<Tab>("feed");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(() => dateKey(Math.floor(Date.now() / 1000)));

  const [text, setText] = useState("");
  const [shot, setShot] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [lastImport, setLastImport] = useState<number | null>(null);

  const filteredEntries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    const matches = (haystacks: (string | undefined)[]): boolean =>
      haystacks.some((value) => (value ?? "").toLowerCase().includes(needle));
    return entries.filter((entry) => matches([entry.symbol, entry.setup, entry.notes, ...(entry.tags ?? [])]));
  }, [entries, query]);

  const stats = useMemo(() => computeStats(filteredEntries), [filteredEntries]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = (haystacks: (string | undefined)[]): boolean =>
      !needle || haystacks.some((value) => (value ?? "").toLowerCase().includes(needle));

    const tradeRows: Row[] = filteredEntries.map((entry) => ({
      key: `t:${entry.id}`,
      time: entry.exitTime ?? entry.entryTime,
      node: <TradeRow entry={entry} onDelete={() => removeEntry(entry.id)} />,
    }));

    const noteRows: Row[] = notes
      .filter((note) => matches([note.symbol, note.text, ...(note.tags ?? [])]))
      .map((note) => ({
        key: `n:${note.id}`,
        time: note.time,
        node: <NoteRow note={note} onDelete={() => removeNote(note.id)} onPreview={setPreview} />,
      }));

    return [...tradeRows, ...noteRows].sort((a, b) => b.time - a.time);
  }, [filteredEntries, notes, query, removeEntry, removeNote]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed && !shot) return;
    addNote({
      time: Math.floor(Date.now() / 1000),
      text: trimmed,
      ...(shot ? { screenshots: [shot] } : {}),
    });
    setText("");
    setShot(null);
  };

  const importNow = () => {
    setLastImport(importDeals(deals, source === "mt5" ? "mt5" : "paper"));
  };

  const chip = chipClass({ tone: "neutral" });
  const headerBtn = buttonClass({ size: "sm", variant: "ghost" });

  return (
    <section aria-label="Trading journal" className="flex min-h-0 flex-1 flex-col border-t border-ev-raised bg-ev-bg">
      <header className="flex h-8 shrink-0 items-center gap-3 border-b border-ev-raised px-3 text-dense">
        <span className="font-semibold uppercase tracking-wider text-ev-muted">Journal</span>

        <nav aria-label="Journal views" className="flex items-center gap-0.5">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded px-2 py-0.5 ${
                tab === id ? "bg-ev-raised font-medium text-ev-strong" : "text-ev-muted hover:text-ev-strong"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <dl className="flex items-center gap-3 num">
          <Fact label="Net" value={money(stats.netPnl)} tone={stats.netPnl >= 0 ? "text-ev-up-text" : "text-ev-down-text"} />
          <Fact label="Trades" value={String(stats.trades)} />
          <Fact label="Win rate" value={stats.trades === 0 ? "—" : `${Math.round(stats.winRate * 100)}%`} />
          <Fact label="Max DD" value={money(stats.maxDrawdown)} tone="text-ev-down-text" />
        </dl>

        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={importNow} title="Turn closed deals into journal trades" className={headerBtn}>
            Import history
          </button>
          {lastImport !== null && (
            <span className="text-dense text-ev-up-text">
              {lastImport === 0 ? "nothing new" : `+${lastImport}`}
            </span>
          )}
          {tab === "feed" && (
            <>
              <button type="button" onClick={() => setDialogOpen(true)} className={headerBtn}>
                + Manual entry
              </button>
              <button type="button" onClick={exportCsv} title="Download all entries as CSV" className={headerBtn}>
                Export CSV
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close journal"
            className="flex size-6 items-center justify-center rounded text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
          >
            <X size={13} aria-hidden />
          </button>
        </div>
      </header>

      {tab === "feed" && <JournalPropFirmBar drawdown={stats.maxDrawdown} />}

      {tab === "feed" && (
        <div className="flex min-h-0 flex-1">
          <div className="flex w-72 shrink-0 flex-col gap-2 border-r border-ev-raised p-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
              placeholder="What did you see? Plan, execution, feeling…"
              aria-label="Journal note"
              className="min-h-0 flex-1 resize-none rounded border border-ev-line bg-ev-panel p-2 text-base text-ev-text focus:border-ev-accent"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShot(captureChart())}
                className={`flex items-center gap-1 rounded border px-2 py-1 text-dense hover:text-ev-strong ${
                  shot ? "border-ev-accent text-ev-strong" : "border-ev-line text-ev-muted"
                }`}
              >
                <Camera size={13} aria-hidden />
                {shot ? "Chart attached" : "Chart"}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!text.trim() && !shot}
                className="ml-auto rounded bg-ev-accent px-3 py-1 text-dense font-medium text-white hover:bg-ev-accent-hover disabled:opacity-40"
              >
                Add note
              </button>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <nav className="flex h-7 shrink-0 items-center gap-2 border-b border-ev-raised px-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by symbol, tag or text"
                aria-label="Filter journal"
                className="w-64 rounded border border-ev-line bg-ev-panel px-2 py-0.5 text-dense text-ev-text focus:border-ev-accent"
              />
              <span className={`${chip} text-ev-muted`}>{rows.length} items</span>
            </nav>

            <div className="min-h-0 flex-1 overflow-auto">
              {rows.length === 0 ? (
                <p className="px-4 py-6 text-base text-ev-faint">
                  Nothing here yet — take a note, import your closed trades, or add a manual entry.
                </p>
              ) : (
                <ul>
                  {rows.map((row) => (
                    <li key={row.key} className="border-b border-ev-panel px-3 py-1.5 hover:bg-ev-panel/60">
                      {row.node}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "plans" && <JournalPlans />}
      {tab === "calendar" && <JournalCalendar entries={entries} selectedDay={selectedDay} onSelectDay={setSelectedDay} />}
      {tab === "stats" && <JournalStatsView entries={entries} />}
      {tab === "reviews" && (
        <JournalReviews entries={entries} notes={notes} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
      )}

      {dialogOpen && <JournalEntryDialog onClose={() => setDialogOpen(false)} />}

      {preview && (
        <button
          type="button"
          onClick={() => setPreview(null)}
          onKeyDown={(e) => e.key === "Escape" && setPreview(null)}
          autoFocus
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-8"
          aria-label="Dismiss screenshot"
        >
          <img src={preview} alt="Chart screenshot" className="max-h-full max-w-full rounded border border-ev-line" />
        </button>
      )}
    </section>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="text-ev-faint">{label}</dt>
      <dd className={tone ?? "text-ev-text"}>{value}</dd>
    </div>
  );
}

function TradeRow({ entry, onDelete }: { entry: JournalEntry; onDelete: () => void }) {
  const pnl = entry.pnl;
  return (
    <div className="flex items-center gap-3 text-dense">
      <span className="w-32 shrink-0 text-ev-muted">{clock(entry.exitTime ?? entry.entryTime)}</span>
      <span className="w-20 shrink-0 font-medium text-ev-strong">{entry.symbol}</span>
      <span className={entry.side === "long" ? "w-12 text-ev-up-text" : "w-12 text-ev-down-text"}>
        {entry.side.toUpperCase()}
      </span>
      <span className="w-16 shrink-0 num text-ev-text">{entry.qty}</span>
      <span className="w-40 shrink-0 num text-ev-muted">
        {entry.entryPrice}
        {entry.exitPrice !== undefined ? ` → ${entry.exitPrice}` : ""}
      </span>
      {pnl === undefined ? (
        <span className="rounded border border-ev-dim px-1.5 py-0.5 text-dense text-ev-muted">open</span>
      ) : (
        <span className={`num ${pnl >= 0 ? "text-ev-up-text" : "text-ev-down-text"}`}>
          {pnl >= 0 ? "+" : ""}
          {money(pnl)}
        </span>
      )}
      {entry.emotion && <span className="rounded bg-ev-raised px-1.5 py-0.5 text-dense text-ev-muted">{entry.emotion}</span>}
      {entry.source && <span className="rounded bg-ev-raised px-1.5 py-0.5 text-dense text-ev-muted">{entry.source}</span>}
      <button
        type="button"
        aria-label={`Delete trade ${entry.symbol}`}
        onClick={onDelete}
        className="ml-auto flex size-6 items-center justify-center rounded text-ev-faint hover:bg-ev-raised hover:text-ev-down-text"
      >
        <Trash2 size={12} aria-hidden />
      </button>
    </div>
  );
}

function NoteRow({
  note,
  onDelete,
  onPreview,
}: {
  note: JournalNote;
  onDelete: () => void;
  onPreview: (url: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 text-dense">
      <span className="w-32 shrink-0 text-ev-muted">{clock(note.time)}</span>
      <span className="text-ev-text">
        {note.text || <span className="italic text-ev-faint">(screenshot only)</span>}
      </span>
      {note.screenshots?.map((url) => (
        <button
          key={url.slice(-24)}
          type="button"
          onClick={() => onPreview(url)}
          title="View chart screenshot"
          className="ml-1 h-6 w-10 overflow-hidden rounded border border-ev-line hover:border-ev-accent"
        >
          <img src={url} alt="Chart thumbnail" className="h-full w-full object-cover" />
        </button>
      ))}
      <button
        type="button"
        aria-label="Delete note"
        onClick={onDelete}
        className="ml-auto flex size-6 items-center justify-center rounded text-ev-faint hover:bg-ev-raised hover:text-ev-down-text"
      >
        <Trash2 size={12} aria-hidden />
      </button>
    </div>
  );
}
