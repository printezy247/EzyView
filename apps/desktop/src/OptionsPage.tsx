import { Suspense, lazy } from "react";
import { useNavigate } from "react-router";
import { activeChartOf } from "./layout";
import { useWorkspace } from "./store";

const OptionsPanel = lazy(() => import("./OptionsPanel").then((m) => ({ default: m.OptionsPanel })));

/** Options chain as a full-page destination, keyed to the active chart symbol. */
export function OptionsPage() {
  const navigate = useNavigate();
  const layout = useWorkspace((s) => s.activeLayout());
  const state = activeChartOf(layout);
  return (
    <Suspense fallback={null}>
      <OptionsPanel symbol={state.symbol} onClose={() => navigate("/chart")} />
    </Suspense>
  );
}
