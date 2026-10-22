import { useEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Focusable descendants that are actually shown (not hidden, inert or display:none). */
function visibleFocusables(box: HTMLElement): HTMLElement[] {
  return [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) =>
      !el.closest("[hidden], [inert], [aria-hidden='true']") &&
      getComputedStyle(el).display !== "none" &&
      getComputedStyle(el).visibility !== "hidden",
  );
}

/** Index to focus after Tab (or Shift+Tab) from `current`, wrapping at both ends. */
export function nextFocusIndex(count: number, current: number, backwards: boolean): number {
  if (count === 0) return -1;
  if (current < 0) return backwards ? count - 1 : 0;
  return (current + (backwards ? count - 1 : 1)) % count;
}

interface Props {
  /** Mount the dialog only while it is open; the caller gates rendering. */
  open?: boolean;
  onClose: () => void;
  /** id of the dialog's visible title. */
  labelledBy: string;
  /** Classes for the dialog box itself. */
  className?: string;
  /** Classes for the dimmed backdrop; clicking it closes the dialog. */
  backdropClassName?: string;
  children: ReactNode;
}

/**
 * A modal dialog: announced as a dialog, Escape closes it, Tab stays inside
 * it, and focus returns to whatever opened it.
 */
export function Modal({
  open = true,
  onClose,
  labelledBy,
  className = "",
  backdropClassName = "fixed inset-0 z-[var(--z-dialog)] flex items-center justify-center bg-black/50",
  children,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const box = ref.current;
    if (box && !box.contains(document.activeElement)) {
      (box.querySelector<HTMLElement>("[autofocus]") ?? visibleFocusables(box)[0] ?? box).focus();
    }
    return () => opener?.focus?.();
    // Re-running on `open` keeps the focus/keyboard wiring honest when a host
    // keeps the component mounted across open/close cycles.
  }, [open]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Editors (Monaco) consume their own Escape/Tab and mark them handled.
    if (e.defaultPrevented) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !ref.current) return;
    const items = visibleFocusables(ref.current);
    const current = items.indexOf(document.activeElement as HTMLElement);
    const atEdge = current === -1 || (e.shiftKey ? current === 0 : current === items.length - 1);
    if (!atEdge) return;
    e.preventDefault();
    items[nextFocusIndex(items.length, current, e.shiftKey)]?.focus();
  };

  if (!open) return null;

  return (
    <div className={backdropClassName} onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={className}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>
  );
}
