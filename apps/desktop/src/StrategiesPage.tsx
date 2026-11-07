import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { Candle } from "@ezyview/data-adapters";
import { useWorkspace } from "./store";
import { useActiveChart } from "./store/selectors";
import { loadHistory } from "./data";

const PineEditor = lazy(() => import("./PineEditor").then((m) => ({ default: m.PineEditor })));

/**
 * Strategies destination: the Pine editor, strategy tester and optimizer.
 * Owns the bars-loading that used to sit in the shell — the active symbol's
 * history is fetched on demand so the terminal route never pays for it.
 */
export function StrategiesPage() {
  const navigate = useNavigate();
  const { symbol, resolution, theme: chartTheme } = useActiveChart((c) => ({
    symbol: c.symbol,
    resolution: c.resolution,
    theme: c.theme,
  }));
  const appTheme = useWorkspace((s) => s.appTheme);
  const uiTheme: "dark" | "light" | "tokyo" = appTheme === "auto" ? chartTheme : appTheme;
  const [bars, setBars] = useState<Candle[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadHistory(symbol, resolution)
      .then((candles) => {
        if (!cancelled) setBars(candles);
      })
      .catch(() => {
        if (!cancelled) setBars([]);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, resolution]);

  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-dense text-ev-muted">Loading Pine Editor…</div>}>
      <PineEditor onClose={() => navigate("/chart")} bars={bars} symbol={symbol} uiTheme={uiTheme} />
    </Suspense>
  );
}
