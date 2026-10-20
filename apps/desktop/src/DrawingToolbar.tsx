import {
  ArrowUpRight,
  BarChart2,
  Brush,
  Circle,
  Frame,
  Magnet,
  MousePointer2,
  MoveHorizontal,
  MoveUpRight,
  MoveVertical,
  Route,
  Ruler,
  Spline,
  Square,
  TrendingDown,
  TrendingUp,
  Triangle,
  Type,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DrawingToolId, MagnetMode } from "@ezyview/drawing-tools";
import { useWorkspace } from "./store";

interface ToolEntry {
  id: DrawingToolId;
  label: string;
  icon: LucideIcon;
}

/** Tools grouped the way TradingView's rail groups them. */
const SECTIONS: { title: string; tools: ToolEntry[] }[] = [
  {
    title: "Trend lines",
    tools: [
      { id: "trend_line", label: "Trend line", icon: Spline },
      { id: "ray", label: "Ray", icon: MoveUpRight },
      { id: "extended_line", label: "Extended line", icon: Route },
      { id: "horizontal_line", label: "Horizontal line", icon: MoveHorizontal },
      { id: "vertical_line", label: "Vertical line", icon: MoveVertical },
    ],
  },
  {
    title: "Gann and Fibonacci",
    tools: [
      { id: "fib_retracement", label: "Fib retracement", icon: BarChart2 },
      { id: "fib_extension", label: "Fib extension", icon: TrendingUp },
    ],
  },
  {
    title: "Patterns",
    tools: [
      { id: "parallel_channel", label: "Parallel channel", icon: Frame },
      { id: "rectangle", label: "Rectangle", icon: Square },
      { id: "ellipse", label: "Ellipse", icon: Circle },
      { id: "triangle", label: "Triangle", icon: Triangle },
    ],
  },
  {
    title: "Annotation",
    tools: [
      { id: "arrow", label: "Arrow", icon: ArrowUpRight },
      { id: "text", label: "Text", icon: Type },
      { id: "brush", label: "Brush", icon: Brush },
    ],
  },
  {
    title: "Measure",
    tools: [{ id: "measure", label: "Measure", icon: Ruler }],
  },
  {
    title: "Prediction",
    tools: [
      { id: "long_position", label: "Long position", icon: TrendingUp },
      { id: "short_position", label: "Short position", icon: TrendingDown },
    ],
  },
];

const FLAT = SECTIONS.flatMap((s) => s.tools);

/** The rail button cycles off → weak → strong. */
const NEXT_MAGNET: Record<MagnetMode, MagnetMode> = { off: "weak", weak: "strong", strong: "off" };
const MAGNET_TITLE: Record<MagnetMode, string> = {
  off: "Magnet off: anchors go where you click",
  weak: "Weak magnet: snaps to a candle's OHLC when you click close to it",
  strong: "Strong magnet: always snaps to the nearest candle's OHLC",
};

/**
 * Vertical drawing rail.
 *
 * Arming a tool keeps it active until the next click places the drawing; the
 * cursor button or Escape returns to navigation.
 */
export function DrawingToolbar() {
  const activeTool = useWorkspace((s) => s.activeTool);
  const setActiveTool = useWorkspace((s) => s.setActiveTool);
  const drawings = useWorkspace((s) => s.activeChart().drawings);
  const setDrawings = useWorkspace((s) => s.setDrawings);
  const magnet = useWorkspace((s) => s.magnet);
  const setMagnet = useWorkspace((s) => s.setMagnet);

  return (
    <div
      role="toolbar"
      aria-orientation="vertical"
      aria-label="Drawing tools"
      className="flex w-10 shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-ev-raised py-2"
    >
      <button
        type="button"
        title="Cursor"
        aria-label="Cursor"
        aria-pressed={activeTool === null}
        onClick={() => setActiveTool(null)}
        className={iconClass(activeTool === null)}
      >
        <MousePointer2 size={16} aria-hidden />
      </button>

      {SECTIONS.map((section) => (
        <div key={section.title} className="contents">
          <div className="my-1 h-px w-5 bg-ev-raised" />
          {section.tools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              title={tool.label}
              aria-label={tool.label}
              aria-pressed={activeTool === tool.id}
              onClick={() => setActiveTool(activeTool === tool.id ? null : tool.id)}
              className={iconClass(activeTool === tool.id)}
            >
              <tool.icon size={16} aria-hidden />
            </button>
          ))}
        </div>
      ))}

      <div className="my-1 h-px w-5 bg-ev-raised" />
      <button
        type="button"
        title={`${MAGNET_TITLE[magnet]} (click to change)`}
        aria-label={`Magnet mode: ${magnet}`}
        aria-pressed={magnet !== "off"}
        onClick={() => setMagnet(NEXT_MAGNET[magnet])}
        className={`relative ${iconClass(magnet !== "off")}`}
      >
        <Magnet size={16} aria-hidden />
        {magnet === "strong" && (
          <span className="absolute bottom-1 right-1 size-1.5 rounded-full bg-ev-accent" aria-hidden />
        )}
      </button>

      {drawings.length > 0 && (
        <>
          <div className="my-1 h-px w-5 bg-ev-raised" />
          <button
            type="button"
            title="Remove last drawing"
            aria-label="Remove last drawing"
            onClick={() => setDrawings(drawings.slice(0, -1))}
            className="flex size-8 items-center justify-center rounded text-[11px] font-medium text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
          >
            Undo
          </button>
        </>
      )}
    </div>
  );
}

function iconClass(active: boolean): string {
  return active
    ? "flex size-8 shrink-0 items-center justify-center rounded bg-ev-raised text-ev-accent-text"
    : "flex size-8 shrink-0 items-center justify-center rounded text-ev-muted hover:bg-ev-raised hover:text-ev-strong";
}

/** Every tool the rail exposes, for hint text and tests. */
export const RAIL_TOOLS: readonly DrawingToolId[] = FLAT.map((t) => t.id);
