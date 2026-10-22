/**
 * Deal history → journal trades.
 *
 * Both feeds hand over raw deals; a journal wants trades. The grouping key is
 * the broker's position id when it has one (MT5 always does), falling back to
 * pairing deals in time order so the paper feed works too.
 */
import type { Deal } from "@ezyview/data-adapters";
import type { JournalEntry } from "./model";

interface Group {
  key: string;
  deals: Deal[];
}

const isSound = (d: Deal): boolean =>
  [d.qty, d.price, d.pnl, d.time].every((n) => typeof n === "number" && Number.isFinite(n));

export function entriesFromDeals(deals: readonly Deal[], source?: JournalEntry["source"]): JournalEntry[] {
  const ordered = deals.filter(isSound).sort((a, b) => a.time - b.time);
  const groups = new Map<string, Group>();
  const ungrouped: Deal[] = [];

  for (const deal of ordered) {
    const key = deal.positionId
      ? `pos:${deal.positionId}`
      : deal.pnl !== 0
        ? `deal:${deal.id}`
        : "";
    if (!key) {
      ungrouped.push(deal);
      continue;
    }
    const group = groups.get(key) ?? { key, deals: [] };
    group.deals.push(deal);
    groups.set(key, group);
  }

  const entries = [...groups.values()].map((group) => fromGroup(group, source));

  // Deals with no position id and a zero P&L are pure legs (fee, swap); keep
  // them only when they carry realized P&L, as their own closed row.
  for (const deal of ungrouped) {
    if (deal.pnl === 0 && (deal.commission ?? 0) === 0 && (deal.swap ?? 0) === 0) continue;
    entries.push({
      id: `deal:${deal.id}`,
      symbol: deal.symbol,
      side: deal.side === "buy" ? "long" : "short",
      qty: deal.qty,
      entryPrice: deal.price,
      exitPrice: deal.price,
      entryTime: deal.time,
      exitTime: deal.time,
      pnl: deal.pnl,
      fees: (deal.commission ?? 0) + (deal.swap ?? 0),
      source,
    });
  }

  return [...entries].sort((a, b) => b.entryTime - a.entryTime);
}

function fromGroup(group: Group, source?: JournalEntry["source"]): JournalEntry {
  const [first, ...rest] = group.deals;
  const last = group.deals[group.deals.length - 1] ?? first;
  const head = first as Deal;
  const tail = last as Deal;

  const fees = group.deals.reduce((sum, deal) => sum + (deal.commission ?? 0) + (deal.swap ?? 0), 0);
  const pnl = group.deals.reduce((sum, deal) => sum + deal.pnl, 0);
  // A lone deal that already carries P&L is a complete round trip (paper feed
  // without position ids); a lone entry leg with no P&L is still open.
  const closed = rest.length > 0 || head.pnl !== 0;

  // A lone closing deal (e.g. from an engine that only logged exits):
  // selling closes a long position; buying closes a short position.
  const isLoneClosingDeal = rest.length === 0 && head.pnl !== 0;
  const side = isLoneClosingDeal
    ? (head.side === "sell" ? "long" : "short")
    : (head.side === "buy" ? "long" : "short");

  const openingDeals = rest.length > 0 ? group.deals.filter((d) => d.side === head.side) : [head];
  const totalQty = openingDeals.reduce((sum, d) => sum + d.qty, 0);
  const totalNotional = openingDeals.reduce((sum, d) => sum + d.qty * d.price, 0);
  const entryPrice = totalQty > 0 ? totalNotional / totalQty : head.price;

  const entry: JournalEntry = {
    id: group.key,
    symbol: head.symbol,
    side,
    qty: totalQty,
    entryPrice,
    entryTime: head.time,
    source,
  };
  if (fees !== 0) entry.fees = fees;

  if (closed) {
    entry.exitPrice = tail.price;
    entry.exitTime = tail.time;
    entry.pnl = pnl;
  }
  return entry;
}

/** Ids worth skipping when importing: the journal already holds them. */
export function existingKeys(entries: readonly JournalEntry[]): Set<string> {
  return new Set(entries.map((entry) => entry.id));
}
