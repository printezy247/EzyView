import { Suspense, lazy } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { activeChartOf } from "./layout";
import { useWorkspace } from "./store";
import { Button } from "./ui";

const FundamentalsPanel = lazy(() => import("./FundamentalsPanel").then((m) => ({ default: m.FundamentalsPanel })));
const OptionsPanel = lazy(() => import("./OptionsPanel").then((m) => ({ default: m.OptionsPanel })));

type Tab = "fundamentals" | "options" | "calendar" | "news";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "fundamentals", label: "Fundamentals", hint: "Financials, screener and company profile" },
  { id: "options", label: "Options", hint: "Chain, greeks and expiry payoff" },
  { id: "calendar", label: "Calendar", hint: "Economic events and earnings dates" },
  { id: "news", label: "News", hint: "Headlines for the active symbol" },
];

/**
 * Research destination: the panels that used to be separate routes
 * (`/fundamentals`, `/options`) now share one page with a tab strip, and gain
 * the calendar and news views that used to hide behind the fundamentals panel.
 * `?tab=` deep-links a view, which is what the toolbar's Research menu uses.
 */
export function ResearchPage() {
  const navigate = useNavigate();
  const layout = useWorkspace((s) => s.activeLayout());
  const state = activeChartOf(layout);
  const setSymbol = useWorkspace((s) => s.setSymbol);
  const [params, setParams] = useSearchParams();
  const requested = TABS.find((t) => t.id === params.get("tab"))?.id;
  const tab: Tab = requested ?? "fundamentals";

  return (
    <section aria-label="Research" className="flex min-h-0 flex-1 flex-col text-base">
      <div
        role="tablist"
        aria-label="Research views"
        className="flex shrink-0 items-center gap-1 border-b border-ev-raised px-3 py-1.5"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            title={t.hint}
            onClick={() => setParams(t.id === "fundamentals" ? {} : { tab: t.id }, { replace: true })}
            className={
              tab === t.id
                ? "rounded bg-ev-raised px-2.5 py-1 text-dense font-medium text-ev-strong"
                : "rounded px-2.5 py-1 text-dense text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
            }
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-2">
          <span className="text-dense text-ev-faint">{state.symbol}</span>
          <Button variant="outline" size="sm" onClick={() => navigate("/chart")}>
            Back to chart
          </Button>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <Suspense fallback={<div role="status" className="p-6 text-base text-ev-muted">Loading…</div>}>
          {tab === "fundamentals" && (
            <FundamentalsPanel
              symbol={state.symbol}
              onClose={() => navigate("/chart")}
              onPickSymbol={(symbol) => setSymbol(symbol)}
            />
          )}
          {tab === "options" && <OptionsPanel symbol={state.symbol} onClose={() => navigate("/chart")} />}
          {tab === "calendar" && <ResearchCalendar symbol={state.symbol} />}
          {tab === "news" && <ResearchNews symbol={state.symbol} />}
        </Suspense>
      </div>
    </section>
  );
}

const ResearchCalendar = lazy(() => import("./ResearchCalendar").then((m) => ({ default: m.ResearchCalendar })));
const ResearchNews = lazy(() => import("./ResearchNews").then((m) => ({ default: m.ResearchNews })));
