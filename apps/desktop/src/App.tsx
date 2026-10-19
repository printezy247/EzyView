import { useCallback, useEffect, useState } from "react";
import { ChartHost } from "./ChartHost";
import { DrawingToolbar } from "./DrawingToolbar";
import { IndicatorDialog } from "./IndicatorDialog";
import { TabBar } from "./TabBar";
import { Toolbar } from "./Toolbar";
import { useWorkspace } from "./store";

export default function App() {
  const layout = useWorkspace((s) => s.activeLayout());
  const updateActive = useWorkspace((s) => s.updateActive);
  const activeTool = useWorkspace((s) => s.activeTool);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [crosshairTime, setCrosshairTime] = useState<number | null>(null);

  const onCrosshairTime = useCallback((t: number | null) => setCrosshairTime(t), []);

  // Escape clears the armed drawing tool, like TradingView.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") useWorkspace.getState().setActiveTool(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { state } = layout;

  return (
    <div className="flex h-full flex-col bg-[#0e1117] text-[#d1d4dc]">
      <TabBar />

      <Toolbar
        symbol={state.symbol}
        resolution={state.resolution}
        chartType={state.chartType}
        showVolume={state.showVolume}
        showGrid={state.showGrid}
        indicatorCount={state.indicators.length}
        onSymbol={(symbol) => updateActive({ symbol })}
        onResolution={(resolution) => updateActive({ resolution })}
        onChartType={(chartType) => updateActive({ chartType })}
        onToggleVolume={() => updateActive({ showVolume: !state.showVolume })}
        onToggleGrid={() => updateActive({ showGrid: !state.showGrid })}
        onToggleTheme={() => updateActive({ theme: state.theme === "dark" ? "light" : "dark" })}
        theme={state.theme}
        onOpenIndicators={() => setDialogOpen(true)}
      />

      <div className="relative flex min-h-0 flex-1">
        <DrawingToolbar />

        <div className="relative min-w-0 flex-1">
          <ChartHost
            key={layout.id}
            symbol={state.symbol}
            resolution={state.resolution}
            chartType={state.chartType}
            showVolume={state.showVolume}
            showGrid={state.showGrid}
            theme={state.theme}
            indicators={state.indicators}
            drawings={state.drawings}
            onCrosshairTime={onCrosshairTime}
          />
          <Readout symbol={state.symbol} time={crosshairTime} />
          {activeTool && <ToolHint tool={activeTool} />}
        </div>
      </div>

      <IndicatorDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />

      <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-[#1e222d] px-3 text-[11px] text-[#787b86]">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-[#26a69a]" aria-hidden />
          offline demo feed
        </span>
        <span>
          {state.drawings.length} drawing{state.drawings.length === 1 ? "" : "s"}
        </span>
        <span className="ml-auto">{state.theme}</span>
      </footer>
    </div>
  );
}

function Readout({ symbol, time }: { symbol: string; time: number | null }) {
  return (
    <div className="pointer-events-none absolute left-2 top-2 text-[11px] text-[#787b86]">
      <span className="font-medium text-white">{symbol}</span>
      {time !== null && <span className="ml-2">{new Date(time * 1000).toLocaleString()}</span>}
    </div>
  );
}

const TOOL_HINTS: Record<string, string> = {
  trend_line: "Click two points",
  ray: "Click the origin and a direction",
  extended_line: "Click two points on the line",
  horizontal_line: "Click once",
  vertical_line: "Click once",
  parallel_channel: "Click the base start, base end, then offset",
  rectangle: "Click two corners",
  ellipse: "Click two opposite corners of the bounding box",
  triangle: "Click three corners",
  fib_retracement: "Click the swing start and end",
  fib_extension: "Click start, end, then the projection anchor",
  arrow: "Click the tail and the head",
  text: "Click where the text should sit",
  brush: "Drag to paint, release to commit",
  measure: "Click the start and end of the range",
  long_position: "Click entry, stop, then target",
  short_position: "Click entry, stop, then target",
};

function ToolHint({ tool }: { tool: string }) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded border border-[#2a2e39] bg-[#131722] px-2.5 py-1 text-[11px] text-[#d1d4dc] shadow-lg">
      {TOOL_HINTS[tool] ?? "Click to place"} · Esc to cancel
    </div>
  );
}
