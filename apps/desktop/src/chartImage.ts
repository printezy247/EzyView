/**
 * Chart snapshot compositing.
 *
 * The chart is plain canvases on an opaque background: composite every layer
 * (price panes, scale, volume, drawings overlays) into one image so a note or
 * an export keeps what the user was actually looking at.
 *
 * This is the container compositor both journal capture and the export
 * bridge's `getPng` use, so the two can never drift apart. The engine also
 * exposes `EzyChart.takeScreenshot()` (lightweight-charts `IChartApi.takeScreenshot`,
 * typings.d.ts:1767) as the single-pane alternative — it misses layers drawn
 * on their own canvases, which is exactly what this function exists to keep.
 */
export function compositeCanvasesToPng(container: Element, background = "#0e1117"): string | null {
  if (typeof document === "undefined") return null;
  const canvases = [...container.querySelectorAll("canvas")].filter((c): c is HTMLCanvasElement => c instanceof HTMLCanvasElement);
  if (canvases.length === 0) return null;

  const hostRect = container.getBoundingClientRect();
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(hostRect.width));
  out.height = Math.max(1, Math.round(hostRect.height));
  const ctx = out.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);
  for (const canvas of canvases) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    try {
      ctx.drawImage(canvas, rect.left - hostRect.left, rect.top - hostRect.top, rect.width, rect.height);
    } catch {
      // A zero-sized or backing-store-less layer is skipped, never fatal.
    }
  }
  try {
    return out.toDataURL("image/png");
  } catch {
    return null;
  }
}
