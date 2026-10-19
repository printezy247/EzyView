/**
 * EzyView chart engine.
 *
 * Thin, typed wrapper around TradingView Lightweight Charts v5 plus the
 * multi-pane, indicator-overlay and drawing-plugin plumbing the terminal needs.
 * Concrete implementations land in P1.
 */

export interface ChartTheme {
  background: string;
  textColor: string;
  grid: string;
  crosshair: string;
  upColor: string;
  downColor: string;
  borderUpColor: string;
  borderDownColor: string;
  wickUpColor: string;
  wickDownColor: string;
}

export const DARK_THEME: ChartTheme = {
  background: "#0e1117",
  textColor: "#d1d4dc",
  grid: "#1e222d",
  crosshair: "#758696",
  upColor: "#26a69a",
  downColor: "#ef5350",
  borderUpColor: "#26a69a",
  borderDownColor: "#ef5350",
  wickUpColor: "#26a69a",
  wickDownColor: "#ef5350",
};

export const LIGHT_THEME: ChartTheme = {
  background: "#ffffff",
  textColor: "#131722",
  grid: "#e0e3eb",
  crosshair: "#9598a1",
  upColor: "#26a69a",
  downColor: "#ef5350",
  borderUpColor: "#26a69a",
  borderDownColor: "#ef5350",
  wickUpColor: "#26a69a",
  wickDownColor: "#ef5350",
};
