import { useEffect, useRef } from "react";
import type { RefObject } from "react";

/**
 * Popup plumbing shared by every floating surface (menu, select, combobox,
 * popover, tooltip). One positioner and one dismiss rule means a dropdown in
 * the toolbar and a dropdown in a dialog behave the same.
 */

export interface PopupPlacement {
  top: number;
  left: number;
  minWidth?: number;
  width?: number;
  maxHeight: string;
}

/**
 * Place a popup under its trigger, inside the window.
 *
 * `width` pins it to the trigger (a combobox should be as wide as its input);
 * otherwise it grows to at least `minWidth`. The result is shifted left when
 * the popup would overflow the right edge and lifted above the trigger when
 * there is no room below.
 */
export function popupPosition(
  trigger: HTMLElement | null,
  options: { align?: "left" | "right"; minWidth?: number; width?: number; gap?: number } = {},
): PopupPlacement {
  const { align = "left", minWidth = 176, width, gap = 4 } = options;
  if (!trigger) return { top: 0, left: 8, minWidth, maxHeight: "70vh" };
  const rect = trigger.getBoundingClientRect();
  const popupWidth = width ?? Math.max(minWidth, rect.width);
  const maxLeft = Math.max(8, window.innerWidth - popupWidth - 8);
  const left = align === "right" ? Math.max(8, Math.min(rect.right - popupWidth, maxLeft)) : Math.max(8, Math.min(rect.left, maxLeft));

  const spaceBelow = window.innerHeight - rect.bottom - gap;
  const estimated = 260;
  const above = spaceBelow < Math.min(estimated, 160) && rect.top > spaceBelow;
  const top = above ? Math.max(8, rect.top - gap - Math.min(estimated, rect.top - 8)) : rect.bottom + gap;

  return {
    top,
    left,
    ...(width === undefined ? { minWidth } : { width: popupWidth }),
    maxHeight: above ? "min(70vh, 340px)" : "min(70vh, 420px)",
  };
}

/**
 * Close `onClose` when the pointer goes down outside all of `refs`, or when the
 * window is resized/scrolled (a popup anchored to a moved trigger is stale).
 */
export function usePopupDismiss(
  open: boolean,
  onClose: () => void,
  refs: readonly RefObject<HTMLElement | null>[],
  options: { closeOnScroll?: boolean } = {},
): void {
  const { closeOnScroll = true } = options;
  // Keep the latest callback without re-binding listeners on every render.
  const latest = useRef(onClose);
  latest.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (refs.some((r) => r.current?.contains(target))) return;
      latest.current();
    };
    const onScroll = () => latest.current();
    const onResize = () => latest.current();
    document.addEventListener("mousedown", onDown);
    if (closeOnScroll) {
      window.addEventListener("resize", onResize);
      window.addEventListener("scroll", onScroll, true);
    }
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
    // `refs` is a stable array from the caller; its identity is not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, closeOnScroll]);
}

/** Wrap an index into `count`, returning -1 for an empty list. */
export function wrapIndex(count: number, index: number): number {
  if (count === 0) return -1;
  return ((index % count) + count) % count;
}

/**
 * Typeahead: accumulate printable keys for a moment and pick the first option
 * whose label starts with them. Returns the new index, or null when the key is
 * not part of a match.
 */
export function typeaheadIndex(labels: readonly string[], buffer: string, from: number): number | null {
  if (buffer === "") return null;
  const needle = buffer.toLowerCase();
  for (let step = 0; step < labels.length; step += 1) {
    const index = wrapIndex(labels.length, from + step);
    const label = labels[index];
    if (label !== undefined && label.toLowerCase().startsWith(needle)) return index;
  }
  return null;
}
