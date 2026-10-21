import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { Candle } from "@ezyview/data-adapters";
import { PineEditor } from "./PineEditor";
import { activeChartOf } from "./layout";
import { useWorkspace } from "./store";
import { loadHistory } from "./data";

/**
 * Pine editor route. Owns the bars-loading that used to sit in the shell:
 * the active symbol's history is fetched on demand so the editor can run and
 * backtest without the chart page paying for it.
 */
export function PinePage() {
  const navigate = useNavigate();
  const layout = useWorkspace((s) => s.activeLayout());
  const state = activeChartOf(layout);
  const appTheme = useWorkspace((s) => s.appTheme);
  const uiTheme: "dark" | "light" | "tokyo" = appTheme === "auto" ? state.theme : appTheme;
  const [bars, setBars] = useState<Candle[]>([]);

  // Load bars for the Pine editor on demand — not on every chart tick.
  useEffect(() => {
    let cancelled = false;
    void loadHistory(state.symbol, state.resolution).then((candles) => {
      if (!cancelled) setBars(candles);
    });
    return () => {
      cancelled = true;
    };
  }, [state.symbol, state.resolution]);

  return (
    <PineEditor
      onClose={() => navigate("/chart")}
      bars={bars}
      symbol={state.symbol}
      uiTheme={uiTheme}
    />
  );
}
