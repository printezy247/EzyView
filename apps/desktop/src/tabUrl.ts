/**
 * The `?tab=` contract every multi-view page shares.
 *
 * A sub-view has to survive a reload and be shareable as a link, so the
 * selected tab lives in the URL rather than in React state. These helpers
 * are the one place that knows how a tab id and a query string fit
 * together, so a page cannot get the encoding subtly wrong.
 */

/** The tab to show: the one the URL asks for, or the page's default. */
export function resolveTabParam<T extends string>(
  requested: string | null,
  known: readonly T[],
  fallback: T,
): T {
  if (requested === null) return fallback;
  return known.includes(requested as T) ? (requested as T) : fallback;
}

/**
 * The query string for a tab. The default tab writes nothing, so the
 * default view keeps a clean URL and a copied link is still readable.
 */
export function writeTabParam(tab: string, defaultTab: string): string {
  if (tab === defaultTab) return "";
  return `?tab=${encodeURIComponent(tab)}`;
}

/** The href for a tab: the page path plus the tab, when it is not default. */
export function tabHref(path: string, tab: string, defaultTab: string): string {
  return `${path}${writeTabParam(tab, defaultTab)}`;
}
