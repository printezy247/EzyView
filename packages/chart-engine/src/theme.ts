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
  paneSeparator: string;
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
  paneSeparator: "#2a2e39",
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
  paneSeparator: "#e0e3eb",
};

/**
 * Cycle through a fixed, contrast-checked palette so the Nth indicator still
 * reads against the dark background.
 */
export const INDICATOR_COLORS = [
  "#2962ff",
  "#ff9800",
  "#4caf50",
  "#e91e63",
  "#00bcd4",
  "#9c27b0",
  "#8bc34a",
  "#ffc107",
  "#03a9f4",
  "#f44336",
  "#795548",
  "#607d8b",
  "#cddc39",
  "#ff5722",
  "#3f51b5",
  "#009688",
];

export function colorAt(index: number): string {
  return INDICATOR_COLORS[index % INDICATOR_COLORS.length]!;
}
