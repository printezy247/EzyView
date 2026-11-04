import { useRef, type ReactNode, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

interface VirtualListProps<T> {
  items: readonly T[];
  /** Stable key for an item; falls back to its index. */
  itemKey?: (item: T, index: number) => string;
  /** First-paint row height estimate; measured rows replace it. */
  estimateSize?: number;
  /** Extra rows kept mounted above and below the viewport. */
  overscan?: number;
  className?: string;
  renderItem: (item: T, index: number) => ReactNode;
  /** Accessible role for the scroll container; the rows get `listitem`. */
  role?: string;
  ariaLabel?: string;
}

/**
 * Windowing for long lists. Only the visible rows (plus a small overscan) are
 * mounted, so a 5k-row journal scrolls at the same cost as a 50-row one.
 *
 * Rows are measured as they mount: journal entries and watchlist rows differ
 * in height, and a fixed estimate would eventually drift out of alignment.
 */
export function VirtualList<T>({
  items,
  itemKey,
  estimateSize = 36,
  overscan = 8,
  className,
  renderItem,
  role = "list",
  ariaLabel,
}: VirtualListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan,
    getItemKey: (index) => {
      const item = items[index];
      return item !== undefined && itemKey ? itemKey(item, index) : index;
    },
  });

  return (
    <div ref={scrollRef} className={className} role={role} aria-label={ariaLabel}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
        {virtualizer.getVirtualItems().map((virtual) => (
          <div
            key={virtual.key}
            ref={virtualizer.measureElement}
            data-index={virtual.index}
            role={role === "list" ? "listitem" : undefined}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtual.start}px)`,
            }}
          >
            {renderItem(items[virtual.index]!, virtual.index)}
          </div>
        ))}
      </div>
    </div>
  );
}

interface VirtualTableBodyProps<T> {
  items: readonly T[];
  /** Columns spanned by the spacer rows. */
  colSpan: number;
  /** The element that owns the scrollbar (`overflow-y-auto`). */
  scrollRef: RefObject<HTMLElement | null>;
  estimateSize?: number | ((index: number) => number);
  overscan?: number;
  itemKey?: (item: T, index: number) => string;
  /** One or more table rows for an item; fragments are allowed. */
  renderRow: (item: T, index: number) => ReactNode;
}

/**
 * The same windowing for a semantic `<table>`. Spacer rows preserve the full
 * scroll height while only the visible body rows are mounted.
 *
 * `estimateSize` may be a function so an expanded row can reserve the height
 * of its detail row before it mounts.
 */
export function VirtualTableBody<T>({
  items,
  colSpan,
  scrollRef,
  estimateSize = 34,
  overscan = 8,
  itemKey,
  renderRow,
}: VirtualTableBodyProps<T>) {
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (typeof estimateSize === "function" ? estimateSize(index) : estimateSize),
    overscan,
    getItemKey: (index) => {
      const item = items[index];
      return item !== undefined && itemKey ? itemKey(item, index) : index;
    },
  });
  const virtualItems = virtualizer.getVirtualItems();
  const first = virtualItems[0];
  const last = virtualItems[virtualItems.length - 1];
  const total = virtualizer.getTotalSize();

  const spacer = (height: number, key: string) =>
    height > 0 ? (
      <tr key={key} aria-hidden>
        <td colSpan={colSpan} style={{ height, padding: 0, border: 0 }} />
      </tr>
    ) : null;

  return (
    <tbody>
      {spacer(first?.start ?? 0, "virtual-top")}
      {virtualItems.map((virtual) => (
        <VirtualRow key={virtual.key} render={() => renderRow(items[virtual.index]!, virtual.index)} />
      ))}
      {spacer(total - (last?.end ?? 0), "virtual-bottom")}
    </tbody>
  );
}

function VirtualRow({ render }: { render: () => ReactNode }) {
  return <>{render()}</>;
}
