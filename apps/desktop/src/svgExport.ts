/**
 * Chart image as a standalone SVG, plus the print-to-PDF path.
 *
 * Charts are raster canvases, so the honest SVG form wraps the PNG in an
 * <image>; it scales cleanly and opens in any vector tool but is not
 * re-editable geometry. PDF is the browser's print-to-PDF of the same raster.
 */

const PNG_PREFIX = "data:image/png;base64,";
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const escapeXml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Width/height from the PNG IHDR chunk (bytes 16–23); throws on anything that is not a PNG data URL. */
function pngSize(dataUrl: string): { width: number; height: number } {
  if (!dataUrl.startsWith(PNG_PREFIX)) throw new Error("Not a PNG data URL");
  const payload = dataUrl.slice(PNG_PREFIX.length);
  if (!BASE64.test(payload)) throw new Error("Not a PNG data URL");
  const head = atob(payload.slice(0, 32));
  if (head.length < 24 || !head.startsWith("\x89PNG")) throw new Error("Not a PNG data URL");
  const u32 = (at: number): number =>
    ((head.charCodeAt(at) << 24) | (head.charCodeAt(at + 1) << 16) | (head.charCodeAt(at + 2) << 8) | head.charCodeAt(at + 3)) >>> 0;
  return { width: u32(16), height: u32(20) };
}

export function svgFromPng(dataUrl: string, meta: { title: string; symbol: string; resolution: string }): string {
  const { width, height } = pngSize(dataUrl);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<!-- ezyview-chart -->",
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<title>${escapeXml(`${meta.title} (${meta.symbol} ${meta.resolution})`)}</title>`,
    `<image width="${width}" height="${height}" href="${dataUrl}" xlink:href="${dataUrl}"/>`,
    "</svg>",
  ].join("\n");
}

/** Open the print dialog for the chart image (choose "Save as PDF"). No-op outside the browser. */
export function printPng(dataUrl: string, title: string): void {
  if (typeof document === "undefined" || typeof window.print !== "function") return;
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  frame.addEventListener("load", () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  });
  frame.srcdoc = `<!doctype html><title>${escapeXml(title)}</title><style>@page{margin:0}body{margin:0}img{width:100%;display:block}</style><img src="${dataUrl}" alt="">`;
  document.body.append(frame);
}
