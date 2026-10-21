import { useEffect, useState } from "react";
import type { Resolution } from "@ezyview/data-adapters";
import { ChartHost } from "./ChartHost";
import { publishCrosshair, subscribeCrosshair } from "./crosshairBus";
import { PICKER_RESOLUTIONS, tickerOf } from "./data";

interface Props {
  symbol: string;
  resolution: Resolution;
}

/** A single chart for a secondary window. It has no workspace of its own: pick an interval, nothing persists. */
export function DetachedChart({ symbol, resolution: initial }: Props) {
  const [resolution, setResolution] = useState<Resolution>(initial);
  // Mirror the main window's pointer when it is on this symbol; publish ours back.
  const [remote, setRemote] = useState<{ time: number; price: number } | null>(null);
  useEffect(
    () =>
      subscribeCrosshair((m) => {
        if (m.symbol !== symbol) return;
        setRemote(m.time === null || m.price === null ? null : { time: m.time, price: m.price });
      }),
    [symbol],
  );
  document.title = `${tickerOf(symbol)} · EzyView`;

  return (
    <div className="flex h-full flex-col bg-ev-bg text-ev-text">
      <header className="flex h-9 shrink-0 items-center gap-3 border-b border-ev-raised px-3 text-xs">
        <span className="font-medium text-ev-strong">{symbol}</span>
        <div role="group" aria-label="Interval" className="flex rounded border border-ev-line">
          {PICKER_RESOLUTIONS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={r === resolution}
              onClick={() => setResolution(r)}
              className={r === resolution ? "bg-ev-raised px-2 py-1 font-medium text-ev-strong" : "px-2 py-1 text-ev-muted hover:text-ev-strong"}
            >
              {r}
            </button>
          ))}
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        <ChartHost
          symbol={symbol}
          resolution={resolution}
          chartType="candles"
          showVolume
          showGrid
          theme="dark"
          indicators={[]}
          drawings={[]}
          syncCrosshair={remote}
          onCrosshairMove={(t, p) => publishCrosshair(symbol, t, p)}
        />
      </div>
    </div>
  );
}
