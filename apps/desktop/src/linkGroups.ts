import type { Resolution } from "@ezyview/data-adapters";

/**
 * Chart-cell linking: cells that share a group name move together.
 *
 * A multi-cell grid without groups is a toy — you cannot show the same symbol
 * in two places and keep them in step. A group is identified by its name, so
 * "A", "B" are enough; the user picks a name per cell and the cells that
 * match are linked.
 *
 * The rules are pure functions over the chart array, so they can be tested
 * without a store, and the store's edit path reuses them directly. Only the
 * three fields a link needs are required, so the module does not depend on
 * the whole chart state.
 */

/** The fields a cell needs for linking. */
export interface LinkableChart {
  symbol: string;
  resolution: Resolution;
  linkGroup?: string;
}

/** The fields a linked update may carry. */
export interface LinkPatch {
  symbol?: string;
  resolution?: Resolution;
}

/** The group a cell belongs to, or null when it is on its own. */
export function linkGroupOf(chart: { linkGroup?: string }): string | null {
  const group = chart.linkGroup?.trim();
  return group ? group : null;
}

/**
 * The indices of every cell that shares `index`'s group, including `index`.
 *
 * A cell with no group — or whose group has only one member — links only to
 * itself, which is what "not linked" means operationally.
 */
export function linkedIndices(charts: readonly LinkableChart[], index: number): number[] {
  const target = charts[index];
  if (!target) return [];
  const group = linkGroupOf(target);
  if (!group) return [index];
  const out: number[] = [];
  for (let i = 0; i < charts.length; i++) {
    if (linkGroupOf(charts[i]!) === group) out.push(i);
  }
  return out;
}

/**
 * The distinct link group names in use, in the order they first appear.
 *
 * A cell's group is a name, so the names in use are the ones a user can
 * re-join. Sorted by first appearance rather than alphabetically, so the list
 * matches the order the groups were created in.
 */
export function groupsInUse(charts: readonly LinkableChart[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const chart of charts) {
    const group = linkGroupOf(chart);
    if (!group || seen.has(group)) continue;
    seen.add(group);
    out.push(group);
  }
  return out;
}

/**
 * `charts` with `patch` applied to every cell in `index`'s group.
 *
 * Returns the same array when nothing would change, so the caller can skip a
 * store write. The input is never mutated.
 */
export function withLinkedUpdate<T extends LinkableChart>(charts: readonly T[], index: number, patch: LinkPatch): T[] {
  const indices = linkedIndices(charts, index);
  if (indices.length === 0) return charts as T[];
  const next = charts.slice();
  for (const i of indices) {
    next[i] = { ...charts[i]!, ...patch };
  }
  return next;
}
