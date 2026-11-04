import { useEffect } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "./cn";

export interface HoverCardProps {
  /** Accessible name, shown as the card title. */
  title: string;
  /** Viewport point to anchor near (usually the cursor). */
  x: number;
  y: number;
  /** Fixed width; clamped to the viewport. */
  width?: number;
  /** Pinned cards get a close button and Escape handling; hover cards omit it. */
  onClose?: () => void;
  className?: string;
  children: ReactNode;
}

/**
 * Floating detail card for hover previews (chart event strip, markers).
 *
 * Unlike `Popover` this is not a control: it never takes focus, so moving
 * the pointer across a row of chips keeps the preview alive instead of
 * trapping the cursor. Positioned `fixed` near the anchor and flipped when
 * the anchor sits near the viewport edge.
 */
export function HoverCard({ title, x, y, width = 280, onClose, className, children }: HoverCardProps) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;
  const left = Math.max(8, Math.min(x + 12, vw - width - 8));
  const below = y < vh - 360;

  return createPortal(
    <div
      role="dialog"
      aria-label={title}
      className={cn(
        "fixed z-[var(--z-dropdown)] rounded border border-ev-line bg-ev-panel p-3 shadow-xl",
        className,
      )}
      style={below ? { left, top: y + 14, width } : { left, bottom: vh - y + 14, width }}
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <p className="text-dense font-medium text-ev-strong">{title}</p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-0.5 text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
          >
            <X size={13} aria-hidden />
          </button>
        )}
      </div>
      {children}
    </div>,
    document.body,
  );
}