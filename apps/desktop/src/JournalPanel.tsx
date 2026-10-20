import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Camera, Trash2, X } from "lucide-react";
import { computeStats } from "@ezyview/journal";
import type { JournalEntry, JournalNote } from "@ezyview/journal";
import { captureChart, useJournal } from "./journal";
import { useMt5 } from "./mt5";
import { useTrading } from "./trading";

interface Props {
  onClose: () => void;
}

interface Row {
  key: string;
  time: number;
  node: ReactNode;
}

const clock = (epoch: number): string => new Date(epoch * 1000).toLocaleString(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const money = (value: number): string =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * The daily driver: what you traded, what you thought, what it scored.
 *
 * Trade rows come from deal history (paper or broker), notes from the user,
 * and both live in the same time-ordered feed so a note can sit next to the
 * trade it was written for.
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

  const [text, setText] = useState("");
  const [shot, setShot] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [lastImport, setLastImport] = useState<number | null>(null);

  const stats = useMemo(() => computeStats(entries), [entries]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = (haystacks: (string | undefined)[]): boolean =>
      !needle || haystacks.some((value) => (value ?? "").toLowerCase().includes(needle));

    const tradeRows: Row[] = entries
      .filter((entry) => matches([entry.symbol, entry.setup, entry.notes, ...(entry.tags ?? [])]))
      .map((entry) => ({ key: `t:${entry.id}`, time: entry.exitTime ?? entry.entryTime, node: <TradeRow entry={entry} onDelete={() => removeEntry(entry.id)} /> }));

    const noteRows: Row[] = notes
      .filter((note) => matches([note.symbol, note.text, ...(note.tags ?? [])]))
      .map((note) => ({
        key: `n:${note.id}`,
        time: note.time,
        node: <NoteRow note={note} onDelete={() => removeNote(note.id)} onPreview={setPreview} />,
      }));

    return [...tradeRows, ...noteRows].toSorted((a, b) => b.time - a.time);
  }, [entries, notes, query, removeEntry, removeNote]);

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

  const chip = "rounded border border-ev-line px-2 py-0.5 tabular-nums";

  return (
    <section aria-label="Trading journal" className="flex min-h-0 flex-1 flex-col border-t border-ev-raised bg-ev-bg">
      <header className="flex h-8 shrink-0 items-center gap-3 border-b border-ev-raised px-3 text-[11px]">
        <span className="font-semibold uppercase tracking-wider text-ev-muted">Journal</span>

        <dl className="flex items-center gap-3 tabular-nums">
          <Fact label="Net" value={money(stats.netPnl)} tone={stats.netPnl >= 0 ? "text-ev-up" : "text-ev-down"} />
          <Fact label="Trades" value={String(stats.trades)} />
          <Fact label="Win rate" value={stats.trades === 0 ? "—" : `${Math.round(stats.winRate * 100)}%`} />
          <Fact
            label="Profit factor"
            value={stats.trades === 0 ? "—" : Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : "∞"}
          />
          <Fact label="Expectancy" value={stats.trades === 0 ? "—" : money(stats.expectancy)} />
          <Fact label="Max DD" value={money(stats.maxDrawdown)} tone="text-ev-down" />
        </dl>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={importNow}
            title="Turn closed deals into journal trades"
            className="rounded px-2 py-0.5 text-[11px] text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
          >
            Import history
          </button>
          {lastImport !== null && (
            <span className="text-[11px] text-ev-up">
              {lastImport === 0 ? "nothing new" : `+${lastImport}`}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close journal"
            className="flex size-5 items-center justify-center rounded text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
          >
            <X size={13} aria-hidden />
          </button>
        </div>
      </header>

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
            className="min-h-0 flex-1 resize-none rounded border border-ev-line bg-ev-panel p-2 text-xs text-ev-text focus:border-ev-accent"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShot(captureChart())}
              className={`flex items-center gap-1 rounded border px-2 py-1 text-[11px] hover:text-ev-strong ${
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
              className="ml-auto rounded bg-ev-accent px-3 py-1 text-[11px] font-medium text-white hover:bg-ev-accent-hover disabled:opacity-40"
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
              className="w-64 rounded border border-ev-line bg-ev-panel px-2 py-0.5 text-[11px] text-ev-text focus:border-ev-accent"
            />
            <span className={`${chip} text-ev-muted`}>{rows.length} items</span>
          </nav>

          <div className="min-h-0 flex-1 overflow-auto">
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-xs text-ev-faint">
                Nothing here yet — take a note, or import your closed trades from history.
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
    <div className="flex items-center gap-3 text-[11px]">
      <span className="w-32 shrink-0 text-ev-muted">{clock(entry.exitTime ?? entry.entryTime)}</span>
      <span className="w-20 shrink-0 font-medium text-ev-strong">{entry.symbol}</span>
      <span className={entry.side === "long" ? "w-12 text-ev-up" : "w-12 text-ev-down"}>
        {entry.side.toUpperCase()}
      </span>
      <span className="w-16 shrink-0 tabular-nums text-ev-text">{entry.qty}</span>
      <span className="w-40 shrink-0 tabular-nums text-ev-muted">
        {entry.entryPrice}
        {entry.exitPrice !== undefined ? ` → ${entry.exitPrice}` : ""}
      </span>
      {pnl === undefined ? (
        <span className="rounded border border-ev-dim px-1.5 py-0.5 text-[11px] text-ev-muted">open</span>
      ) : (
        <span className={`tabular-nums ${pnl >= 0 ? "text-ev-up" : "text-ev-down"}`}>
          {pnl >= 0 ? "+" : ""}
          {money(pnl)}
        </span>
      )}
      {entry.source && <span className="rounded bg-ev-raised px-1.5 py-0.5 text-[11px] text-ev-muted">{entry.source}</span>}
      <button
        type="button"
        aria-label={`Delete trade ${entry.symbol}`}
        onClick={onDelete}
        className="ml-auto flex size-5 items-center justify-center rounded text-ev-faint hover:bg-ev-raised hover:text-ev-down"
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
    <div className="flex items-center gap-3 text-[11px]">
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
        className="ml-auto flex size-5 items-center justify-center rounded text-ev-faint hover:bg-ev-raised hover:text-ev-down"
      >
        <Trash2 size={12} aria-hidden />
      </button>
    </div>
  );
}
