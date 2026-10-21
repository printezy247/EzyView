import { useMemo } from "react";
import { getActiveExportSource } from "./exportBridge";
import { saveChartCsv } from "./exportUi";
import { Modal } from "./Modal";
import { tableRows } from "./barsTable";
import { precisionFor } from "./data";

/** The visible bars as a table (TradingView's "Table view"); newest first, capped. */
export function BarsTable({ onClose }: { onClose: () => void }) {
  const source = getActiveExportSource();
  const bars = useMemo(() => source?.getCandles() ?? [], [source]);
  const rows = useMemo(() => tableRows(bars, precisionFor(bars.at(-1)?.close ?? null)), [bars]);
  const meta = source?.meta();

  return (
    <Modal
      onClose={onClose}
      labelledBy="bars-table-title"
      className="flex max-h-[80vh] w-[min(640px,92vw)] flex-col rounded-lg border border-ev-line bg-ev-panel shadow-2xl"
    >
      <div className="flex items-center gap-2 border-b border-ev-raised px-4 py-3">
        <h2 id="bars-table-title" className="text-sm font-semibold text-ev-strong">
          Table view{meta ? ` — ${meta.symbol} ${meta.resolution}` : ""}
        </h2>
        <span className="text-[11px] text-ev-muted">{rows.length} bars, newest first (UTC)</span>
        <button
          type="button"
          disabled={!source}
          onClick={() => source && saveChartCsv(source)}
          className="ml-auto rounded bg-ev-line px-2 py-1 text-[11px] text-ev-strong hover:bg-ev-line-strong disabled:opacity-40"
        >
          Export CSV
        </button>
        <button type="button" onClick={onClose} className="rounded px-2 py-1 text-[11px] text-ev-muted hover:text-ev-strong">
          Close
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-right text-[11px] tabular-nums">
          <thead className="sticky top-0 bg-ev-panel text-ev-muted">
            <tr>
              {["Time", "Open", "High", "Low", "Close", "Volume"].map((h, i) => (
                <th key={h} scope="col" className={`px-3 py-1.5 font-medium ${i === 0 ? "text-left" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-ev-text">
            {rows.map((r) => (
              <tr key={r.time} className="border-t border-ev-raised/50">
                <td className="px-3 py-1 text-left text-ev-muted">{r.time}</td>
                <td className="px-3 py-1">{r.open}</td>
                <td className="px-3 py-1">{r.high}</td>
                <td className="px-3 py-1">{r.low}</td>
                <td className="px-3 py-1 text-ev-strong">{r.close}</td>
                <td className="px-3 py-1">{r.volume}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-ev-muted">
                  No bars loaded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
