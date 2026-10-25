import type { Drawing, DrawingStyle, ScreenPoint } from "@ezyview/drawing-tools";
import { advancedFigure, isAdvancedTool } from "@ezyview/drawing-tools";

export interface AdvancedPaintOptions {
  isPreview: boolean;
  /** Decoded image assets, keyed by `drawing.image.assetId`. */
  images?: ReadonlyMap<string, CanvasImageSource>;
}

const lineDash = (style: DrawingStyle["lineStyle"]): number[] =>
  style === "dashed" ? [6, 4] : style === "dotted" ? [2, 3] : [];

const withAlpha = (hex: string, alpha: number): string => {
  const value = hex.replace("#", "");
  if (value.length !== 6) return hex;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
};

function strokePolyline(ctx: CanvasRenderingContext2D, points: readonly ScreenPoint[], close = false): void {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  if (close) ctx.closePath();
  ctx.stroke();
}

/**
 * Paint one advanced drawing. Returns false when the tool is not part of the
 * advanced packs, so the caller can fall through to the original renderer.
 */
export function paintAdvanced(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  pts: readonly (ScreenPoint | null)[],
  width: number,
  height: number,
  opts: AdvancedPaintOptions,
): boolean {
  if (!isAdvancedTool(drawing.tool)) return false;
  const style = drawing.style;
  const figure = advancedFigure(drawing, pts);
  const opacity = (style.opacity ?? 100) / 100;
  const stroke = withAlpha(style.color, opacity);
  const fill = withAlpha(style.fill ?? style.color, (style.fillOpacity ?? 20) / 100);
  const dash = lineDash(style.lineStyle);

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (opts.isPreview) {
    ctx.globalAlpha = 0.85;
    if (dash.length === 0) ctx.setLineDash([5, 4]);
  }

  // Enclosed areas first, so their outlines sit on top.
  for (const polygon of figure.polygons) {
    if (polygon.length < 3) continue;
    ctx.beginPath();
    ctx.moveTo(polygon[0]!.x, polygon[0]!.y);
    for (const point of polygon.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.closePath();
    ctx.fillStyle = drawing.tool === "image" ? withAlpha(style.color, 0.08) : fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, style.width);
    ctx.setLineDash(dash);
    ctx.stroke();
  }

  for (const segment of figure.segments) {
    ctx.strokeStyle = segment.color ? withAlpha(segment.color, opacity) : stroke;
    ctx.lineWidth = Math.max(1, segment.width ?? style.width);
    ctx.setLineDash(segment.dashed ? [4, 4] : dash);
    strokePolyline(ctx, segment.points, segment.close);
  }

  for (const arc of figure.arcs) {
    ctx.beginPath();
    ctx.arc(arc.centre.x, arc.centre.y, Math.max(1, arc.radius), arc.start, arc.end);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, style.width);
    ctx.setLineDash(arc.start === 0 && arc.end === Math.PI * 2 ? [] : dash);
    ctx.stroke();
  }

  // Image: draw the decoded bitmap instead of the placeholder box.
  if (drawing.tool === "image") {
    const [a, b] = pts;
    if (a && b) {
      const image = drawing.image ? opts.images?.get(drawing.image.assetId) : undefined;
      if (image) {
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x);
        const h = Math.abs(b.y - a.y);
        try {
          ctx.drawImage(image, x, y, w, h);
        } catch {
          // A browser may reject an image that has not finished decoding; the
          // placeholder below remains visible until the next frame.
        }
      }
    }
  }

  // Arrow head for the marker tool.
  if (drawing.tool === "arrow_marker") {
    const [a, b] = pts;
    if (a && b) {
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const size = 10;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - size * Math.cos(angle - Math.PI / 6), b.y - size * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(b.x - size * Math.cos(angle + Math.PI / 6), b.y - size * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = stroke;
      ctx.fill();
    }
  }

  // Sticker/pin use a filled puck so a short emoji stays legible over candles.
  if ((drawing.tool === "sticker" || drawing.tool === "pin") && pts[0]) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, 14, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(style.color, 0.85);
    ctx.fill();
  }

  const fontSize = style.fontSize ?? 12;
  ctx.font = `${style.fontWeight === "bold" ? "600 " : ""}${fontSize}px Inter, system-ui, sans-serif`;
  ctx.textBaseline = "alphabetic";
  for (const label of figure.labels) {
    if (label.at.x < -40 || label.at.x > width + 40 || label.at.y < -20 || label.at.y > height + 20) continue;
    ctx.textAlign = label.align ?? "left";
    const metrics = ctx.measureText(label.text);
    const padX = 3;
    const boxW = metrics.width + padX * 2;
    const x = label.align === "center" ? label.at.x - boxW / 2 : label.align === "right" ? label.at.x - boxW : label.at.x;
    const y = label.above ? label.at.y - 14 : label.at.y;
    ctx.fillStyle = withAlpha("#0b0e14", 0.72);
    ctx.fillRect(x, y - fontSize, boxW, fontSize + 4);
    ctx.fillStyle = style.textColor ?? style.color;
    ctx.fillText(label.text, x + padX, y);
  }

  ctx.restore();
  return true;
}
