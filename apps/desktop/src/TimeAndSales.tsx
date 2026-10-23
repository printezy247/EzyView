import { memo, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { activeChartOf } from "./layout";
import { precisionForSymbol } from "./pricePrecision";
import { useQuote } from "./quotePoller";
import { useTape, EMPTY_TAPE } from "./tapeStore";
import { useWorkspace } from "./store";
import { Button, IconButton } from "./ui";
import { Pause, Play, Trash2 } from "lucide-react";

const when = (ts: number): string => {
  const d = new Date(ts || Date.now());
  return Number.isNaN(d.getTime())
    ? "--:--:--"
    : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

/** One print. Memoised so a new print does not re-render the whole table. */
const TapeRow = memo(function TapeRow({
  ts,
  price,
  size,
  side,
  digits,
}: {
  ts: number;
  price: number;
  size: number;
  side: string;
  digits: number;
}) {
  const safePrice = Number.isFinite(price) ? price : 0;
  const safeSize = Number.isFinite(size) ? size : 0;
  return (
    <tr className="ev-row border-b border-ev-panel">
      <td className="px-2 text-micro text-ev-faint">{when(ts)}</td>
      <td className={`num px-2 text-right font-medium ${side === "buy" ? "text-ev-up-text" : "text-ev-down-text"}`}>
        {safePrice.toFixed(digits)}
      </td>
      <td className="num px-2 text-right text-ev-muted">
        {safeSize > 0 ? (safeSize >= 1 ? safeSize.toLocaleString() : safeSize.toFixed(3)) : "—"}
      </td>
    </tr>
  );
});

/**
 * Time & Sales: the live tape for the active symbol, newest tick at the top.
 *
 * The app's feeds expose quotes, not an exchange trade tape, so these rows are
 * quote ticks: direction is inferred from the price change and the size is
 * unknown. No trade size is invented here.
 */
export function TimeAndSales() {
  const navigate = useNavigate();
  const layout = useWorkspace((s) => s.activeLayout());
  const state = activeChartOf(layout);
  const symbol = state.symbol;
  const isReplay = useWorkspace((s) => s.replayBar !== null);
  const entries = useTape((s) => s.tapes[symbol] ?? EMPTY_TAPE);
  const push = useTape((s) => s.push);
  const clear = useTape((s) => s.clear);
  const [paused, setPaused] = useState(false);
  const [pace, setPace] = useState<number>(1200);

  const { quote } = useQuote(symbol, { intervalMs: pace, enabled: !paused && !isReplay });
  useEffect(() => {
    // 0 means "the feed did not report a size", never a made-up number.
    if (quote && Number.isFinite(quote.last) && quote.last > 0) push(symbol, quote.last, 0);
  }, [quote, push, symbol]);

  // Upticks vs downticks over the visible window.
  const buys = entries.filter((e) => e.side === "buy").length;
  const sells = entries.length - buys;
  const buyPct = entries.length === 0 ? 50 : Math.round((buys / entries.length) * 100);
  const samplePrice = entries[0]?.price ?? 100;
  const digits = precisionForSymbol(symbol, Number.isFinite(samplePrice) ? samplePrice : 100);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 border-b border-ev-raised px-2 py-1.5">
        <span className="text-dense font-medium text-ev-strong">{symbol}</span>
        <span className="text-micro text-ev-faint">{entries.length} ticks</span>

        <select
          value={pace}
          onChange={(e) => setPace(Number(e.target.value))}
          aria-label="Tape stream speed"
          className="ml-auto rounded bg-ev-raised px-1 py-0.5 text-micro text-ev-muted hover:text-ev-strong"
          title="Tape tick speed"
        >
          <option value={400}>Fast (400ms)</option>
          <option value={1200}>Normal (1.2s)</option>
          <option value={3000}>Slow (3s)</option>
        </select>

        <IconButton
          label={paused ? "Resume live tape stream" : "Pause live tape stream"}
          size="sm"
          variant="ghost"
          onClick={() => setPaused((v) => !v)}
          title={paused ? "Resume tape" : "Pause tape"}
        >
          {paused ? <Play size={13} className="text-ev-up-text" aria-hidden /> : <Pause size={13} aria-hidden />}
        </IconButton>

        <Button variant="outline" size="sm" onClick={() => navigate("/chart")} title="Open the chart">
          Chart
        </Button>

        <IconButton label="Clear the tape" size="sm" variant="ghost" onClick={() => clear(symbol)}>
          <Trash2 size={13} aria-hidden />
        </IconButton>
      </div>

      <p className="px-2 pb-1 text-micro text-ev-faint">
        Quote ticks, not exchange prints — this feed does not report trade sizes.
      </p>

      {entries.length > 0 && (
        <div className="flex items-center gap-2 px-2 py-1" title="Share of upticks in the window">
          <span className="text-micro text-ev-faint">Up</span>
          <div className="flex h-1.5 flex-1 overflow-hidden rounded bg-ev-raised">
            <div className="bg-ev-up" style={{ width: `${buyPct}%` }} />
            <div className="bg-ev-down" style={{ width: `${100 - buyPct}%` }} />
          </div>
          <span className="num text-micro text-ev-muted">
            {buys}/{sells}
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <p className="px-3 py-6 text-base leading-relaxed text-ev-faint">
            {paused ? "Tape is paused." : `Waiting for quote ticks on ${symbol}.`}
          </p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 bg-ev-bg">
              <tr className="border-b border-ev-line text-micro font-semibold uppercase tracking-wider text-ev-faint">
                <th scope="col" className="px-2 py-1">Time</th>
                <th scope="col" className="px-2 py-1 text-right">Price</th>
                <th scope="col" className="px-2 py-1 text-right">Size</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <TapeRow
                  key={e.id}
                  ts={e.ts}
                  price={e.price}
                  size={e.size}
                  side={e.side}
                  digits={digits}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
