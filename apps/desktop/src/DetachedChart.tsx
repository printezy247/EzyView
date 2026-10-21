import { useEffect, useState } from "react";
import type { Resolution } from "@ezyview/data-adapters";
import { ChartHost } from "./ChartHost";
import { publishCrosshair, subscribeCrosshair } from "./crosshairBus";
import { PICKER_RESOLUTIONS, tickerOf } from "./data";
import { useWorkspace } from "./store";

interface Props {
  symbol: string;
  resolution: Resolution;
}

/** A single chart for a secondary window. Syncs theme and matching chart layers from the workspace. */
export function DetachedChart({ symbol, resolution: initial }: Props) {
  const [resolution, setResolution] = useState<Resolution>(initial);
  const layout = useWorkspace((s) => s.activeLayout());
  const appTheme = useWorkspace((s) => s.appTheme);
  const matchingChart = layout.charts.find((c) => c.symbol === symbol) ?? layout.charts[0];
  const chartTheme = appTheme === "auto" ? (matchingChart?.theme ?? "dark") : appTheme;
  // Mirror the main window's pointer when it is on this symbol; publish ours back.
  // Publish only while the pointer is really on this chart (a mirrored crosshair
  // fires move events too, and echoing them would loop between windows), and
  // never mirror over the user's own crosshair.
  const [hovering, setHovering] = useState(false);
  const [remote, setRemote] = useState<{ time: number; price: number } | null>(null);
  useEffect(() => {
    document.documentElement.dataset.theme = chartTheme;
  }, [chartTheme]);
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
      <header className="flex h-9 shrink-0 items-center gap-3 border-b border-ev-raised px-3 text-base">
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
      <div
        className="relative min-h-0 flex-1"
        onPointerEnter={() => setHovering(true)}
        onPointerLeave={() => {
          setHovering(false);
          publishCrosshair(symbol, null, null);
        }}
      >
        <ChartHost
          symbol={symbol}
          resolution={resolution}
          chartType={matchingChart?.chartType ?? "candles"}
          showVolume={matchingChart?.showVolume ?? true}
          showGrid={matchingChart?.showGrid ?? true}
          theme={chartTheme}
          indicators={matchingChart?.indicators ?? []}
          drawings={matchingChart?.symbol === symbol ? matchingChart.drawings : []}
          syncCrosshair={hovering ? null : remote}
          onCrosshairMove={(t, p) => {
            if (hovering) publishCrosshair(symbol, t, p);
          }}
        />
      </div>
    </div>
  );
}
