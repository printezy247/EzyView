import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Resolution } from "@ezyview/data-adapters";
import type { ChartType } from "@ezyview/chart-engine";
import { PICKER_RESOLUTIONS } from "./data";
import { SymbolSearch } from "./SymbolSearch";

export const CHART_TYPES: { id: ChartType; label: string }[] = [
  { id: "candles", label: "Candles" },
  { id: "bars", label: "Bars" },
  { id: "hollow", label: "Hollow candles" },
  { id: "line", label: "Line" },
  { id: "area", label: "Area" },
  { id: "baseline", label: "Baseline" },
];

interface Props {
  symbol: string;
  resolution: Resolution;
  chartType: ChartType;
  showVolume: boolean;
  showGrid: boolean;
  onSymbol: (s: string) => void;
  onResolution: (r: Resolution) => void;
  onChartType: (t: ChartType) => void;
  onToggleVolume: () => void;
  onToggleGrid: () => void;
  onToggleTheme: () => void;
  onOpenIndicators: () => void;
  indicatorCount: number;
  theme: "dark" | "light";
}

export function Toolbar(props: Props) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-[#1e222d] px-2">
      <SymbolSearch symbol={props.symbol} onSelect={props.onSymbol} />

      <div className="mx-1 h-4 w-px bg-[#1e222d]" />

      {PICKER_RESOLUTIONS.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => props.onResolution(r)}
          className={
            r === props.resolution
              ? "rounded bg-[#1e222d] px-2 py-1 text-xs font-medium text-white"
              : "rounded px-2 py-1 text-xs text-[#787b86] hover:bg-[#1e222d] hover:text-white"
          }
        >
          {r}
        </button>
      ))}

      <div className="mx-1 h-4 w-px bg-[#1e222d]" />

      <Menu
        label={CHART_TYPES.find((t) => t.id === props.chartType)?.label ?? "Candles"}
        options={CHART_TYPES.map((t) => ({ id: t.id, label: t.label }))}
        value={props.chartType}
        onSelect={(id) => props.onChartType(id as ChartType)}
      />

      <button
        type="button"
        onClick={props.onOpenIndicators}
        className="rounded px-2 py-1 text-xs text-[#787b86] hover:bg-[#1e222d] hover:text-white"
      >
        Indicators
        {props.indicatorCount > 0 && (
          <span className="ml-1 rounded bg-[#2962ff] px-1 text-[10px] text-white">{props.indicatorCount}</span>
        )}
      </button>

      <div className="mx-1 h-4 w-px bg-[#1e222d]" />

      <Toggle label="Volume" on={props.showVolume} onClick={props.onToggleVolume} />
      <Toggle label="Grid" on={props.showGrid} onClick={props.onToggleGrid} />

      <div className="ml-auto flex items-center gap-1">
        <Toggle label={props.theme === "dark" ? "Dark" : "Light"} on onClick={props.onToggleTheme} />
      </div>
    </div>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        on
          ? "rounded px-2 py-1 text-xs text-white hover:bg-[#1e222d]"
          : "rounded px-2 py-1 text-xs text-[#434651] hover:bg-[#1e222d] hover:text-[#787b86]"
      }
    >
      {label}
    </button>
  );
}

function Menu({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[#787b86] hover:bg-[#1e222d] hover:text-white"
      >
        {label}
        <ChevronDown size={12} aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-44 rounded border border-[#2a2e39] bg-[#131722] py-1 shadow-xl">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                onSelect(o.id);
                setOpen(false);
              }}
              className={
                o.id === value
                  ? "block w-full px-3 py-1.5 text-left text-xs text-white hover:bg-[#1e222d]"
                  : "block w-full px-3 py-1.5 text-left text-xs text-[#787b86] hover:bg-[#1e222d] hover:text-white"
              }
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
