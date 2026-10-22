export type WatchSortField = "none" | "symbol" | "price" | "change";

interface Sortable {
  ticker: string;
  price: number | null;
  changePct: number | null;
}

/** Sort watchlist rows; missing quotes always sink to the bottom, ties fall back to ticker. */
export function sortWatch<T extends Sortable>(rows: T[], field: WatchSortField, desc: boolean): T[] {
  if (field === "none") return rows;
  return [...rows].sort((a, b) => {
    if (field !== "symbol") {
      const x = field === "price" ? a.price : a.changePct;
      const y = field === "price" ? b.price : b.changePct;
      if (x === null && y === null) return a.ticker.localeCompare(b.ticker);
      if (x === null) return 1;
      if (y === null) return -1;
      if (x !== y) return desc ? y - x : x - y;
      return a.ticker.localeCompare(b.ticker);
    }
    const d = a.ticker.localeCompare(b.ticker);
    return desc ? -d : d;
  });
}
