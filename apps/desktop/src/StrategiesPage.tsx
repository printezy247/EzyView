import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { Candle } from "@ezyview/data-adapters";
import { activeChartOf } from "./layout";
import { useWorkspace } from "./store";
import { loadHistory } from "./data";

const PineEditor = lazy(() => import("./PineEditor").then((m) => ({ default: m.PineEditor })));

/**
 * Strategies destination: the Pine editor, strategy tester and optimizer.
 * Owns the bars-loading that used to sit in the shell — the active symbol's
 * history is fetched on demand so the terminal route never pays for it.
 */
export function StrategiesPage() {
  const navigate = useNavigate();
  const layout = useWorkspace((s) => s.activeLayout());
  const state = activeChartOf(layout);
  const appTheme = useWorkspace((s) => s.appTheme);
  const uiTheme: "dark" | "light" | "tokyo" = appTheme === "auto" ? state.theme : appTheme;
  const [bars, setBars] = useState<Candle[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadHistory(state.symbol, state.resolution)
      .then((candles) => {
        if (!cancelled) setBars(candles);
      })
      .catch(() => {
        if (!cancelled) setBars([]);
      });
    return () => {
      cancelled = true;
    };
  }, [state.symbol, state.resolution]);

  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-dense text-ev-muted">Loading Pine Editor…</div>}>
      <PineEditor onClose={() => navigate("/chart")} bars={bars} symbol={state.symbol} uiTheme={uiTheme} />
    </Suspense>
  );
}
