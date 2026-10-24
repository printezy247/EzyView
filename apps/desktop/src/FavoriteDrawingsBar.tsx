import { useRef, useState } from "react";
import { GripVertical, Star } from "lucide-react";
import { toolSpec } from "@ezyview/drawing-tools";
import { useWorkspace } from "./store";
import { TOOL_ICONS } from "./drawingToolIcons";

/**
 * The floating quick-access pill for starred drawing tools. It appears only
 * when at least one tool is starred and can be dragged around the chart area;
 * a click arms the tool exactly like the left rail.
 */
export function FavoriteDrawingsBar() {
  const favorites = useWorkspace((s) => s.favoriteTools);
  const activeTool = useWorkspace((s) => s.activeTool);
  const setActiveTool = useWorkspace((s) => s.setActiveTool);
  const toggleFavorite = useWorkspace((s) => s.toggleFavoriteTool);
  const barRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ dx: number; dy: number; parent: HTMLElement } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  if (favorites.length === 0) return null;

  const startDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const bar = barRef.current;
    const parent = bar?.offsetParent as HTMLElement | null;
    if (!bar || !parent) return;
    const barRect = bar.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - barRect.left, dy: e.clientY - barRect.top, parent };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const bar = barRef.current;
    if (!drag || !bar) return;
    const parent = drag.parent.getBoundingClientRect();
    const maxX = Math.max(4, parent.width - bar.offsetWidth - 4);
    const maxY = Math.max(4, parent.height - bar.offsetHeight - 4);
    setPos({
      x: Math.min(Math.max(4, e.clientX - parent.left - drag.dx), maxX),
      y: Math.min(Math.max(4, e.clientY - parent.top - drag.dy), maxY),
    });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="Favourite drawing tools"
      className="absolute z-20 flex items-center gap-0.5 rounded-md border border-ev-line bg-ev-panel/95 px-1 py-0.5 shadow-lg"
      style={pos ? { left: pos.x, top: pos.y } : { right: 12, top: 12 }}
    >
      <button
        type="button"
        aria-label="Drag favourite drawing tools"
        title="Drag"
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="flex cursor-grab touch-none items-center rounded px-0.5 text-ev-faint hover:text-ev-strong"
      >
        <GripVertical size={12} aria-hidden />
      </button>
      {favorites.map((id) => {
        const spec = toolSpec(id);
        const Icon = TOOL_ICONS[id];
        return (
          <button
            key={id}
            type="button"
            aria-label={spec.label}
            aria-pressed={activeTool === id}
            title={`${spec.label}${spec.shortcut ? ` (${spec.shortcut})` : ""} — right-click to unstar`}
            onClick={() => setActiveTool(activeTool === id ? null : id)}
            onContextMenu={(e) => {
              e.preventDefault();
              toggleFavorite(id);
            }}
            className={`flex size-7 items-center justify-center rounded ${
              activeTool === id ? "bg-ev-raised text-ev-accent-text" : "text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
            }`}
          >
            <Icon size={14} aria-hidden />
          </button>
        );
      })}
      <Star size={9} className="mx-0.5 text-ev-faint" aria-hidden />
    </div>
  );
}
