import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { MenuItems } from "./Menu";
import type { MenuEntry } from "./Menu";
import { useShortcut, useShortcutLayer } from "./shortcuts";

interface Props {
  /** Pointer position in viewport pixels where the menu was requested. */
  x: number;
  y: number;
  entries: MenuEntry[];
  onClose: () => void;
}

const MARGIN = 8;

/**
 * Right-click menu for the chart. Opens at the pointer, shifted so it stays on
 * screen; arrows/Home/End move, Enter/Space pick, Escape or a click elsewhere
 * closes. It scrolls when taller than the window.
 */
export function ChartContextMenu({ x, y, entries, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const layer = useShortcutLayer("context-menu");

  useShortcut({
    id: "context-menu.escape",
    combo: "Escape",
    layer,
    stopPropagation: true,
    run: onClose,
  });

  // Measure after the first paint, then clamp into the viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN)),
      top: Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN)),
    });
  }, [x, y, entries.length]);

  const items = (): HTMLButtonElement[] => [...(ref.current?.querySelectorAll<HTMLButtonElement>("[data-menu-item]:not(:disabled)") ?? [])];

  useEffect(() => {
    items()[0]?.focus();
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = (delta: number) => {
    const all = items();
    if (all.length === 0) return;
    const current = all.indexOf(document.activeElement as HTMLButtonElement);
    all[current === -1 ? (delta > 0 ? 0 : all.length - 1) : (current + delta + all.length) % all.length]?.focus();
  };

  const onListKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      items()[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items().at(-1)?.focus();
    } else if (e.key === "Tab") {
      e.preventDefault();
      onClose();
    }
  };

  const pick = (entry: MenuEntry) => {
    onClose();
    if ("onSelect" in entry) entry.onSelect();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Chart menu"
      onKeyDown={onListKey}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-50 max-h-[calc(100vh-16px)] min-w-56 overflow-y-auto whitespace-nowrap rounded border border-ev-line bg-ev-panel py-1 shadow-xl"
    >
      <MenuItems entries={entries} onPick={pick} />
    </div>
  );
}
