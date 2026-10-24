import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Crosshair,
  Eraser,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Magnet,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Redo2,
  Star,
  Trash2,
  Undo2,
} from "lucide-react";
import { ALL_TOOLS, TOOL_CATEGORIES, toolSpec } from "@ezyview/drawing-tools";
import type { DrawingToolCategory, DrawingToolId, MagnetMode } from "@ezyview/drawing-tools";
import { useWorkspace } from "./store";
import { useDrawingUi } from "./drawingUi";
import { notice } from "./notice";
import { TOOL_ICONS } from "./drawingToolIcons";

/** The rail button cycles off → weak → strong. */
const NEXT_MAGNET: Record<MagnetMode, MagnetMode> = { off: "weak", weak: "strong", strong: "off" };
const MAGNET_TITLE: Record<MagnetMode, string> = {
  off: "Magnet off: anchors go where you click",
  weak: "Weak magnet: snaps to a candle's OHLC when you click close to it",
  strong: "Strong magnet: always snaps to the nearest candle's OHLC",
};

type PopoverId = DrawingToolCategory | "remove";
interface Popover {
  id: PopoverId;
  /** Fixed viewport top, aligned to the trigger button. */
  top: number;
}

/**
 * Vertical drawing rail, grouped the way TradingView groups its tools.
 *
 * Each category button re-arms the last tool used in that group; the corner
 * chevron (or a right-click) opens the flyout with every tool, its shortcut and
 * a star that pins it to the floating favourites pill. The bottom cluster holds
 * the global switches: magnet, stay-in-drawing-mode, lock all, hide all,
 * undo/redo and the remove menu.
 */
