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
import { VirtualList } from "./VirtualList";
import { Button, Checkbox, EmptyState, IconButton, Input, Tabs, chipClass } from "./ui";

interface Props {
  onClose: () => void;
  /** The view to show. Owned by the page, so it lives in the URL. */
  tab: JournalTabId;
  onTabChange: (tab: JournalTabId) => void;
}

interface Row {
  key: string;
  time: number;
  node: ReactNode;
}

export type JournalTabId = "feed" | "plans" | "calendar" | "stats" | "reviews";

/** Account-aware filter options: every capture source plus "any". */
const SOURCES: readonly (JournalEntry["source"] | "any")[] = ["any", "manual", "mt5", "ccxt", "alpaca", "paper"];

const TABS: readonly { id: JournalTabId; label: string }[] = [
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
export function JournalPanel({ onClose, tab, onTabChange }: Props) {
  const entries = useJournal((s) => s.entries);
  const notes = useJournal((s) => s.notes);
  const query = useJournal((s) => s.query);
  const setQuery = useJournal((s) => s.setQuery);
  const addNote = useJournal((s) => s.addNote);
  const removeNote = useJournal((s) => s.removeNote);
  const removeEntry = useJournal((s) => s.removeEntry);
  const sourceFilter = useJournal((s) => s.sourceFilter);
  const setSourceFilter = useJournal((s) => s.setSourceFilter);
  const updateEntries = useJournal((s) => s.updateEntries);
  const removeEntries = useJournal((s) => s.removeEntries);
  const importDeals = useJournal((s) => s.importDeals);
  const storageIssue = useJournal((s) => s.storageIssue);
  const dismissStorageIssue = useJournal((s) => s.dismissStorageIssue);
  const deals = useTrading((s) => s.deals);
  const source = useMt5((s) => s.source);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(() => dateKey(Math.floor(Date.now() / 1000)));

  const [text, setText] = useState("");
  const [shot, setShot] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [lastImport, setLastImport] = useState<number | null>(null);
  // Bulk edit: the checked trade ids and the tag the bulk bar will apply.
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkIds, setBulkIds] = useState<readonly string[]>([]);
  const [bulkTag, setBulkTag] = useState("");
  const checked = useMemo(() => new Set(bulkIds), [bulkIds]);

  const filteredEntries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const textMatch = (haystacks: (string | undefined)[]): boolean =>
      haystacks.some((value) => (value ?? "").toLowerCase().includes(needle));
    return entries.filter(
      (entry) =>
        (sourceFilter === "any" || entry.source === sourceFilter) &&
        (!needle || textMatch([entry.symbol, entry.setup, entry.notes, ...(entry.tags ?? [])])),
    );
  }, [entries, query, sourceFilter]);

  const stats = useMemo(() => computeStats(filteredEntries), [filteredEntries]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = (haystacks: (string | undefined)[]): boolean =>
      !needle || haystacks.some((value) => (value ?? "").toLowerCase().includes(needle));

    const tradeRows: Row[] = filteredEntries.map((entry) => ({
      key: `t:${entry.id}`,
      time: entry.exitTime ?? entry.entryTime,
      node: (
        <TradeRow
          entry={entry}
          onDelete={() => removeEntry(entry.id)}
          bulk={bulkMode}
          checked={checked.has(entry.id)}
          onCheck={() =>
            setBulkIds((ids) => (ids.includes(entry.id) ? ids.filter((id) => id !== entry.id) : [...ids, entry.id]))
          }
        />
      ),
    }));

    const noteRows: Row[] = notes
      .filter((note) => matches([note.symbol, note.text, ...(note.tags ?? [])]))
      .map((note) => ({
        key: `n:${note.id}`,
        time: note.time,
        node: <NoteRow note={note} onDelete={() => removeNote(note.id)} onPreview={setPreview} />,
      }));

    return [...tradeRows, ...noteRows].sort((a, b) => b.time - a.time);
  }, [filteredEntries, notes, query, removeEntry, removeNote, bulkMode, checked]);

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

  /** Merge a tag into every checked trade; dedupes via the store's normalize. */
  const applyBulkTag = () => {
    const tag = bulkTag.trim();
    if (tag === "" || bulkIds.length === 0) return;
    for (const entry of entries) {
      if (!checked.has(entry.id)) continue;
      updateEntries([entry.id], { tags: [...(entry.tags ?? []), tag] });
    }
    setBulkTag("");
  };

  const deleteSelected = () => {
    if (bulkIds.length === 0) return;
    removeEntries(bulkIds);
    setBulkIds([]);
    if (filteredEntries.length - bulkIds.length === 0) setBulkMode(false);
  };

  const allTradesChecked = filteredEntries.length > 0 && filteredEntries.every((entry) => checked.has(entry.id));
  const toggleAllTrades = () => {
    setBulkIds(allTradesChecked ? [] : filteredEntries.map((entry) => entry.id));
  };

  const chip = chipClass({ tone: "neutral" });

  return (
    <section aria-label="Trading journal" className="flex min-h-0 flex-1 flex-col border-t border-ev-raised bg-ev-bg">
      <header className="flex h-8 shrink-0 items-center gap-3 border-b border-ev-raised px-3 text-dense">
        <span className="font-semibold uppercase tracking-wider text-ev-muted">Journal</span>

        <Tabs label="Journal views" items={TABS} value={tab} onChange={(v) => onTabChange(v as JournalTabId)} />

        <dl className="flex items-center gap-3 num">
          <Fact label="Net" value={money(stats.netPnl)} tone={stats.netPnl >= 0 ? "text-ev-up-text" : "text-ev-down-text"} />
          <Fact label="Trades" value={String(stats.trades)} />
          <Fact label="Win rate" value={stats.trades === 0 ? "—" : `${Math.round(stats.winRate * 100)}%`} />
          <Fact label="Max DD" value={money(stats.maxDrawdown)} tone="text-ev-down-text" />
        </dl>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={importNow} title="Turn closed deals into journal trades">
            Import history
          </Button>
          {lastImport !== null && (
            <span className="text-dense text-ev-up-text">
              {lastImport === 0 ? "nothing new" : `+${lastImport}`}
            </span>
          )}
          {tab === "feed" && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setDialogOpen(true)}>
                + Manual entry
              </Button>
              <Button variant="ghost" size="sm" onClick={exportCsv} title="Download all entries as CSV">
                Export CSV
              </Button>
            </>
          )}
          <IconButton label="Close journal" size="sm" onClick={onClose}>
            <X size={13} aria-hidden />
          </IconButton>
        </div>
      </header>

      {tab === "feed" && <JournalPropFirmBar drawdown={stats.maxDrawdown} />}

      {storageIssue && (
        <div
          role="status"
          className="flex items-center gap-2 rounded border border-ev-down/40 bg-ev-down/10 mx-3 mt-2 px-3 py-1.5 text-dense text-ev-down-text"
        >
          <span className="flex-1">Journal storage is full — recent screenshots and edits may not survive a restart.</span>
          <Button variant="ghost" size="sm" onClick={dismissStorageIssue}>
            Dismiss
          </Button>
        </div>
      )}

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
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShot(captureChart())}
                aria-pressed={shot !== null}
                title={shot ? "Chart attached — retake" : "Attach a chart screenshot"}
                className={shot ? "border-ev-accent" : "text-ev-muted"}
              >
                <Camera size={13} aria-hidden />
                {shot ? "Chart attached" : "Chart"}
              </Button>
              <Button size="sm" variant="solid" onClick={submit} disabled={!text.trim() && !shot} className="ml-auto">
                Add note
              </Button>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <nav className="flex h-7 shrink-0 items-center gap-2 border-b border-ev-raised px-3">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by symbol, tag or text"
                aria-label="Filter journal"
                className="w-64"
              />
              {/* Account-aware filter: chip per capture source, any = all. */}
              <div role="group" aria-label="Filter by account source" className="flex items-center gap-1">
                {SOURCES.map((opt) => (
                  <Button
                    key={opt}
                    size="sm"
                    variant={sourceFilter === opt ? "solid" : "ghost"}
                    aria-pressed={sourceFilter === opt}
                    title={`Show ${opt} entries`}
                    onClick={() => setSourceFilter(opt)}
                  >
                    {opt}
                  </Button>
                ))}
              </div>
              <span className={`${chip} text-ev-muted`}>{rows.length} items</span>
              <Button
                size="sm"
                variant="ghost"
                aria-pressed={bulkMode}
                title="Select multiple entries for bulk actions"
                onClick={() => {
                  setBulkMode((b) => !b);
                  setBulkIds([]);
                }}
                className={`ml-auto ${bulkMode ? "bg-ev-raised font-medium text-ev-strong" : ""}`}
              >
                Bulk edit
              </Button>
            </nav>

            {bulkMode && (
              <div className="flex h-8 shrink-0 items-center gap-2 border-b border-ev-raised bg-ev-panel/40 px-3 text-dense">
                <Checkbox label="All" checked={allTradesChecked} onChange={toggleAllTrades} />
                <span className="num text-ev-muted">{bulkIds.length} selected</span>
                <Input
                  value={bulkTag}
                  onChange={(e) => setBulkTag(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applyBulkTag()}
                  placeholder="Tag to add…"
                  aria-label="Bulk tag"
                  className="w-40"
                />
                <Button size="sm" variant="outline" onClick={applyBulkTag} disabled={bulkTag.trim() === "" || bulkIds.length === 0}>
                  Add tag
                </Button>
                <Button size="sm" variant="danger" onClick={deleteSelected} disabled={bulkIds.length === 0}>
                  Delete selected
                </Button>
              </div>
            )}

            {rows.length === 0 ? (
              <EmptyState
                title="Nothing here yet"
                body="Take a note on a trade, import closed trades from a broker export, or add a manual entry — the journal only learns from what you put in it."
                hint="The AI coach reads these entries; an empty journal gives it nothing to work with."
              />
            ) : (
              <VirtualList
                items={rows}
                itemKey={(row) => row.key}
                estimateSize={64}
                className="min-h-0 flex-1 overflow-auto"
                ariaLabel="Journal entries"
                renderItem={(row) => (
                  <div className="border-b border-ev-panel px-3 py-1.5 hover:bg-ev-panel/60">{row.node}</div>
                )}
              />
            )}
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

function TradeRow({
  entry,
  onDelete,
  bulk,
  checked,
  onCheck,
}: {
  entry: JournalEntry;
  onDelete: () => void;
  bulk: boolean;
  checked: boolean;
  onCheck: () => void;
}) {
  const pnl = entry.pnl;
  return (
    <div className="flex items-center gap-3 text-dense">
      {bulk && (
        <input type="checkbox" checked={checked} onChange={onCheck} aria-label={`Select trade ${entry.symbol}`} />
      )}
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
      <IconButton
        size="sm"
        label={`Delete trade ${entry.symbol}`}
        onClick={onDelete}
        className="ml-auto text-ev-faint"
      >
        <Trash2 size={12} aria-hidden />
      </IconButton>
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
      <IconButton
        size="sm"
        label="Delete note"
        onClick={onDelete}
        className="ml-auto text-ev-faint"
      >
        <Trash2 size={12} aria-hidden />
      </IconButton>
    </div>
  );
}
