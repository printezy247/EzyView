import type { CSSProperties, ReactNode } from "react";
import { useLocation } from "react-router";

import { ErrorBoundary } from "./ErrorBoundary";
import { Button } from "./ui";

/**
 * The routed page area's shell: the error net and the route-change fade.
 *
 * Every lazy route is wrapped in its own `ErrorBoundary`, so a crash on one
 * page does not take the shell (rail, tabs, toolbar, dialogs) down with it.
 * Each page keeps a small fallback of its own, phrased for that page.
 *
 * The fade is keyed on the section, not the tab: switching between the tabs
 * of a page already re-renders the content, and fading there would feel like
 * the page was reloaded. Moving between sections is an animation worth
 * having, and it is removed — not shortened — when the user asked for no
 * motion, because a reduced-motion request is a request for no animation.
 */

const FALLBACK_COPY: Record<string, { title: string; detail: string }> = {
  "/chart": {
    title: "Chart render encountered an error.",
    detail: "A chart error was caught and isolated so the rest of the application remains functional.",
  },
  "/markets": {
    title: "Markets failed to load.",
    detail: "The watchlist, screener and heatmap share one data path; the rest of the app is untouched.",
  },
  "/trade": {
    title: "Trade failed to load.",
    detail: "The order ticket and blotter share the trading store; the chart is untouched.",
  },
  "/research": {
    title: "Research failed to load.",
    detail: "Fundamentals, options and news load from provider adapters that can fail one at a time.",
  },
  "/journal": {
    title: "Journal failed to load.",
    detail: "Your journal entries are stored locally and are not affected.",
  },
  "/strategies": {
    title: "Strategies failed to load.",
    detail: "The Pine editor and the tester share the transpiler; saved scripts are unaffected.",
  },
  "/alerts": {
    title: "Alerts failed to load.",
    detail: "Armed alerts are stored locally and are not affected.",
  },
  "/settings": {
    title: "Settings failed to load.",
    detail: "Nothing here is destructive, but a settings page is the one place a reload is safe.",
  },
};

/**
 * The section-change fade. The keyframe is declared in styles.css, and the
 * reduced-motion rule there removes it too, so the component does not branch
 * on the setting itself: it states what the animation is, the stylesheet
 * decides whether it plays.
 */
const FADE_STYLE: CSSProperties = { animation: "ev-route-in 120ms ease-out" };

export function RouteShell({
  onResetChart,
  children,
}: {
  onResetChart?: () => void;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const section = pathname === "/" ? "/chart" : pathname;
  const copy = FALLBACK_COPY[section];

  return (
    <div key={section} className="flex min-h-0 flex-1 flex-col" style={FADE_STYLE}>
      <ErrorBoundary
        fallback={(reset) => (
          <div
            role="alert"
            className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-ev-bg p-6 text-center"
          >
            <p className="text-body font-semibold text-ev-strong">{copy?.title ?? "This section failed to load."}</p>
            <p className="max-w-md text-base text-ev-muted">
              {copy?.detail ?? "The rest of the app is still running. Retry this section, or pick another one from the rail."}
            </p>
            <div className="flex items-center gap-2">
              <Button size="lg" onClick={reset}>
                Retry
              </Button>
              {section === "/chart" && onResetChart && (
                <Button size="lg" variant="ghost" onClick={onResetChart} className="bg-ev-raised text-ev-strong hover:bg-ev-line">
                  Reset chart to a clean state
                </Button>
              )}
              <Button size="lg" variant="ghost" onClick={() => window.location.reload()} className="bg-ev-raised text-ev-strong hover:bg-ev-line">
                Reload app
              </Button>
            </div>
          </div>
        )}
      >
        {children}
      </ErrorBoundary>
    </div>
  );
}

export default RouteShell;
