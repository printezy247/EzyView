import { useMemo } from "react";
import { getActiveExportSource } from "./exportBridge";
import { saveChartCsv } from "./exportUi";
import { tableRows } from "./barsTable";
import { precisionFor } from "./data";
import { Button, Dialog } from "./ui";

/** The visible bars as a table (TradingView's "Table view"); newest first, capped. */
export function BarsTable({ onClose }: { onClose: () => void }) {
  const source = getActiveExportSource();
  const bars = useMemo(() => source?.getCandles() ?? [], [source]);
  const rows = useMemo(() => tableRows(bars, precisionFor(bars.at(-1)?.close ?? null)), [bars]);
  const meta = source?.meta();

  return (
    <Dialog
      onClose={onClose}
      title={`Table view${meta ? ` — ${meta.symbol} ${meta.resolution}` : ""}`}
      description={`${rows.length} bars, newest first (UTC)`}
      size="lg"
      actions={
        <>
          <Button variant="outline" size="md" disabled={!source} onClick={() => source && saveChartCsv(source)}>
            Export CSV
          </Button>
          <Button variant="ghost" size="md" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-right text-dense num">
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
    </Dialog>
  );
}
