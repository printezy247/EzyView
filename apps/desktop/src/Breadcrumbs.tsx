import { Fragment } from "react";
import { Link, useLocation } from "react-router";
import { ChevronRight } from "lucide-react";

import { NAV_SECTIONS } from "./nav";
import { sectionTabsFor } from "./sectionTabs";
import { resolveTabParam, tabHref } from "./tabUrl";
import { selectActiveSymbol } from "./store/selectors";
import { useWorkspace } from "./store";

/**
 * The breadcrumb strip: where you are, in full.
 *
 * The app has three levels of depth — a section, a sub-view, and sometimes a
 * symbol — and it used to show none of them. A trader who lands on
 * `/markets?tab=screener` from a shared link had no way to know that
 * "Screener" is a sub-view of "Markets" rather than a separate place.
 *
 * Every crumb is a link to where it points, so the strip doubles as a
 * way back up the tree.
 */
export function Breadcrumbs() {
  const location = useLocation();
  const path = location.pathname;

  // The terminal shows the focused cell's symbol instead of a sub-view: that
  // is the thing you are actually looking at. Subscribed before the early
  // return below, so the hook order never changes.
  const symbol = useWorkspace(selectActiveSymbol);

  const section = NAV_SECTIONS.find((s) => s.to === path);
  if (!section) return null;

  const tables = sectionTabsFor(path);
  const tabId = tables
    ? resolveTabParam(
        new URLSearchParams(location.search).get("tab"),
        tables.tabs.map((t) => t.id),
        tables.defaultTab,
      )
    : null;
  const tab = tables && tabId ? tables.tabs.find((t) => t.id === tabId) : null;

  const crumbs: { label: string; to?: string }[] = [{ label: section.label, to: section.to }];
  if (tab) {
    crumbs.push({ label: tab.label, to: tabHref(section.to, tab.id, tables!.defaultTab) });
  } else if (path === "/chart") {
    crumbs.push({ label: symbol });
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex h-6 shrink-0 items-center gap-1 overflow-hidden ev-bar border-b border-ev-raised bg-ev-chrome px-2 text-dense text-ev-muted"
    >
      {crumbs.map((crumb, index) => (
        <Fragment key={`${crumb.label}-${index}`}>
          {index > 0 && <ChevronRight size={11} aria-hidden className="shrink-0 text-ev-faint" />}
          {crumb.to ? (
            <Link to={crumb.to} className="shrink-0 truncate rounded transition hover:text-ev-strong">
              {crumb.label}
            </Link>
          ) : (
            <span aria-current="page" className="shrink-0 truncate font-medium text-ev-strong">
              {crumb.label}
            </span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
