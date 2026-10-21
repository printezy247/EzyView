import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { Candle } from "@ezyview/data-adapters";
import { PineEditor } from "./PineEditor";
import { activeChartOf } from "./layout";
import { useWorkspace } from "./store";
import { loadHistory } from "./data";

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
    void loadHistory(state.symbol, state.resolution).then((candles) => {
      if (!cancelled) setBars(candles);
    });
    return () => {
      cancelled = true;
    };
  }, [state.symbol, state.resolution]);

  return <PineEditor onClose={() => navigate("/chart")} bars={bars} symbol={state.symbol} uiTheme={uiTheme} />;
}
