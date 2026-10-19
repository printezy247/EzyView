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

  const chip = "rounded border border-[#2a2e39] px-2 py-0.5 tabular-nums";

  return (
    <section className="flex h-56 shrink-0 flex-col border-t border-[#1e222d] bg-[#0e1117]">
      <header className="flex h-8 shrink-0 items-center gap-3 border-b border-[#1e222d] px-3 text-[11px]">
        <span className="font-semibold uppercase tracking-wider text-[#787b86]">Journal</span>

        <dl className="flex items-center gap-3 tabular-nums">
          <Fact label="Net" value={money(stats.netPnl)} tone={stats.netPnl >= 0 ? "text-[#26a69a]" : "text-[#ef5350]"} />
          <Fact label="Trades" value={String(stats.trades)} />
          <Fact label="Win rate" value={stats.trades === 0 ? "—" : `${Math.round(stats.winRate * 100)}%`} />
          <Fact
            label="Profit factor"
            value={stats.trades === 0 ? "—" : Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : "∞"}
          />
          <Fact label="Expectancy" value={stats.trades === 0 ? "—" : money(stats.expectancy)} />
          <Fact label="Max DD" value={money(stats.maxDrawdown)} tone="text-[#ef5350]" />
        </dl>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={importNow}
            title="Turn closed deals into journal trades"
            className="rounded px-2 py-0.5 text-[11px] text-[#787b86] hover:bg-[#1e222d] hover:text-white"
          >
            Import history
          </button>
          {lastImport !== null && (
            <span className="text-[10px] text-[#26a69a]">
              {lastImport === 0 ? "nothing new" : `+${lastImport}`}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close journal"
            className="flex size-5 items-center justify-center rounded text-[#787b86] hover:bg-[#1e222d] hover:text-white"
          >
            <X size={13} aria-hidden />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-72 shrink-0 flex-col gap-2 border-r border-[#1e222d] p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            placeholder="What did you see? Plan, execution, feeling…"
            aria-label="Journal note"
            className="min-h-0 flex-1 resize-none rounded border border-[#2a2e39] bg-[#131722] p-2 text-xs text-[#d1d4dc] focus:border-[#2962ff]"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShot(captureChart())}
              className={`flex items-center gap-1 rounded border px-2 py-1 text-[11px] hover:text-white ${
                shot ? "border-[#2962ff] text-white" : "border-[#2a2e39] text-[#787b86]"
              }`}
            >
              <Camera size={13} aria-hidden />
              {shot ? "Chart attached" : "Chart"}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!text.trim() && !shot}
              className="ml-auto rounded bg-[#2962ff] px-3 py-1 text-[11px] font-medium text-white hover:bg-[#1e53e5] disabled:opacity-40"
            >
              Add note
            </button>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <nav className="flex h-7 shrink-0 items-center gap-2 border-b border-[#1e222d] px-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by symbol, tag or text"
              aria-label="Filter journal"
              className="w-64 rounded border border-[#2a2e39] bg-[#131722] px-2 py-0.5 text-[11px] text-[#d1d4dc] focus:border-[#2962ff]"
            />
            <span className={`${chip} text-[#787b86]`}>{rows.length} items</span>
          </nav>

          <div className="min-h-0 flex-1 overflow-auto">
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-xs text-[#434651]">
                Nothing here yet — take a note, or import your closed trades from history.
              </p>
            ) : (
              <ul>
                {rows.map((row) => (
                  <li key={row.key} className="border-b border-[#131722] px-3 py-1.5 hover:bg-[#131722]/60">
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
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-8"
          aria-label="Dismiss screenshot"
        >
          <img src={preview} alt="Chart screenshot" className="max-h-full max-w-full rounded border border-[#2a2e39]" />
        </button>
      )}
    </section>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="text-[#434651]">{label}</dt>
      <dd className={tone ?? "text-[#d1d4dc]"}>{value}</dd>
    </div>
  );
}

function TradeRow({ entry, onDelete }: { entry: JournalEntry; onDelete: () => void }) {
  const pnl = entry.pnl;
  return (
    <div className="flex items-center gap-3 text-[11px]">
      <span className="w-32 shrink-0 text-[#787b86]">{clock(entry.exitTime ?? entry.entryTime)}</span>
      <span className="w-20 shrink-0 font-medium text-white">{entry.symbol}</span>
      <span className={entry.side === "long" ? "w-12 text-[#26a69a]" : "w-12 text-[#ef5350]"}>
        {entry.side.toUpperCase()}
      </span>
      <span className="w-16 shrink-0 tabular-nums text-[#d1d4dc]">{entry.qty}</span>
      <span className="w-40 shrink-0 tabular-nums text-[#787b86]">
        {entry.entryPrice}
        {entry.exitPrice !== undefined ? ` → ${entry.exitPrice}` : ""}
      </span>
      {pnl === undefined ? (
        <span className="rounded border border-[#434651] px-1.5 py-0.5 text-[10px] text-[#787b86]">open</span>
      ) : (
        <span className={`tabular-nums ${pnl >= 0 ? "text-[#26a69a]" : "text-[#ef5350]"}`}>
          {pnl >= 0 ? "+" : ""}
          {money(pnl)}
        </span>
      )}
      {entry.source && <span className="rounded bg-[#1e222d] px-1.5 py-0.5 text-[10px] text-[#787b86]">{entry.source}</span>}
      <button
        type="button"
        aria-label={`Delete trade ${entry.symbol}`}
        onClick={onDelete}
        className="ml-auto flex size-5 items-center justify-center rounded text-[#434651] hover:bg-[#1e222d] hover:text-[#ef5350]"
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
      <span className="w-32 shrink-0 text-[#787b86]">{clock(note.time)}</span>
      <span className="text-[#d1d4dc]">
        {note.text || <span className="italic text-[#434651]">(screenshot only)</span>}
      </span>
      {note.screenshots?.map((url) => (
        <button
          key={url.slice(-24)}
          type="button"
          onClick={() => onPreview(url)}
          title="View chart screenshot"
          className="ml-1 h-6 w-10 overflow-hidden rounded border border-[#2a2e39] hover:border-[#2962ff]"
        >
          <img src={url} alt="Chart thumbnail" className="h-full w-full object-cover" />
        </button>
      ))}
      <button
        type="button"
        aria-label="Delete note"
        onClick={onDelete}
        className="ml-auto flex size-5 items-center justify-center rounded text-[#434651] hover:bg-[#1e222d] hover:text-[#ef5350]"
      >
        <Trash2 size={12} aria-hidden />
      </button>
    </div>
  );
}
