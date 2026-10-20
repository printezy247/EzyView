import { Suspense, lazy } from "react";
import { useNavigate } from "react-router";
import { activeChartOf } from "./layout";
import { useWorkspace } from "./store";

const FundamentalsPanel = lazy(() => import("./FundamentalsPanel").then((m) => ({ default: m.FundamentalsPanel })));

/**
 * Fundamentals & screener as a full-page destination. The symbol it shows
 * follows the active chart; picking one updates the workspace like the old
 * bottom panel did.
 */
export function FundamentalsPage() {
  const navigate = useNavigate();
  const layout = useWorkspace((s) => s.activeLayout());
  const state = activeChartOf(layout);
  const updateActive = useWorkspace((s) => s.updateActive);
  return (
    <Suspense fallback={null}>
      <FundamentalsPanel
        symbol={state.symbol}
        onClose={() => navigate("/chart")}
        onPickSymbol={(symbol) => updateActive({ symbol })}
      />
    </Suspense>
  );
}
