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
import { Button, IconButton, SHELL_RAIL_ICON, SHELL_RAIL_WIDTH } from "./ui";

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
        className={`flex ${SHELL_RAIL_WIDTH} shrink-0 flex-col items-center border-r border-ev-raised bg-ev-chrome py-2`}
      >
        <IconButton label="Show drawing tools" size="sm" onClick={() => setCollapsed(false)}>
          <PanelLeftOpen size={SHELL_RAIL_ICON} aria-hidden />
        </IconButton>
      </div>
    );
  }

  const activeCategory = TOOL_CATEGORIES.find((c) => c.tools.includes(activeTool as DrawingToolId));
  const activeCls = "bg-ev-raised text-ev-accent-text";

  return (
    <>
      <div
        role="toolbar"
        aria-orientation="vertical"
        aria-label="Drawing tools"
        className={`flex ${SHELL_RAIL_WIDTH} shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-ev-raised py-2`}
      >
        {/* Cursors: navigate, crosshair and the click-to-delete eraser. */}
        <IconButton
          label="Cursor"
          size="lg"
          aria-pressed={activeTool === null && !eraserMode && !crosshairCursor}
          onClick={() => {
            setActiveTool(null);
            setEraserMode(false);
            setCrosshairCursor(false);
          }}
          className={activeTool === null && !eraserMode && !crosshairCursor ? activeCls : undefined}
        >
          <MousePointer2 size={16} aria-hidden />
        </IconButton>
        <IconButton
          label="Crosshair cursor"
          size="lg"
          aria-pressed={crosshairCursor}
          onClick={() => {
            setActiveTool(null);
            setEraserMode(false);
            setCrosshairCursor(!crosshairCursor);
          }}
          className={crosshairCursor ? activeCls : undefined}
        >
          <Crosshair size={16} aria-hidden />
        </IconButton>
        <IconButton
          label="Eraser: click a drawing to delete it"
          size="lg"
          aria-pressed={eraserMode}
          onClick={() => setEraserMode(!eraserMode)}
          className={eraserMode ? activeCls : undefined}
        >
          <Eraser size={16} aria-hidden />
        </IconButton>

        {TOOL_CATEGORIES.map((category) => {
          const last = lastTools[category.id] ?? category.tools[0]!;
          const shown = activeCategory?.id === category.id && activeTool ? activeTool : last;
          const Icon = TOOL_ICONS[shown];
          const isOpen = popover?.id === category.id;
          const isActive = activeCategory?.id === category.id;
          return (
            <div key={category.id} className="contents">
              <div className="my-1 h-px w-5 bg-ev-raised" />
              <div className="relative">
                <IconButton
                  data-rail-trigger
                  label={`${category.title}: ${toolSpec(shown).label}`}
                  size="lg"
                  aria-pressed={isActive}
                  aria-haspopup="menu"
                  aria-expanded={isOpen}
                  onClick={() => arm(shown)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openPopover(category.id, e.currentTarget);
                  }}
                  className={isActive ? activeCls : undefined}
                >
                  <Icon size={16} aria-hidden />
                </IconButton>
                <IconButton
                  data-rail-trigger
                  label={`Show ${category.title}`}
                  size="sm"
                  aria-haspopup="menu"
                  aria-expanded={isOpen}
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    openPopover(category.id, e.currentTarget.parentElement ?? e.currentTarget);
                  }}
                  className="absolute bottom-0 right-0 size-3 rounded-sm"
                >
                  <ChevronDown size={9} aria-hidden />
                </IconButton>
              </div>
            </div>
          );
        })}

        <div className="my-1 h-px w-5 bg-ev-raised" />
        <IconButton
          label={`${MAGNET_TITLE[magnet]} (click to change)`}
          size="lg"
          aria-pressed={magnet !== "off"}
          onClick={() => setMagnet(NEXT_MAGNET[magnet])}
          className={magnet !== "off" ? `relative ${activeCls}` : "relative"}
        >
          <Magnet size={16} aria-hidden />
          {magnet === "strong" && (
            <span className="absolute bottom-1 right-1 size-1.5 rounded-full bg-ev-accent" aria-hidden />
          )}
        </IconButton>
        <IconButton
          label="Stay in drawing mode: keep the tool armed for rapid placement"
          size="lg"
          aria-pressed={stayInDrawingMode}
          onClick={() => setStayInDrawingMode(!stayInDrawingMode)}
          className={stayInDrawingMode ? `relative ${activeCls}` : "relative"}
        >
          <Pencil size={SHELL_RAIL_ICON} aria-hidden />
          <span className="absolute bottom-0.5 right-0.5 size-1.5 rounded-full border border-ev-chrome bg-ev-accent" aria-hidden />
        </IconButton>
        <IconButton
          label="Lock all drawings: visible, but nothing can be dragged"
          size="lg"
          aria-pressed={lockAllDrawings}
          onClick={() => setLockAllDrawings(!lockAllDrawings)}
          className={lockAllDrawings ? activeCls : undefined}
        >
          {lockAllDrawings ? <Lock size={SHELL_RAIL_ICON} aria-hidden /> : <LockOpen size={SHELL_RAIL_ICON} aria-hidden />}
        </IconButton>
        <IconButton
          label="Hide all drawings without deleting them"
          size="lg"
          aria-pressed={hideAllDrawings}
          onClick={() => setHideAllDrawings(!hideAllDrawings)}
          className={hideAllDrawings ? activeCls : undefined}
        >
          {hideAllDrawings ? <EyeOff size={SHELL_RAIL_ICON} aria-hidden /> : <Eye size={SHELL_RAIL_ICON} aria-hidden />}
        </IconButton>

        <div className="my-1 h-px w-5 bg-ev-raised" />
        <IconButton
          label="Undo last drawing (Ctrl+Z)"
          size="lg"
          onClick={() => undoDrawing()}
          disabled={!canUndo}
        >
          <Undo2 size={SHELL_RAIL_ICON} aria-hidden />
        </IconButton>
        <IconButton
          label="Redo last drawing (Ctrl+Y)"
          size="lg"
          onClick={() => redoDrawing()}
          disabled={!canRedo}
        >
          <Redo2 size={SHELL_RAIL_ICON} aria-hidden />
        </IconButton>
        <IconButton
          data-rail-trigger
          label="Remove drawings, indicators or everything on this chart"
          size="lg"
          aria-haspopup="menu"
          aria-expanded={popover?.id === "remove"}
          onClick={(e) => openPopover("remove", e.currentTarget)}
          className={popover?.id === "remove" ? activeCls : undefined}
        >
          <Trash2 size={SHELL_RAIL_ICON} aria-hidden />
        </IconButton>

        <div className="mt-auto pt-1">
          <IconButton label="Collapse drawing tools" onClick={() => setCollapsed(true)}>
            <PanelLeftClose size={14} aria-hidden />
          </IconButton>
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
              <Button
                variant="ghost"
                size="sm"
                disabled={drawingCount === 0}
                onClick={() => {
                  setDrawings([]);
                  setPopover(null);
                }}
                className="w-full justify-start"
              >
                Remove {drawingCount} drawing{drawingCount === 1 ? "" : "s"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={indicatorCount === 0}
                onClick={() => {
                  clearIndicators();
                  setPopover(null);
                }}
                className="w-full justify-start"
              >
                Remove {indicatorCount} indicator{indicatorCount === 1 ? "" : "s"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
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
                className="w-full justify-start text-ev-down-text"
              >
                Remove all
              </Button>
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setLastTools((prev) => ({ ...prev, [popover.id as DrawingToolCategory]: tool }));
                      arm(tool);
                    }}
                    className="min-w-0 flex-1 justify-start"
                  >
                    <Icon size={14} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{spec.label}</span>
                    {spec.shortcut && <span className="text-micro text-ev-faint">{spec.shortcut}</span>}
                  </Button>
                  <IconButton
                    label={starred ? `Unstar ${spec.label}` : `Star ${spec.label}`}
                    size="sm"
                    aria-pressed={starred}
                    onClick={() => toggleFavoriteTool(tool)}
                    className={starred ? "text-ev-accent-text" : "text-ev-faint"}
                  >
                    <Star size={12} fill={starred ? "currentColor" : "none"} aria-hidden />
                  </IconButton>
                </div>
              );
            })
          )}
        </div>
      )}
    </>
  );
}

/** Every tool the rail exposes, for hint text and tests. */
export const RAIL_TOOLS: readonly DrawingToolId[] = ALL_TOOLS;
