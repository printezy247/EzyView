import type { ExportSource } from "./exportBridge";
import { candlesToCsv, candlesToJson } from "./chartDataExport";

/**
 * Make a user-provided name safe for a download filename: strip all C0
 * control chars and the Windows-reserved set, trim, and fall back when
 * nothing valid remains. Shared by every export path (Pine scripts, chart
 * PNGs, later CSVs) so one rule governs them all.
 */
export function sanitizeExportFilename(name: string, fallback: string): string {
  // Filter, not a regex: matching C0 controls in a character class trips
  // no-control-regex.
  const cleaned = [...name]
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      if (code <= 0x1f) return false; // C0 controls, incl. NUL, \t, \r, \n
      return !'<>:"/\\|?*'.includes(ch);
    })
    .join("")
    .trim();
  return cleaned || fallback;
}

/** Save name for a chart PNG: `chart-<symbol>-<resolution>.png`. */
export function chartPngFilename(meta: { symbol: string; resolution: string }): string {
  return `${sanitizeExportFilename(`chart-${meta.symbol}-${meta.resolution}`, "chart")}.png`;
}

/**
 * Trigger a browser download of a Blob via the anchor idiom. No-op outside
 * the browser (vitest runs in node). Task 6 swaps the interior for the Tauri
 * save dialog; the signature stays.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Trigger a browser download of a data URL (the PNG save path): the href is
 * the payload itself — no fetch, no Blob conversion.
 */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  if (typeof document === "undefined") return;
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

/** Save an export source's composited chart as a PNG download. */
export function saveChartPng(source: ExportSource): void {
  const png = source.getPng();
  if (!png) return;
  downloadDataUrl(png, chartPngFilename(source.meta()));
}

/** Save name for chart data: `chart-<symbol>-<resolution>.<ext>`. */
export function chartDataFilename(meta: { symbol: string; resolution: string }, ext: "csv" | "json"): string {
  return `${sanitizeExportFilename(`chart-${meta.symbol}-${meta.resolution}`, "chart")}.${ext}`;
}

/** Save the bars the user can see (replay-sliced) as CSV. */
export function saveChartCsv(source: ExportSource): void {
  const blob = new Blob([candlesToCsv(source.getCandles())], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, chartDataFilename(source.meta(), "csv"));
}

/** Save the bars the user can see (replay-sliced) as JSON. */
export function saveChartJson(source: ExportSource): void {
  const blob = new Blob([candlesToJson(source.getCandles(), source.meta())], { type: "application/json" });
  downloadBlob(blob, chartDataFilename(source.meta(), "json"));
}
