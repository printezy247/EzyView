/**
 * Inline equity polyline of per-bar cash (the JournalStatsView approach,
 * smaller). Green when the curve ends flat-or-up vs its start, red otherwise.
 * Single-point and flat arrays stay inside the viewBox — no divide-by-zero.
 */
export function EquityCurve({ equity }: { equity: readonly number[] }) {
  if (equity.length === 0) return null;
  const W = 100;
  const H = 40;
  const min = Math.min(...equity);
  const max = Math.max(...equity);
  const span = max - min || 1; // flat curve: pin to the mid-line
  const x = (i: number): number => (equity.length === 1 ? W / 2 : (i / (equity.length - 1)) * W);
  const y = (v: number): number => ((max - v) / span) * H;
  const coords =
    equity.length === 1
      ? `${x(0).toFixed(2)},${y(equity[0]!).toFixed(2)}`
      : equity.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const first = equity[0]!;
  const last = equity[equity.length - 1]!;
  const isUp = last >= first;
  const color = isUp ? "var(--ev-up)" : "var(--ev-down)";
  const areaCoords = `${coords} ${W},${H} 0,${H}`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mb-1.5 h-12 w-full overflow-hidden rounded border border-ev-line/40 bg-ev-panel/50"
      role="img"
      aria-label={`Equity curve ending at ${last.toFixed(2)}`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0.0} />
        </linearGradient>
      </defs>
      {equity.length > 1 && <polygon points={areaCoords} fill="url(#equityGrad)" />}
      {equity.length === 1 ? (
        // A lone point has no length; a short segment keeps it visible.
        <line
          x1={x(0) - 2}
          y1={y(last)}
          x2={x(0) + 2}
          y2={y(last)}
          stroke={color}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <polyline
          points={coords}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

export function Metric({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  const color = tone === "pos" ? "text-ev-up-text" : tone === "neg" ? "text-ev-down-text" : "text-ev-strong";
  return (
    <span className="flex items-center gap-1">
      <span className="text-ev-faint">{label}</span>
      <span className={`font-medium ${color}`}>{value}</span>
    </span>
  );
}

