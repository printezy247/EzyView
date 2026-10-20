import { useMemo } from "react";
import { computeStats } from "@ezyview/journal";
import type { JournalEntry } from "@ezyview/journal";

interface Props {
  entries: readonly JournalEntry[];
}

const money = (value: number): string =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Stats tab: headline cards, an equity polyline, the fixed 6-bucket R
 * histogram, and the setup / tag / session breakdowns — all straight from
 * `computeStats`, so the numbers always match the Feed header.
 */
export function JournalStatsView({ entries }: Props) {
  const stats = useMemo(() => computeStats(entries), [entries]);

  const avgR = stats.rMultiples.length > 0 ? stats.rMultiples.reduce((a, b) => a + b, 0) / stats.rMultiples.length : null;

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
      <div className="flex flex-wrap gap-2">
        <Card label="Net" value={money(stats.netPnl)} tone={stats.netPnl >= 0 ? "text-ev-up" : "text-ev-down"} />
        <Card label="Trades" value={String(stats.trades)} />
        <Card label="Win rate" value={stats.trades === 0 ? "—" : `${Math.round(stats.winRate * 100)}%`} />
        <Card label="Avg R" value={avgR === null ? "—" : `${avgR >= 0 ? "+" : ""}${avgR.toFixed(2)}R`} tone={avgR === null ? undefined : avgR >= 0 ? "text-ev-up" : "text-ev-down"} />
        <Card
          label="Profit factor"
          value={stats.trades === 0 ? "—" : Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : "∞"}
        />
        <Card label="Max DD" value={money(stats.maxDrawdown)} tone="text-ev-down" />
      </div>

      <section>
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ev-faint">Equity</h3>
        <EquityPolyline points={stats.equitySeries} />
      </section>

      <section>
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ev-faint">R distribution</h3>
        <RHistogram buckets={stats.rDistribution} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <BreakdownTable title="By setup" rows={stats.bySetup.map((r) => ({ label: r.setup, trades: r.trades, net: r.netPnl }))} />
        <BreakdownTable title="By tag" rows={stats.byTag.map((r) => ({ label: r.tag, trades: r.trades, net: r.netPnl }))} />
        <BreakdownTable
          title="By session"
          rows={stats.byTimeOfDay.map((r) => ({ label: r.period, trades: r.trades, net: r.netPnl }))}
        />
      </section>
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-28 rounded border border-ev-line bg-ev-panel px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-ev-faint">{label}</div>
      <div className={`mt-0.5 text-sm tabular-nums ${tone ?? "text-ev-strong"}`}>{value}</div>
    </div>
  );
}

/** Plain SVG polyline of cumulative net P&L; no charting library on purpose. */
function EquityPolyline({ points }: { points: readonly { time: number; equity: number }[] }) {
  if (points.length === 0) {
    return <p className="rounded border border-ev-line bg-ev-panel px-3 py-4 text-xs text-ev-faint">No closed trades yet.</p>;
  }

  const W = 480;
  const H = 120;
  const pad = 6;
  const equities = points.map((p) => p.equity);
  const min = Math.min(0, ...equities);
  const max = Math.max(0, ...equities);
  const span = max - min || 1;
  const x = (i: number): number => (points.length === 1 ? W / 2 : pad + (i / (points.length - 1)) * (W - 2 * pad));
  const y = (v: number): number => pad + ((max - v) / span) * (H - 2 * pad);
  const coords = points.map((p, i) => `${x(i).toFixed(2)},${y(p.equity).toFixed(2)}`).join(" ");
  const zeroY = y(0);
  const up = (points[points.length - 1]?.equity ?? 0) >= 0;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-30 w-full rounded border border-ev-line bg-ev-panel"
      role="img"
      aria-label={`Equity curve ending at ${money(points[points.length - 1]?.equity ?? 0)}`}
      preserveAspectRatio="none"
    >
      <line x1={pad} y1={zeroY} x2={W - pad} y2={zeroY} stroke="currentColor" className="text-ev-line" strokeWidth={1} />
      <polyline points={coords} fill="none" stroke="currentColor" className={up ? "text-ev-up" : "text-ev-down"} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Six fixed buckets from computeStats; losses red, wins green. */
function RHistogram({ buckets }: { buckets: readonly { label: string; count: number }[] }) {
  if (buckets.length === 0) {
    return <p className="rounded border border-ev-line bg-ev-panel px-3 py-4 text-xs text-ev-faint">No planned-risk trades yet — set planned risk on a closed trade to see R multiples.</p>;
  }
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <div className="flex h-32 items-end gap-2 rounded border border-ev-line bg-ev-panel px-3 pt-2 pb-1">
      {buckets.map((bucket, i) => (
        <div key={bucket.label} className="flex h-full flex-1 flex-col items-center gap-1">
          <span className="text-[10px] tabular-nums text-ev-muted">{bucket.count}</span>
          <div
            className={`w-full max-w-16 rounded-t ${i < 3 ? "bg-ev-down" : "bg-ev-up"} ${bucket.count === 0 ? "opacity-25" : "opacity-80"}`}
            style={{ height: `${Math.round((bucket.count / maxCount) * 100)}%`, minHeight: bucket.count === 0 ? 2 : 4 }}
          />
          <span className="text-[10px] tabular-nums text-ev-faint">{bucket.label}</span>
        </div>
      ))}
    </div>
  );
}

function BreakdownTable({ title, rows }: { title: string; rows: readonly { label: string; trades: number; net: number }[] }) {
  return (
    <div className="min-w-0">
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ev-faint">{title}</h3>
      {rows.length === 0 ? (
        <p className="rounded border border-ev-line bg-ev-panel px-3 py-3 text-xs text-ev-faint">Nothing to break down yet.</p>
      ) : (
        <table className="w-full rounded border border-ev-line bg-ev-panel text-xs">
          <thead>
            <tr className="border-b border-ev-line text-left text-[10px] uppercase tracking-wider text-ev-faint">
              <th className="px-2 py-1 font-medium">Label</th>
              <th className="px-2 py-1 text-right font-medium">Trades</th>
              <th className="px-2 py-1 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-ev-panel last:border-0">
                <td className="max-w-32 truncate px-2 py-1 text-ev-text">{row.label}</td>
                <td className="px-2 py-1 text-right tabular-nums text-ev-muted">{row.trades}</td>
                <td className={`px-2 py-1 text-right tabular-nums ${row.net >= 0 ? "text-ev-up" : "text-ev-down"}`}>
                  {row.net >= 0 ? "+" : ""}
                  {money(row.net)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
