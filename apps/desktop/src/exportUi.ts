import type { ExportSource } from "./exportBridge";
import { candlesToCsv, candlesToJson } from "./chartDataExport";
import type { Layout } from "./layout";
import { embedSnippet } from "./embedSnippet";
import { buildShareLink } from "./shareLink";
import { printPng, svgFromPng } from "./svgExport";
import { exportLayoutJson } from "./layoutShare";
import { notice } from "./notice";

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
 * the browser (vitest runs in node). Exporters go through `saveBlob`, which
 * calls this outside Tauri.
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

/** Decode a base64 data URL into a Blob (the PNG save path under Tauri needs bytes). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? "application/octet-stream";
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

/** Dialog filter for a file name: `chart.png` → `{ name: "PNG", extensions: ["png"] }`. */
export function saveFilterFor(filename: string): { name: string; extensions: string[] } {
  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".") + 1).toLowerCase() : "";
  return ext ? { name: ext.toUpperCase(), extensions: [ext] } : { name: "All files", extensions: ["*"] };
}

const inTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type SaveResult = "saved" | "cancelled" | "failed";

/**
 * The one save path every exporter uses. In the browser: the anchor download.
 * Under Tauri: the native "where to save" dialog (run in Rust) and a write;
 * cancelling aborts cleanly with no file, and failures alert the user.
 */
export async function saveBlob(blob: Blob, filename: string): Promise<SaveResult> {
  if (!inTauri()) {
    downloadBlob(blob, filename);
    return "saved";
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const filter = saveFilterFor(filename);
    const saved = await invoke<boolean>("save_file", {
      defaultName: filename,
      filterName: filter.name,
      extensions: filter.extensions,
      bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
    });
    return saved ? "saved" : "cancelled";
  } catch (e) {
    notice.alert(`Could not save ${filename}`, e instanceof Error ? e.message : String(e));
    return "failed";
  }
}

/** Save an export source's composited chart as a PNG. */
export function saveChartPng(source: ExportSource): void {
  const png = source.getPng();
  if (!png) return;
  void saveBlob(dataUrlToBlob(png), chartPngFilename(source.meta()));
}

/** Save name for chart data: `chart-<symbol>-<resolution>.<ext>`. */
export function chartDataFilename(meta: { symbol: string; resolution: string }, ext: "csv" | "json"): string {
  return `${sanitizeExportFilename(`chart-${meta.symbol}-${meta.resolution}`, "chart")}.${ext}`;
}

/** Save the bars the user can see (replay-sliced) as CSV. */
export function saveChartCsv(source: ExportSource): void {
  const blob = new Blob([candlesToCsv(source.getCandles())], { type: "text/csv;charset=utf-8" });
  void saveBlob(blob, chartDataFilename(source.meta(), "csv"));
}

/** Save the bars the user can see (replay-sliced) as JSON. */
export function saveChartJson(source: ExportSource): void {
  const blob = new Blob([candlesToJson(source.getCandles(), source.meta())], { type: "application/json" });
  void saveBlob(blob, chartDataFilename(source.meta(), "json"));
}

/** Save the layout as a shareable JSON file. */
export function saveLayoutJson(layout: Layout): void {
  const blob = new Blob([exportLayoutJson(layout)], { type: "application/json" });
  void saveBlob(blob, `${sanitizeExportFilename(`layout-${layout.name}`, "layout")}.json`);
}

/**
 * Ask for a text file and resolve with its contents; null when cancelled or
 * outside the browser. The picker is a transient <input type=file>, the same
 * idiom the object tree's drawings import uses.
 */
export function pickTextFile(accept: string): Promise<string | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.text().then(resolve, () => resolve(null));
    });
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

/**
 * Copy text to the clipboard. The async clipboard API is absent on insecure
 * origins and in some webviews; then the text downloads as a .txt instead so
 * the user is never left with nothing. Never throws.
 */
export async function copyText(text: string, fallbackName: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or document not focused: fall through to the download.
  }
  downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), fallbackName);
  return false;
}

/** Link that reopens this chart's symbol and interval in the app. */
export function chartShareLink(source: ExportSource): string {
  return buildShareLink(`${window.location.origin}${window.location.pathname}`, source.meta());
}

/** Copy the focused chart's share link. */
export function copyChartLink(source: ExportSource): void {
  void copyText(chartShareLink(source), "chart-link.txt");
}

/** Copy an iframe embed snippet that points at the chart's share link. */
export function copyChartEmbed(source: ExportSource): void {
  void copyText(embedSnippet({ src: chartShareLink(source) }), "chart-embed.html");
}

const imageMeta = (source: ExportSource) => {
  const { symbol, resolution } = source.meta();
  return { title: "EzyView chart", symbol, resolution };
};

/** Save the focused chart as a standalone SVG wrapping the PNG capture. */
export function saveChartSvg(source: ExportSource): void {
  const png = source.getPng();
  if (!png) return;
  const blob = new Blob([svgFromPng(png, imageMeta(source))], { type: "image/svg+xml" });
  void saveBlob(blob, chartPngFilename(source.meta()).replace(/\.png$/, ".svg"));
}

/** Open the print dialog for the focused chart (Save as PDF). */
export function printChart(source: ExportSource): void {
  const png = source.getPng();
  if (png) printPng(png, `${source.meta().symbol} ${source.meta().resolution}`);
}
