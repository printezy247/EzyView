import type { MenuEntry } from "./Menu";
import { NAV_SECTIONS } from "./nav";
import { sectionTabsFor } from "./sectionTabs";
import { tabHref } from "./tabUrl";

/**
 * The command registry: one declaration per feature, rendered by every surface
 * that offers it. The toolbar menus build `CommandGroup[]`; the Ctrl+K palette
 * flattens them into runnable commands; the nav flyouts and (later) the
 * right-click menus read the same groups. Keeping the type here rather than in
 * `CommandPalette.tsx` is what lets the nav and the palette share it without a
 * circular import.
 */

/** A titled block of menu entries: the same data a menu and the palette render. */
export interface CommandGroup {
  title: string;
  entries: MenuEntry[];
}

/** One runnable command, flattened out of the groups for search/execute. */
export interface Command {
  /** `group:id`, unique across the registry. */
  key: string;
  group: string;
  id: string;
  label: string;
  hint: string | undefined;
  /** True when a toggle/radio entry is currently on. */
  on: boolean;
  run: () => void;
}

/**
 * Drop the non-runnable rows (headings, separators, disabled actions) and lift
 * every remaining entry into a flat command. Order is preserved, and a
 * duplicate key is not possible because `id` is unique within each group.
 */
export function flattenGroups(groups: readonly CommandGroup[]): Command[] {
  const out: Command[] = [];
  for (const group of groups) {
    for (const entry of group.entries) {
      if (entry.kind === "separator" || entry.kind === "label") continue;
      if ((entry.kind === "action" || entry.kind === "radio") && entry.disabled) continue;
      out.push({
        key: `${group.title}:${entry.id}`,
        group: group.title,
        id: entry.id,
        label: entry.label,
        hint: entry.kind === "action" ? entry.hint : undefined,
        on: entry.kind === "toggle" ? entry.checked : entry.kind === "radio" ? entry.selected : false,
        run: entry.onSelect,
      });
    }
  }
  return out;
}

/** How many runnable commands a group set exposes (what the palette lists). */
export function commandCount(groups: readonly CommandGroup[]): number {
  return flattenGroups(groups).length;
}

/**
 * "Go to <section>" commands, generated from the nav table so adding a section
 * makes it reachable from the palette with no second edit. `navigate` is
 * injected so this stays testable without a router.
 */
export function buildNavCommands(navigate: (to: string) => void = () => {}): Command[] {
  return NAV_SECTIONS.map((section) => ({
    key: `Go to:${section.to}`,
    group: "Go to",
    id: section.to,
    label: section.label,
    hint: section.description,
    on: false,
    run: () => navigate(section.to),
  }));
}

/**
 * "Go to <section> → <view>" commands.
 *
 * The section commands above only reach a page's first view, so "Markets"
 * always meant the watchlists. These reach the second level of the
 * navigation too, which is what makes a shared deep link findable from
 * inside the app and not only from outside it.
 */
export function buildSubViewCommands(navigate: (to: string) => void = () => {}): Command[] {
  const out: Command[] = [];
  for (const section of NAV_SECTIONS) {
    const tables = sectionTabsFor(section.to);
    if (!tables) continue;
    for (const tab of tables.tabs) {
      const href = tabHref(tables.path, tab.id, tables.defaultTab);
      out.push({
        key: `Go to:${href}`,
        group: "Go to",
        id: href,
        label: `${section.label} → ${tab.label}`,
        hint: tab.hint,
        on: false,
        run: () => navigate(href),
      });
    }
  }
  return out;
}
