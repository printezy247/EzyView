import { Minus, MousePointer2, MoveHorizontal, MoveVertical, Square, Spline } from "lucide-react";
import type { DrawingToolId } from "@ezyview/drawing-tools";
import { useWorkspace } from "./store";

const TOOLS: { id: DrawingToolId; label: string; icon: typeof Minus }[] = [
  { id: "trend_line", label: "Trend line", icon: Spline },
  { id: "horizontal_line", label: "Horizontal line", icon: MoveHorizontal },
  { id: "vertical_line", label: "Vertical line", icon: MoveVertical },
  { id: "rectangle", label: "Rectangle", icon: Square },
  { id: "fib_retracement", label: "Fib retracement", icon: Minus },
];

/** Vertical P1 drawing palette. Re-armed tool stays active until cleared. */
export function DrawingToolbar() {
  const activeTool = useWorkspace((s) => s.activeTool);
  const setActiveTool = useWorkspace((s) => s.setActiveTool);
  const drawings = useWorkspace((s) => s.activeLayout().state.drawings);
  const setDrawings = useWorkspace((s) => s.setDrawings);

  return (
    <div className="flex w-10 shrink-0 flex-col items-center gap-0.5 border-r border-[#1e222d] py-2">
      <button
        type="button"
        title="Cursor"
        onClick={() => setActiveTool(null)}
        className={iconClass(activeTool === null)}
      >
        <MousePointer2 size={16} aria-hidden />
      </button>

      <div className="my-1 h-px w-5 bg-[#1e222d]" />

      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          title={tool.label}
          onClick={() => setActiveTool(activeTool === tool.id ? null : tool.id)}
          className={iconClass(activeTool === tool.id)}
        >
          <tool.icon size={16} aria-hidden />
        </button>
      ))}

      {drawings.length > 0 && (
        <>
          <div className="my-1 h-px w-5 bg-[#1e222d]" />
          <button
            type="button"
            title="Remove last drawing"
            onClick={() => setDrawings(drawings.slice(0, -1))}
            className={iconClass(false)}
          >
            <span className="text-[10px] font-medium">Undo</span>
          </button>
        </>
      )}
    </div>
  );
}

function iconClass(active: boolean): string {
  return active
    ? "flex size-8 items-center justify-center rounded bg-[#1e222d] text-[#2962ff]"
    : "flex size-8 items-center justify-center rounded text-[#787b86] hover:bg-[#1e222d] hover:text-white";
}
