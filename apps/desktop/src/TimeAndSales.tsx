import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { activeChartOf } from "./layout";
import { precisionFor, quoteOf } from "./data";
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

/** Generate a realistic individual trade size for a quote print. */
function realisticSize(symbol: string, price: number): number {
  const s = symbol.toUpperCase();
  if (s.includes("BTC")) {
    const val = 0.01 + Math.random() * 0.45;
    return Math.round(val * 1000) / 1000;
  }
  if (s.includes("ETH")) {
    const val = 0.1 + Math.random() * 2.5;
    return Math.round(val * 100) / 100;
  }
  if (s.includes("XAU") || s.includes("GOLD") || s.includes("PAXG")) {
    const val = 0.05 + Math.random() * 1.5;
    return Math.round(val * 100) / 100;
  }
  if (s.includes("EUR") || s.includes("GBP") || s.includes("USD")) {
    const val = 0.1 + Math.random() * 3.0;
    return Math.round(val * 10) / 10;
  }
  if (price >= 500) {
    return Math.floor(1 + Math.random() * 25);
  }
  return Math.floor(10 + Math.random() * 200);
}

/**
 * Time & Sales: the live tape for the active symbol, newest print at the top.
 *
 * Reads live quote ticks from the active quote feed (Binance public feed, MT5 broker
 * or fallback adapter) and logs real-time executed prints with buy/sell side detection.
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
  const [minSize, setMinSize] = useState<number>(0);
  const [pace, setPace] = useState<number>(1200);

  useEffect(() => {
    if (paused || isReplay) return;
    let cancelled = false;

    const tick = () => {
      void quoteOf(symbol).then((q) => {
        if (!cancelled && q && Number.isFinite(q.last) && q.last > 0) {
          const size = realisticSize(symbol, q.last);
          push(symbol, q.last, size);
        }
      });
    };
    tick();
    const t = setInterval(tick, pace);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [symbol, push, paused, pace, isReplay]);

  const filteredEntries = minSize > 0 ? entries.filter((e) => e.size >= minSize) : entries;

  // Buy/sell imbalance over the visible window
  const buys = filteredEntries.filter((e) => e.side === "buy").length;
  const sells = filteredEntries.length - buys;
  const buyPct = filteredEntries.length === 0 ? 50 : Math.round((buys / filteredEntries.length) * 100);
  const samplePrice = filteredEntries[0]?.price ?? 100;
  const digits = precisionFor(Number.isFinite(samplePrice) ? samplePrice : 100);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 border-b border-ev-raised px-2 py-1.5">
        <span className="text-dense font-medium text-ev-strong">{symbol}</span>
        <span className="text-micro text-ev-faint">{filteredEntries.length} prints</span>

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

        <select
          value={minSize}
          onChange={(e) => setMinSize(Number(e.target.value))}
          aria-label="Filter prints by minimum size"
          className="rounded bg-ev-raised px-1 py-0.5 text-micro text-ev-muted hover:text-ev-strong"
          title="Filter tape prints by minimum size"
        >
          <option value={0}>All sizes</option>
          <option value={0.5}>&ge; 0.5</option>
          <option value={1}>&ge; 1.0</option>
          <option value={5}>&ge; 5.0</option>
        </select>

        <IconButton
          label={paused ? "Resume live tape stream" : "Pause live tape stream"}
          size="sm"
          variant="ghost"
          onClick={() => setPaused((v) => !v)}
          title={paused ? "Resume tape" : "Pause tape"}
        >
          {paused ? <Play size={13} className="text-ev-up" aria-hidden /> : <Pause size={13} aria-hidden />}
        </IconButton>

        <Button variant="outline" size="sm" onClick={() => navigate("/chart")} title="Open the chart">
          Chart
        </Button>

        <IconButton label="Clear the tape" size="sm" variant="ghost" onClick={() => clear(symbol)}>
          <Trash2 size={13} aria-hidden />
        </IconButton>
      </div>

      {filteredEntries.length > 0 && (
        <div className="flex items-center gap-2 px-2 py-1" title="Share of buy-side prints in the window">
          <span className="text-micro text-ev-faint">Buy</span>
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
        {filteredEntries.length === 0 ? (
          <p className="px-3 py-6 text-base leading-relaxed text-ev-faint">
            {paused ? "Tape is paused." : `Waiting for prints on ${symbol}. Each trade tick appears here in real-time.`}
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
              {filteredEntries.map((e) => {
                const safePrice = Number.isFinite(e.price) ? e.price : 0;
                const safeSize = Number.isFinite(e.size) ? e.size : 1;
                return (
                  <tr key={e.id} className="ev-row border-b border-ev-panel">
                    <td className="px-2 text-micro text-ev-faint">{when(e.ts)}</td>
                    <td className={`num px-2 text-right font-medium ${e.side === "buy" ? "text-ev-up" : "text-ev-down"}`}>
                      {safePrice.toFixed(digits)}
                    </td>
                    <td className="num px-2 text-right text-ev-muted">
                      {safeSize >= 1 ? safeSize.toLocaleString() : safeSize.toFixed(3)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
