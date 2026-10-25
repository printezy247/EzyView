import { cloneElement, useEffect, useId, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "./cn";
import { type ButtonVariant, type ControlSize, buttonClass } from "./classNames";
import { popupPosition, usePopupDismiss } from "./popup";

export interface PopoverProps {
  /** Accessible name, used for both the trigger and the panel. */
  label: string;
  /** Visual content of the trigger (an icon, a label, both). */
  trigger: ReactNode;
  children: ReactNode | ((api: { close: () => void }) => ReactNode);
  align?: "left" | "right";
  /** Fixed width; omit to let the panel size itself (minimum 220px). */
  width?: number;
  size?: ControlSize;
  variant?: ButtonVariant;
  triggerClassName?: string;
  panelClassName?: string;
}

/**
 * A button and a floating panel of arbitrary content (filters, color pickers,
 * a mini form). Unlike `Menu` the content is not a list of actions, so it is
 * exposed as a labelled `dialog` and focus moves into it.
 */
export function Popover({
  label,
  trigger,
  children,
  align = "left",
  width,
  size = "md",
  variant = "ghost",
  triggerClassName,
  panelClassName,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  usePopupDismiss(open, () => setOpen(false), [triggerRef, panelRef]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("input, select, textarea, button, [tabindex]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const placement = popupPosition(triggerRef.current, { align, width, minWidth: 220 });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className={buttonClass({ size, variant, className: cn(triggerClassName) })}
      >
        {trigger}
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={id}
            role="dialog"
            aria-label={label}
            tabIndex={-1}
            className={cn(
              "fixed z-[var(--z-dropdown)] rounded border border-ev-line bg-ev-panel p-2 shadow-xl",
              panelClassName,
            )}
            style={{ top: placement.top, left: placement.left, width: placement.width, minWidth: placement.minWidth, maxHeight: placement.maxHeight, overflowY: "auto" }}
          >
            {typeof children === "function" ? children({ close }) : children}
          </div>,
          document.body,
        )}
    </>
  );
}

export interface TooltipProps {
  /** The tip text. Keep it to a short phrase. */
  content: string;
  children: ReactElement<{ "aria-describedby"?: string }>;
  side?: "top" | "bottom";
}

/**
 * Hover/focus tip for icon-only controls.
 *
 * The wrapper owns the events (React's `onFocus` bubbles, so a keyboard focus
 * on the child opens it too) and the child receives `aria-describedby` while
 * the tip is visible, so screen-reader users hear the same words.
 */
export function Tooltip({ content, children, side = "bottom" }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  const show = (delay = 300) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };

  useEffect(() => () => hide(), []);

  const placement = popupPosition(wrapRef.current, { minWidth: 120 });
  const top = side === "top" ? Math.max(8, placement.top - 40) : placement.top;

  const child = open ? cloneElement(children, { "aria-describedby": id }) : children;

  return (
    <span
      ref={wrapRef}
      className="inline-flex"
      onMouseEnter={() => show()}
      onMouseLeave={hide}
      onFocus={() => show(0)}
      onBlur={hide}
    >
      {child}
      {open &&
        createPortal(
          <div
            role="tooltip"
            id={id}
            className="pointer-events-none fixed z-[var(--z-dropdown)] max-w-64 rounded border border-ev-line bg-ev-panel px-2 py-1 text-dense text-ev-text shadow-lg"
            style={{ top, left: placement.left, minWidth: placement.minWidth }}
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}
