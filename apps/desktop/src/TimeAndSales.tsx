import { useEffect } from "react";
import { useNavigate } from "react-router";
import { activeChartOf } from "./layout";
import { market, precisionFor } from "./data";
import { useTape } from "./tapeStore";
import { useWorkspace } from "./store";
import { Button, IconButton } from "./ui";
import { Trash2 } from "lucide-react";

const when = (ts: number): string =>
  new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/**
 * Time & Sales: the live tape for the active symbol, newest print at the top.
 *
 * The feed is the same quote poll the watchlist and paper engine use, so each
 * print is a quote rather than an exchange trade — which is exactly what this
 * panel says it is, instead of pretending to a granularity the data lacks.
 */
export function TimeAndSales() {
  const navigate = useNavigate();
  const layout = useWorkspace((s) => s.activeLayout());
  const state = activeChartOf(layout);
  const symbol = state.symbol;
  const entries = useTape((s) => s.tapes[symbol] ?? []);
  const push = useTape((s) => s.push);
  const clear = useTape((s) => s.clear);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      void market.getQuote(symbol).then((q) => {
        if (!cancelled && q) push(symbol, q.last, q.volume24h ?? 0);
      });
    };
    tick();
    const t = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [symbol, push]);

  // Buy/sell imbalance over the visible window, which is the one number a tape
  // is read for at a glance.
  const buys = entries.filter((e) => e.side === "buy").length;
  const sells = entries.length - buys;
  const buyPct = entries.length === 0 ? 50 : Math.round((buys / entries.length) * 100);
  const digits = entries[0] ? precisionFor(entries[0].price) : 2;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-ev-raised px-2 py-1.5">
        <span className="text-dense font-medium text-ev-strong">{symbol}</span>
        <span className="text-dense text-ev-faint">{entries.length} prints</span>
        <span className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => navigate("/chart")} title="Open the chart">
            Chart
          </Button>
          <IconButton label="Clear the tape" size="sm" variant="ghost" onClick={() => clear(symbol)}>
            <Trash2 size={13} aria-hidden />
          </IconButton>
        </span>
      </div>

      {entries.length > 0 && (
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
        {entries.length === 0 ? (
          <p className="px-3 py-6 text-base leading-relaxed text-ev-faint">
            Waiting for prints on {symbol}. Each quote tick becomes one line here.
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
                <tr key={e.id} className="ev-row border-b border-ev-panel">
                  <td className="px-2 text-micro text-ev-faint">{when(e.ts)}</td>
                  <td className={`num px-2 text-right font-medium ${e.side === "buy" ? "text-ev-up" : "text-ev-down"}`}>
                    {e.price.toFixed(digits)}
                  </td>
                  <td className="num px-2 text-right text-ev-muted">{e.size.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