export function DrawingToolbar() {
  const [collapsed, setCollapsed] = useState(false);
  const [lastTools, setLastTools] = useState<Partial<Record<DrawingToolCategory, DrawingToolId>>>({});
  const [popover, setPopover] = useState<Popover | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const activeTool = useWorkspace((s) => s.activeTool);
  const setActiveTool = useWorkspace((s) => s.setActiveTool);
  const undoDrawing = useWorkspace((s) => s.undoDrawing);
  const redoDrawing = useWorkspace((s) => s.redoDrawing);
  const setDrawings = useWorkspace((s) => s.setDrawings);
  const clearIndicators = useWorkspace((s) => s.clearIndicators);
  const drawingCount = useWorkspace((s) => s.activeChart().drawings.length);
  const indicatorCount = useWorkspace((s) => s.activeChart().indicators.length);
  const canUndo = useWorkspace((s) => s.drawingUndo.length > 0);
  const canRedo = useWorkspace((s) => s.drawingRedo.length > 0);
  const magnet = useWorkspace((s) => s.magnet);
  const setMagnet = useWorkspace((s) => s.setMagnet);
  const stayInDrawingMode = useWorkspace((s) => s.stayInDrawingMode);
  const setStayInDrawingMode = useWorkspace((s) => s.setStayInDrawingMode);
  const lockAllDrawings = useWorkspace((s) => s.lockAllDrawings);
  const setLockAllDrawings = useWorkspace((s) => s.setLockAllDrawings);
  const hideAllDrawings = useWorkspace((s) => s.hideAllDrawings);
  const setHideAllDrawings = useWorkspace((s) => s.setHideAllDrawings);
  const eraserMode = useWorkspace((s) => s.eraserMode);
  const setEraserMode = useWorkspace((s) => s.setEraserMode);
  const favoriteTools = useWorkspace((s) => s.favoriteTools);
  const toggleFavoriteTool = useWorkspace((s) => s.toggleFavoriteTool);
  const crosshairCursor = useDrawingUi((s) => s.crosshairCursor);
  const setCrosshairCursor = useDrawingUi((s) => s.setCrosshairCursor);

  // One outside-pointer listener for whichever flyout is open.
  useEffect(() => {
    if (!popover) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-rail-popover]") || target.closest("[data-rail-trigger]")) return;
      setPopover(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [popover]);

  const openPopover = (id: PopoverId, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const top = Math.min(Math.max(8, rect.top - 4), Math.max(8, window.innerHeight - 300));
    setPopover((cur) => (cur?.id === id ? null : { id, top }));
  };

  const arm = (tool: DrawingToolId) => {
    setCrosshairCursor(false);
    setEraserMode(false);
    setActiveTool(activeTool === tool ? null : tool);
    setPopover(null);
  };

  if (collapsed) {
    return (
      <div
        role="toolbar"
        aria-orientation="vertical"
        aria-label="Drawing tools"
        className="flex w-6 shrink-0 flex-col items-center border-r border-ev-raised bg-ev-chrome py-2"
      >
        <button
          type="button"
          title="Show drawing tools toolbar"
          aria-label="Show drawing tools"
          onClick={() => setCollapsed(false)}
          className="flex size-6 items-center justify-center rounded text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
        >
          <PanelLeftOpen size={13} aria-hidden />
        </button>
      </div>
    );
  }

  const activeCategory = TOOL_CATEGORIES.find((c) => c.tools.includes(activeTool as DrawingToolId));

  return (
    <>
      <div
        role="toolbar"
        aria-orientation="vertical"
        aria-label="Drawing tools"
        className="flex w-10 shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-ev-raised py-2"
      >
        {/* Cursors: navigate, crosshair and the click-to-delete eraser. */}
        <button
          type="button"
          title="Cursor"
          aria-label="Cursor"
          aria-pressed={activeTool === null && !eraserMode && !crosshairCursor}
          onClick={() => {
            setActiveTool(null);
            setEraserMode(false);
            setCrosshairCursor(false);
          }}
          className={iconClass(activeTool === null && !eraserMode && !crosshairCursor)}
        >
          <MousePointer2 size={16} aria-hidden />
        </button>
        <button
          type="button"
          title="Crosshair cursor"
          aria-label="Crosshair cursor"
          aria-pressed={crosshairCursor}
          onClick={() => {
            setActiveTool(null);
            setEraserMode(false);
            setCrosshairCursor(!crosshairCursor);
          }}
          className={iconClass(crosshairCursor)}
        >
          <Crosshair size={16} aria-hidden />
        </button>
        <button
          type="button"
          title="Eraser: click a drawing to delete it"
          aria-label="Eraser"
          aria-pressed={eraserMode}
          onClick={() => setEraserMode(!eraserMode)}
          className={iconClass(eraserMode)}
        >
          <Eraser size={16} aria-hidden />
        </button>

        {TOOL_CATEGORIES.map((category) => {
          const last = lastTools[category.id] ?? category.tools[0]!;
          const shown = activeCategory?.id === category.id && activeTool ? activeTool : last;
          const Icon = TOOL_ICONS[shown];
          const isOpen = popover?.id === category.id;
          return (
            <div key={category.id} className="contents">
              <div className="my-1 h-px w-5 bg-ev-raised" />
              <div className="relative">
                <button
                  type="button"
                  data-rail-trigger
                  title={`${category.title}: ${toolSpec(shown).label}`}
                  aria-label={`${category.title}: ${toolSpec(shown).label}`}
                  aria-pressed={activeCategory?.id === category.id}
                  aria-haspopup="menu"
                  aria-expanded={isOpen}
                  onClick={() => arm(shown)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openPopover(category.id, e.currentTarget);
                  }}
                  className={iconClass(activeCategory?.id === category.id)}
                >
                  <Icon size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  data-rail-trigger
                  aria-label={`Show ${category.title}`}
                  aria-haspopup="menu"
                  aria-expanded={isOpen}
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    openPopover(category.id, e.currentTarget.parentElement ?? e.currentTarget);
                  }}
                  className="absolute bottom-0 right-0 flex size-3 items-center justify-center rounded-sm text-ev-faint hover:text-ev-strong"
                >
                  <ChevronDown size={9} aria-hidden />
                </button>
              </div>
            </div>
          );
        })}

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
        <button
          type="button"
          title="Stay in drawing mode: keep the tool armed for rapid placement"
          aria-label="Stay in drawing mode"
          aria-pressed={stayInDrawingMode}
          onClick={() => setStayInDrawingMode(!stayInDrawingMode)}
          className={`relative ${iconClass(stayInDrawingMode)}`}
        >
          <Pencil size={15} aria-hidden />
          <span className="absolute bottom-0.5 right-0.5 size-1.5 rounded-full border border-ev-chrome bg-ev-accent" aria-hidden />
        </button>
        <button
          type="button"
          title="Lock all drawings: visible, but nothing can be dragged"
          aria-label="Lock all drawings"
          aria-pressed={lockAllDrawings}
          onClick={() => setLockAllDrawings(!lockAllDrawings)}
          className={iconClass(lockAllDrawings)}
        >
          {lockAllDrawings ? <Lock size={15} aria-hidden /> : <LockOpen size={15} aria-hidden />}
        </button>
        <button
          type="button"
          title="Hide all drawings without deleting them"
          aria-label="Hide all drawings"
          aria-pressed={hideAllDrawings}
          onClick={() => setHideAllDrawings(!hideAllDrawings)}
          className={iconClass(hideAllDrawings)}
        >
          {hideAllDrawings ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
        </button>

        <div className="my-1 h-px w-5 bg-ev-raised" />
        <button
          type="button"
          title="Undo last drawing (Ctrl+Z)"
          aria-label="Undo last drawing"
          onClick={() => undoDrawing()}
          disabled={!canUndo}
          className={iconClass(false)}
        >
          <Undo2 size={15} aria-hidden />
        </button>
        <button
          type="button"
          title="Redo last drawing (Ctrl+Y)"
          aria-label="Redo last drawing"
          onClick={() => redoDrawing()}
          disabled={!canRedo}
          className={iconClass(false)}
        >
          <Redo2 size={15} aria-hidden />
        </button>
        <button
          type="button"
          data-rail-trigger
          title="Remove drawings, indicators or everything on this chart"
          aria-label="Remove objects"
          aria-haspopup="menu"
          aria-expanded={popover?.id === "remove"}
          onClick={(e) => openPopover("remove", e.currentTarget)}
          className={iconClass(popover?.id === "remove")}
        >
          <Trash2 size={15} aria-hidden />
        </button>

        <div className="mt-auto pt-1">
          <button
            type="button"
            title="Collapse drawing tools toolbar"
            aria-label="Collapse drawing tools"
            onClick={() => setCollapsed(true)}
            className="flex size-7 items-center justify-center rounded text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
          >
            <PanelLeftClose size={14} aria-hidden />
          </button>
        </div>
      </div>

      {popover && (
        <div
          ref={popoverRef}
          data-rail-popover
          role="menu"
          aria-label={popover.id === "remove" ? "Remove objects" : TOOL_CATEGORIES.find((c) => c.id === popover.id)?.title}
          style={{ position: "fixed", left: 44, top: popover.top, zIndex: 60 }}
          className="max-h-[70vh] w-56 overflow-y-auto rounded border border-ev-line bg-ev-panel py-1 text-dense shadow-2xl"
        >
          {popover.id === "remove" ? (
            <>
              <p className="px-2 py-1 text-dense font-semibold uppercase tracking-wider text-ev-faint">Remove</p>
              <button
                type="button"
                disabled={drawingCount === 0}
                onClick={() => {
                  setDrawings([]);
                  setPopover(null);
                }}
                className="block w-full px-2 py-1 text-left text-ev-text hover:bg-ev-raised disabled:opacity-40"
              >
                Remove {drawingCount} drawing{drawingCount === 1 ? "" : "s"}
              </button>
              <button
                type="button"
                disabled={indicatorCount === 0}
                onClick={() => {
                  clearIndicators();
                  setPopover(null);
                }}
                className="block w-full px-2 py-1 text-left text-ev-text hover:bg-ev-raised disabled:opacity-40"
              >
                Remove {indicatorCount} indicator{indicatorCount === 1 ? "" : "s"}
              </button>
              <button
                type="button"
                disabled={drawingCount === 0 && indicatorCount === 0}
                onClick={() => {
                  setPopover(null);
                  void notice
                    .confirm("Remove all objects?", {
                      body: `${drawingCount} drawing${drawingCount === 1 ? "" : "s"} and ${indicatorCount} indicator${indicatorCount === 1 ? "" : "s"} will be removed.`,
                      confirmLabel: "Remove all",
                    })
                    .then((ok) => {
                      if (!ok) return;
                      setDrawings([]);
                      clearIndicators();
                    });
                }}
                className="block w-full px-2 py-1 text-left text-ev-down-text hover:bg-ev-raised disabled:opacity-40"
              >
                Remove all
              </button>
            </>
          ) : (
            TOOL_CATEGORIES.find((c) => c.id === popover.id)?.tools.map((tool) => {
              const spec = toolSpec(tool);
              const Icon = TOOL_ICONS[tool];
              const starred = favoriteTools.includes(tool);
              return (
                <div
                  key={tool}
                  className={`flex items-center gap-1 px-1 ${activeTool === tool ? "bg-ev-raised" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setLastTools((prev) => ({ ...prev, [popover.id as DrawingToolCategory]: tool }));
                      arm(tool);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-1 text-left text-ev-text hover:bg-ev-raised"
                  >
                    <Icon size={14} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{spec.label}</span>
                    {spec.shortcut && <span className="text-micro text-ev-faint">{spec.shortcut}</span>}
                  </button>
                  <button
                    type="button"
                    aria-label={starred ? `Unstar ${spec.label}` : `Star ${spec.label}`}
                    aria-pressed={starred}
                    onClick={() => toggleFavoriteTool(tool)}
                    className={`flex size-5 items-center justify-center rounded ${
                      starred ? "text-ev-accent-text" : "text-ev-faint hover:text-ev-strong"
                    }`}
                  >
                    <Star size={12} fill={starred ? "currentColor" : "none"} aria-hidden />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </>
  );
}

function iconClass(active: boolean): string {
  return active
    ? "flex size-8 shrink-0 items-center justify-center rounded bg-ev-raised text-ev-accent-text"
    : "flex size-8 shrink-0 items-center justify-center rounded text-ev-muted hover:bg-ev-raised hover:text-ev-strong disabled:opacity-40";
}

/** Every tool the rail exposes, for hint text and tests. */
export const RAIL_TOOLS: readonly DrawingToolId[] = ALL_TOOLS;
