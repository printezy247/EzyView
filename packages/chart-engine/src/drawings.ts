import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type {
  IChartApiBase,
  IPanePrimitive,
  IPanePrimitivePaneView,
  IPrimitivePaneRenderer,
  ITimeScaleApi,
  Time,
} from "lightweight-charts";
import { resolvedFibExtensionLevels, resolvedFibLevels } from "@ezyview/drawing-tools";
import type { Drawing, DrawingStyle, ScreenPoint } from "@ezyview/drawing-tools";
import { paintAdvanced } from "./advancedPaint.js";

/** The slice of a candle the drawing layer needs for bar counts. */
export interface DrawingBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Renders the drawing layer on the price pane.
 *
 * Anchors are projected from (time, price) to pixels on every frame, so the
 * layer survives zoom/pan/resize without storing screen-space state. The layer
 * also renders the in-progress drawing (`setPreview`) and a hover highlight
 * (`setHovered`) so the chart can show a rubber-band line and a grab-ready
 * stroke before the user commits.
 */
export class DrawingsPrimitive implements IPanePrimitive<Time> {
  private drawings: Drawing[] = [];
  private preview: Drawing | null = null;
  private selectedIds = new Set<string>();
  private images = new Map<string, CanvasImageSource>();
  private hoveredId: string | null = null;
  private hoveredHandle: number | null = null;
  private chart: IChartApiBase<Time> | null = null;
  private requestUpdate: () => void = () => {};

  constructor(
    private readonly priceToY: (price: number) => number | null,
    private readonly bars: () => readonly DrawingBar[] = () => [],
  ) {}

  setDrawings(drawings: Drawing[]): void {
    // `zIndex` wins over insertion order, but equal values keep their order:
    // Array.prototype.sort is stable, so old layouts paint exactly as before.
    this.drawings = drawings
      .filter((d) => !d.hidden && d.points.length > 0)
      .map((drawing, order) => ({ drawing, order }))
      .sort((a, b) => (a.drawing.zIndex ?? 0) - (b.drawing.zIndex ?? 0) || a.order - b.order)
      .map((entry) => entry.drawing);
    this.requestUpdate();
  }

  /** Decoded images used by image drawings; keys are asset ids. */
  setImages(images: ReadonlyMap<string, CanvasImageSource>): void {
    this.images = new Map(images);
    this.requestUpdate();
  }

  /** Mark drawings as selected so their anchors render as handles. */
  setSelection(id: string | readonly string[] | null): void {
    const ids = id === null ? [] : typeof id === "string" ? [id] : id;
    this.selectedIds = new Set(ids);
    this.requestUpdate();
  }

  /** The rubber-band drawing drawn while a tool is placing anchors. */
  setPreview(drawing: Drawing | null): void {
    this.preview = drawing && drawing.points.length > 0 ? drawing : null;
    this.requestUpdate();
  }

  /** Highlight a hovered stroke and (optionally) the handle under the pointer. */
  setHovered(id: string | null, handle: number | null = null): void {
    if (this.hoveredId === id && this.hoveredHandle === handle) return;
    this.hoveredId = id;
    this.hoveredHandle = handle;
    this.requestUpdate();
  }

  attached(param: { chart: IChartApiBase<Time>; requestUpdate: () => void }): void {
    this.chart = param.chart;
    this.requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.requestUpdate = () => {};
  }

  paneViews(): readonly IPanePrimitivePaneView[] {
    if ((this.drawings.length === 0 && !this.preview) || !this.chart) return [];
    return [new DrawingView(this)];
  }

  /** Project one drawing's anchors to pixels. Nulls mean "off-screen / off-scale". */
  project(drawing: Drawing): (ScreenPoint | null)[] {
    const scale: ITimeScaleApi<Time> | null = this.chart?.timeScale() ?? null;
    if (!scale) return [];
    return drawing.points.map((p) => {
      const y = this.priceToY(p.price);
      if (drawing.tool === "horizontal_line") {
        return y === null ? null : { x: 0, y };
      }
      const x = scale.timeToCoordinate(p.time as Time);
      return x === null || y === null ? null : { x, y };
    });
  }

  /** @internal Called by {@link DrawingView}'s renderer. */
  render(target: CanvasRenderingTarget2D): void {
    if (!this.chart) return;
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const { width, height } = scope.mediaSize;
      const bars = this.bars();
      for (const drawing of this.drawings) {
        const pts = this.project(drawing);
        if (pts.every((p) => p === null)) continue;
        const selected = this.selectedIds.has(drawing.id);
        const active = selected || drawing.id === this.hoveredId;
        ctx.save();
        if (active) {
          ctx.shadowColor = withAlpha(drawing.style.color, 0.55);
          ctx.shadowBlur = selected ? 7 : 5;
        }
        // Advanced packs share one geometry renderer; the original switch
        // still owns every tool that shipped before them.
        if (!paintAdvanced(ctx, drawing, pts, width, height, { isPreview: false, images: this.images })) {
          paint(ctx, drawing, pts, width, height, bars, { isPreview: false });
        }
        ctx.restore();
      }
      if (this.preview) {
        const pts = this.project(this.preview);
        if (pts.length > 0) {
          ctx.save();
          if (!paintAdvanced(ctx, this.preview, pts, width, height, { isPreview: true, images: this.images })) {
            paint(ctx, this.preview, pts, width, height, bars, { isPreview: true });
          }
          ctx.restore();
        }
      }
      this.renderHandles(ctx);
    });
  }

  /** Circular TradingView-style handles plus a midpoint marker. */
  private renderHandles(ctx: CanvasRenderingContext2D): void {
    if (this.hoveredId && !this.selectedIds.has(this.hoveredId)) {
      const hovered = this.drawings.find((d) => d.id === this.hoveredId);
      if (hovered) {
        ctx.save();
        ctx.setLineDash([]);
        for (const p of this.project(hovered)) {
          if (!p) continue;
          circle(ctx, p, 3.5, "rgba(8, 12, 20, 0.85)", withAlpha(hovered.style.color, 0.9), 1.5);
        }
        ctx.restore();
      }
    }
    if (this.selectedIds.size === 0) return;
    ctx.save();
    ctx.setLineDash([]);
    for (const id of this.selectedIds) {
      const drawing = this.drawings.find((d) => d.id === id);
      if (!drawing) continue;
      const pts = this.project(drawing);
      const visible = pts.filter((p): p is ScreenPoint => p !== null);
      const color = drawing.style.color;
      // Midpoint drag marker on two-point lines and shapes.
      if (visible.length === 2 && MIDPOINT_TOOLS.has(drawing.tool)) {
        const mid = { x: (visible[0]!.x + visible[1]!.x) / 2, y: (visible[0]!.y + visible[1]!.y) / 2 };
        circle(ctx, mid, 2.5, color, color, 1);
      }
      for (const p of visible) {
        // Subtle halo, white puck, coloured ring — readable on any candle colour.
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.fillStyle = withAlpha(color, 0.18);
        ctx.fill();
        circle(ctx, p, 5, "#ffffff", color, 2);
      }
      // A handle under the pointer gets a filled centre so it is unmistakable.
      const hoverHandle = this.hoveredId === drawing.id ? this.hoveredHandle : null;
      if (hoverHandle !== null && hoverHandle >= 0 && pts[hoverHandle]) {
        circle(ctx, pts[hoverHandle]!, 2.2, color, color, 1);
      }
    }
    ctx.restore();
  }
}

const MIDPOINT_TOOLS = new Set<Drawing["tool"]>([
  "trend_line",
  "ray",
  "extended_line",
  "info_line",
  "rectangle",
  "ellipse",
  "arrow",
  "measure",
  "callout",
]);

class DrawingView implements IPanePrimitivePaneView {
  constructor(private readonly owner: DrawingsPrimitive) {}

  zOrder(): "top" {
    // Drawings sit above series and volume so a placed line is never hidden.
    return "top";
  }

  renderer(): IPrimitivePaneRenderer | null {
    return { draw: (target) => this.owner.render(target) };
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

interface PaintOptions {
  isPreview: boolean;
}

/**
 * Draw one drawing. Everything is styled from `drawing.style` with
 * TradingView's defaults for omitted fields, so old saved layouts render
 * exactly as before unless a user changes a new setting.
 */
function paint(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  pts: (ScreenPoint | null)[],
  width: number,
  height: number,
  bars: readonly DrawingBar[],
  opts: PaintOptions,
): void {
  const style = drawing.style;
  const [a, b, c] = pts;
  const stroke = withAlpha(style.color, (style.opacity ?? 100) / 100);
  const fill = withAlpha(style.fill ?? style.color, (style.fillOpacity ?? 20) / 100);
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.lineWidth = Math.max(1, style.width);
  ctx.setLineDash(lineDash(style.lineStyle));
  if (opts.isPreview) {
    ctx.globalAlpha = 0.85;
    if (style.lineStyle === "solid") ctx.setLineDash([5, 4]);
  }
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  switch (drawing.tool) {
    case "trend_line":
    case "info_line": {
      if (!a || !b) return;
      const [p0, p1] = displaySegment(drawing, a, b, width, height);
      strokeLine(ctx, p0, p1);
      paintArrowEnds(ctx, p0, p1, style, stroke);
      if (drawing.text && a && b) drawLineText(ctx, drawing, midpoint(a, b), width);
      if (drawing.tool === "info_line" || style.showStats) {
        const stats = statsFor(drawing, bars, true);
        if (stats) drawPill(ctx, stats, statsAnchor(drawing, a, b, width), style, "center");
      }
      return;
    }
    case "ray": {
      if (!a || !b) return;
      const [, far] = extendToEdge(a, b, width, height);
      strokeLine(ctx, a, far);
      paintArrowEnds(ctx, a, far, style, stroke);
      if (drawing.text) drawLineText(ctx, drawing, midpoint(a, far), width);
      if (style.showStats) {
        const stats = statsFor(drawing, bars, true);
        if (stats) drawPill(ctx, stats, statsAnchor(drawing, a, far, width), style, "center");
      }
      return;
    }
    case "extended_line": {
      if (!a || !b) return;
      const [p0, p1] = lineToEdges(a, b, width, height);
      strokeLine(ctx, p0, p1);
      paintArrowEnds(ctx, p0, p1, style, stroke);
      if (drawing.text) drawLineText(ctx, drawing, midpoint(a, b), width);
      return;
    }
    case "horizontal_line": {
      if (!a) return;
      strokeLine(ctx, { x: 0, y: a.y }, { x: width, y: a.y });
      paintArrowEnds(ctx, { x: 0, y: a.y }, { x: width, y: a.y }, style, stroke);
      if (drawing.style.showLabels !== false && style.showPriceLabels !== false) {
        drawLabel(ctx, labelOf(drawing.points[0]!.price), width - 4, a.y, style.color, "right");
      }
      if (drawing.text) drawLineText(ctx, drawing, { x: width * 0.5, y: a.y }, width);
      if (style.showStats) {
        const stats = statsFor(drawing, bars, true);
        if (stats) drawPill(ctx, stats, { x: width * 0.5, y: a.y, above: true }, style, "center");
      }
      return;
    }
    case "horizontal_ray": {
      if (!a) return;
      strokeLine(ctx, { x: a.x, y: a.y }, { x: width, y: a.y });
      paintArrowEnds(ctx, { x: a.x, y: a.y }, { x: width, y: a.y }, style, stroke);
      if (style.showPriceLabels !== false) {
        drawLabel(ctx, labelOf(drawing.points[0]!.price), width - 4, a.y, style.color, "right");
      }
      if (drawing.text) drawLineText(ctx, drawing, { x: Math.max(a.x, width * 0.5), y: a.y }, width);
      if (style.showStats) {
        const stats = statsFor(drawing, bars, true);
        if (stats) drawPill(ctx, stats, { x: Math.max(a.x, width * 0.5), y: a.y, above: true }, style, "center");
      }
      return;
    }
    case "vertical_line":
      if (!a) return;
      strokeLine(ctx, { x: a.x, y: 0 }, { x: a.x, y: height });
      paintArrowEnds(ctx, { x: a.x, y: 0 }, { x: a.x, y: height }, style, stroke);
      if (drawing.text) drawLineText(ctx, drawing, { x: a.x, y: height * 0.5 }, width);
      return;
    case "rectangle": {
      if (!a || !b) return;
      const [left, right] = extendOf(drawing);
      const x0 = left ? 0 : Math.min(a.x, b.x);
      const x1 = right ? width : Math.max(a.x, b.x);
      const y0 = Math.min(a.y, b.y);
      const y1 = Math.max(a.y, b.y);
      ctx.fillStyle = fill;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      if (style.showMiddleLine) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.globalAlpha = 0.7;
        strokeLine(ctx, { x: x0, y: (y0 + y1) / 2 }, { x: x1, y: (y0 + y1) / 2 });
        ctx.restore();
      }
      paintArrowEnds(ctx, { x: x0, y: y1 }, { x: x1, y: y1 }, style, stroke);
      drawBoxText(ctx, drawing, { x: x0, y: y0 }, { x: x1, y: y1 });
      if (style.showStats) {
        const stats = statsFor(drawing, bars, false);
        if (stats) drawPill(ctx, stats, { x: (x0 + x1) / 2, y: y0, above: true }, style, "center");
      }
      return;
    }
    case "ellipse": {
      if (!a || !b) return;
      const rx = Math.abs(a.x - b.x) / 2;
      const ry = Math.abs(a.y - b.y) / 2;
      ctx.beginPath();
      ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.stroke();
      return;
    }
    case "parallel_channel": {
      if (!a || !b || !c) return;
      const offX = c.x - a.x;
      const offY = c.y - a.y;
      const d = { x: b.x + offX, y: b.y + offY };
      const [left, right] = extendOf(drawing);
      // Extend past the correct anchor: behind A for left, past B for right.
      const baseStart = left ? extendToEdge(b, a, width, height)[1] : a;
      const baseEnd = right ? extendToEdge(a, b, width, height)[1] : b;
      const topStart = left ? { x: c.x + (baseStart.x - a.x), y: c.y + (baseStart.y - a.y) } : c;
      const topEnd = right ? { x: d.x + (baseEnd.x - b.x), y: d.y + (baseEnd.y - b.y) } : d;
      if (style.fill) {
        ctx.beginPath();
        ctx.moveTo(baseStart.x, baseStart.y);
        ctx.lineTo(baseEnd.x, baseEnd.y);
        ctx.lineTo(topEnd.x, topEnd.y);
        ctx.lineTo(topStart.x, topStart.y);
        ctx.closePath();
        ctx.fill();
      }
      strokeLine(ctx, baseStart, baseEnd);
      strokeLine(ctx, topStart, topEnd);
      paintArrowEnds(ctx, baseStart, baseEnd, style, stroke);
      if (style.showMiddleLine) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.globalAlpha = 0.7;
        strokeLine(
          ctx,
          { x: (baseStart.x + topStart.x) / 2, y: (baseStart.y + topStart.y) / 2 },
          { x: (baseEnd.x + topEnd.x) / 2, y: (baseEnd.y + topEnd.y) / 2 },
        );
        ctx.restore();
      }
      if (drawing.text) {
        drawLineText(ctx, drawing, midpoint(midpoint(baseStart, baseEnd), midpoint(topStart, topEnd)), width);
      }
      if (style.showStats) {
        const stats = statsFor(drawing, bars, true);
        if (stats) drawPill(ctx, stats, { x: (baseStart.x + baseEnd.x) / 2, y: baseStart.y, above: true }, style, "center");
      }
      return;
    }
    case "triangle": {
      if (!a || !b || !c) return;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.stroke();
      return;
    }
    case "arrow": {
      if (!a || !b) return;
      strokeLine(ctx, a, b);
      arrowHead(ctx, a, b, stroke, 9);
      return;
    }
    case "brush": {
      const points = pts.filter((p): p is ScreenPoint => p !== null);
      if (points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(points[0]!.x, points[0]!.y);
      for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      return;
    }
    case "text": {
      if (!a) return;
      drawTextBlock(ctx, drawing, drawing.text ?? "Text", a, {
        align: style.textAlign ?? "left",
        valign: style.textVAlign ?? "top",
      });
      return;
    }
    case "callout": {
      if (!a || !b) return;
      const text = drawing.text || "Callout";
      const font = fontOf(style);
      ctx.font = font;
      const lines = text.split("\n");
      const lineHeight = (style.fontSize ?? 13) * 1.35;
      const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
      const boxWidth = Math.max(120, textWidth + 18);
      const boxHeight = lines.length * lineHeight + 12;
      const bx = b.x;
      const by = b.y;
      // Leader from the pointer tip to the nearest box corner.
      ctx.save();
      ctx.setLineDash([]);
      ctx.strokeStyle = stroke;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(bx, by + boxHeight / 2);
      ctx.stroke();
      circle(ctx, a, 3, stroke, stroke, 1);
      const bg = withAlpha(style.fill ?? style.color, Math.max((style.fillOpacity ?? 20) / 100, 0.16));
      roundedRect(ctx, bx, by, boxWidth, boxHeight, 5);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.stroke();
      ctx.fillStyle = style.textColor ?? style.color;
      ctx.font = font;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      lines.forEach((line, i) => ctx.fillText(line, bx + 9, by + 7 + i * lineHeight));
      ctx.restore();
      return;
    }
    case "measure": {
      if (!a || !b) return;
      const x0 = Math.min(a.x, b.x);
      const y0 = Math.min(a.y, b.y);
      const w = Math.abs(a.x - b.x);
      const h = Math.abs(a.y - b.y);
      ctx.fillStyle = withAlpha(style.color, 0.12);
      ctx.fillRect(x0, y0, w, h);
      ctx.strokeRect(x0, y0, w, h);
      // Directional guides: across then down (or up), each with a head.
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.globalAlpha = 0.8;
      strokeLine(ctx, a, { x: b.x, y: a.y });
      strokeLine(ctx, { x: b.x, y: a.y }, b);
      ctx.restore();
      arrowHead(ctx, { x: b.x - (b.x - a.x) * 0.001, y: a.y }, { x: b.x, y: a.y }, withAlpha(style.color, 0.9), 7);
      arrowHead(ctx, { x: b.x, y: a.y + (b.y - a.y) * 0.001 }, b, withAlpha(style.color, 0.9), 7);
      drawMeasureLabels(ctx, drawing, a, b, bars, width, height);
      return;
    }
    case "long_position":
    case "short_position": {
      if (!a || !b || !c) return;
      const entryY = a.y;
      const stopY = b.y;
      const targetY = c.y;
      const x0 = Math.min(a.x, b.x, c.x);
      const x1 = pts[3]?.x ?? Math.max(a.x, b.x, c.x);
      const stopColor = style.stopColor ?? "#ef5350";
      const targetColor = style.targetColor ?? "#26a69a";
      // Target zone is always entry→target, risk zone entry→stop; the screen
      // direction differs for longs and shorts without any special case.
      const targetTop = Math.min(entryY, targetY);
      const targetBottom = Math.max(entryY, targetY);
      ctx.fillStyle = withAlpha(targetColor, 0.2);
      ctx.fillRect(x0, targetTop, x1 - x0, targetBottom - targetTop);
      const riskTop = Math.min(entryY, stopY);
      const riskBottom = Math.max(entryY, stopY);
      ctx.fillStyle = withAlpha(stopColor, 0.2);
      ctx.fillRect(x0, riskTop, x1 - x0, riskBottom - riskTop);
      ctx.save();
      ctx.setLineDash([]);
      ctx.strokeStyle = "#d1d4dc";
      strokeLine(ctx, { x: x0, y: entryY }, { x: x1, y: entryY });
      ctx.strokeStyle = stroke;
      const top = Math.min(riskTop, targetTop);
      const bottom = Math.max(riskBottom, targetBottom);
      ctx.strokeRect(x0, top, x1 - x0, bottom - top);
      strokeLine(ctx, { x: x1, y: top }, { x: x1, y: bottom });
      ctx.restore();
      drawPositionLabels(ctx, drawing, { x0, x1, entryY, stopY, targetY }, width);
      return;
    }
    case "fib_extension": {
      if (!a || !b || !c) return;
      const levels = resolvedFibExtensionLevels(drawing.points, drawing.style);
      const x0 = Math.min(a.x, b.x, c.x);
      const x1 = Math.max(a.x, b.x, c.x);
      ctx.font = "11px Inter, system-ui, sans-serif";
      for (const level of levels) {
        const y = c.y + (b.y - a.y) * level.ratio;
        if (!Number.isFinite(y)) continue;
        ctx.globalAlpha = level.ratio === 0 || level.ratio === 1 ? 1 : 0.75;
        ctx.strokeStyle = withAlpha(level.color ?? style.color, (style.opacity ?? 100) / 100);
        strokeLine(ctx, { x: x0, y }, { x: x1, y });
        if (style.showLabels !== false && style.showPriceLabels !== false) {
          ctx.fillStyle = style.color;
          ctx.fillText(`${level.label}  ${labelOf(level.price)}`, x1 + 6, y + 4);
        }
      }
      ctx.globalAlpha = 1;
      return;
    }
    case "fib_retracement": {
      if (!a || !b) return;
      const levels = resolvedFibLevels(drawing.points, drawing.style);
      if (levels.length === 0) return;
      const [left, right] = extendOf(drawing);
      const x0 = left ? 0 : Math.min(a.x, b.x);
      const x1 = right ? width : Math.max(a.x, b.x);
      const ys = levels.map((level) => ({ level, y: priceToYFor(drawing, level.price, a, b) }));
      // Fills between adjacent levels, matching TradingView's banded look.
      const fillAlpha = (style.fillOpacity ?? 20) / 100;
      if (fillAlpha > 0) {
        for (let i = 1; i < ys.length; i++) {
          const prev = ys[i - 1]!;
          const cur = ys[i]!;
          if (prev.y === null || cur.y === null) continue;
          ctx.fillStyle = withAlpha(cur.level.color ?? style.fill ?? style.color, fillAlpha * 0.55);
          ctx.fillRect(x0, Math.min(prev.y, cur.y), x1 - x0, Math.abs(cur.y - prev.y));
        }
      }
      ctx.save();
      ctx.setLineDash(lineDash(style.lineStyle));
      for (const { level, y } of ys) {
        if (y === null) continue;
        ctx.strokeStyle = withAlpha(level.color ?? style.color, (style.opacity ?? 100) / 100);
        ctx.globalAlpha = level.ratio === 0 || level.ratio === 1 ? 1 : 0.85;
        strokeLine(ctx, { x: x0, y }, { x: x1, y });
        if (style.showLabels !== false && style.showPriceLabels !== false) {
          ctx.font = `${style.fontSize ?? 11}px Inter, system-ui, sans-serif`;
          ctx.fillStyle = style.color;
          ctx.globalAlpha = 1;
          ctx.fillText(`${level.label}  ${labelOf(level.price)}`, Math.min(x1 + 6, width - 90), y + 4);
        }
      }
      // Boundary lines and the anchor segment, as TradingView draws them.
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = withAlpha(style.color, 0.6);
      strokeLine(ctx, { x: x0, y: Math.min(a.y, b.y) }, { x: x0, y: Math.max(a.y, b.y) });
      strokeLine(ctx, { x: x1, y: Math.min(a.y, b.y) }, { x: x1, y: Math.max(a.y, b.y) });
      ctx.restore();
      return;
    }
    default:
      if (a && b) strokeLine(ctx, a, b);
  }
}

// ---------------------------------------------------------------------------
// Text and badges
// ---------------------------------------------------------------------------

function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  text: string,
  at: ScreenPoint,
  layout: { align: "left" | "center" | "right"; valign: "top" | "middle" | "bottom" },
): void {
  const style = drawing.style;
  const size = style.fontSize ?? 13;
  const lines = text.split("\n");
  const lineHeight = size * 1.35;
  ctx.font = fontOf(style);
  ctx.fillStyle = style.textColor ?? style.color;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const totalHeight = lines.length * lineHeight;
  let y = at.y;
  if (layout.valign === "middle") y = at.y - totalHeight / 2;
  if (layout.valign === "bottom") y = at.y - totalHeight;
  lines.forEach((line, i) => {
    const w = ctx.measureText(line).width;
    const x = layout.align === "center" ? at.x - w / 2 : layout.align === "right" ? at.x - w : at.x;
    ctx.fillText(line, x, y + i * lineHeight);
  });
}

/** Text inside a rectangle, positioned by the style's alignment. */
function drawBoxText(ctx: CanvasRenderingContext2D, drawing: Drawing, topLeft: ScreenPoint, bottomRight: ScreenPoint): void {
  if (!drawing.text) return;
  const pad = 6;
  const align = drawing.style.textAlign ?? "left";
  const valign = drawing.style.textVAlign ?? "top";
  const x = align === "center" ? (topLeft.x + bottomRight.x) / 2 : align === "right" ? bottomRight.x - pad : topLeft.x + pad;
  const y = valign === "middle" ? (topLeft.y + bottomRight.y) / 2 : valign === "bottom" ? bottomRight.y - pad : topLeft.y + pad;
  drawTextBlock(ctx, drawing, drawing.text, { x, y }, { align, valign });
}

/** A one-line annotation next to a line's midpoint. */
function drawLineText(ctx: CanvasRenderingContext2D, drawing: Drawing, at: ScreenPoint, width: number): void {
  const style = drawing.style;
  const funit = style.fontSize ?? 12;
  ctx.font = fontOf(style);
  ctx.fillStyle = style.textColor ?? style.color;
  const lines = (drawing.text ?? "").split("\n");
  const textWidth = Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
  const align = style.textAlign ?? "center";
  const x = Math.max(8, Math.min(width - textWidth - 8, at.x - (align === "center" ? textWidth / 2 : align === "right" ? textWidth : 0)));
  const valign = style.textVAlign ?? "bottom";
  const total = lines.length * funit * 1.3;
  const y = valign === "top" ? at.y + 6 : valign === "middle" ? at.y - total / 2 : at.y - total - 4;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * funit * 1.3));
}

/** Measure-tool readouts: Δ, %, bar count, duration. */
function drawMeasureLabels(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  a: ScreenPoint,
  b: ScreenPoint,
  bars: readonly DrawingBar[],
  width: number,
  height: number,
): void {
  const p0 = drawing.points[0]!.price;
  const p1 = drawing.points[1]!.price;
  const delta = p1 - p0;
  const pct = p0 === 0 ? 0 : (delta / p0) * 100;
  const step = Math.abs(drawing.points[1]!.time - drawing.points[0]!.time);
  const count = countBars(bars, drawing.points[0]!.time, drawing.points[1]!.time);
  const tone = delta >= 0 ? "#26a69a" : "#ef5350";
  const head = `${delta >= 0 ? "+" : ""}${labelOf(delta)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`;
  const foot = `${count} bars · ${formatDuration(step)} · ${angleLabel(a, b)}`;
  const boxTop = Math.min(a.y, b.y);
  const boxBottom = Math.max(a.y, b.y);
  drawPillText(ctx, head, (a.x + b.x) / 2, Math.max(16, boxTop - 14), tone, "center");
  const footY = Math.min(height - 10, boxBottom + 16);
  drawPillText(ctx, foot, Math.min(width - 10, (a.x + b.x) / 2), footY, tone, "center");
}

/** Target/Stop/Entry badges with the R:R ratio and optional position sizing. */
function drawPositionLabels(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  box: { x0: number; x1: number; entryY: number; stopY: number; targetY: number },
  width: number,
): void {
  const style = drawing.style;
  if (style.showPriceLabels === false) return;
  const [entry, stop, target] = drawing.points.map((p) => p.price);
  if (entry === undefined || stop === undefined || target === undefined) return;
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  const pct = (price: number) => (entry === 0 ? 0 : ((price - entry) / entry) * 100);
  const stopColor = style.stopColor ?? "#ef5350";
  const targetColor = style.targetColor ?? "#26a69a";
  const targetText = `Target: ${labelOf(target)} (${pct(target) >= 0 ? "+" : ""}${pct(target).toFixed(2)}%)`;
  const stopText = `Stop: ${labelOf(stop)} (${pct(stop) >= 0 ? "+" : ""}${pct(stop).toFixed(2)}%)`;
  const rr = risk === 0 ? null : reward / risk;
  let entryText = rr === null ? "R:R —" : `R:R ${rr.toFixed(2)}`;
  const account = style.accountSize;
  const riskSize = style.riskSize;
  if (account !== undefined && riskSize !== undefined && account > 0 && risk > 0) {
    const riskCash = style.riskMode === "currency" ? riskSize : (account * riskSize) / 100;
    const qty = riskCash / risk;
    const pnl = qty * reward;
    entryText += ` · ${qty.toFixed(2)} units · P&L ${pnl.toFixed(2)}`;
  }
  const right = Math.min(width - 8, box.x1 + 10);
  drawPillText(ctx, targetText, right, box.targetY, targetColor, "left");
  drawPillText(ctx, stopText, right, box.stopY, stopColor, "left");
  drawPillText(ctx, entryText, (box.x0 + box.x1) / 2, box.entryY, "#d1d4dc", "center", "#131722");
}

function drawPill(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  at: { x: number; y: number; above?: boolean },
  style: DrawingStyle,
  align: "left" | "center" | "right",
): void {
  const y = at.above ? at.y - 10 : at.y + 10;
  const text = lines.join("  ·  ");
  drawPillText(ctx, text, at.x, y, "#d1d4dc", align, "#131722", withAlpha(style.color, 0.8));
}

/** Rounded pill with a dark background, used for every stat readout. */
function drawPillText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  align: "left" | "center" | "right",
  bg = "rgba(19, 23, 34, 0.92)",
  border = "rgba(255, 255, 255, 0.12)",
): void {
  ctx.save();
  ctx.font = "11px Inter, system-ui, sans-serif";
  const w = ctx.measureText(text).width + 14;
  const h = 19;
  const x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  roundedRect(ctx, x0, y - h / 2, w, h, 5);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x0 + 7, y + 0.5);
  ctx.restore();
}

/** Stats lines: price change, percent, bars, duration, angle. */
function statsFor(drawing: Drawing, bars: readonly DrawingBar[], lineTool: boolean): string[] | null {
  const p0 = drawing.points[0]?.price;
  const p1 = drawing.points[1]?.price;
  if (!lineTool) {
    if (p0 === undefined || p1 === undefined) return null;
    const delta = Math.abs(p1 - p0);
    const pct = p0 === 0 ? 0 : (delta / p0) * 100;
    return [`${labelOf(delta)} (${pct.toFixed(2)}%)`];
  }
  if (p0 === undefined || p1 === undefined) return null;
  const delta = p1 - p0;
  const pct = p0 === 0 ? 0 : (delta / p0) * 100;
  const t0 = drawing.points[0]?.time;
  const t1 = drawing.points[1]?.time;
  const count = t0 === undefined || t1 === undefined ? null : countBars(bars, t0, t1);
  const duration = t0 === undefined || t1 === undefined ? null : formatDuration(Math.abs(t1 - t0));
  const first = `${delta >= 0 ? "+" : ""}${labelOf(delta)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`;
  const tail = [count === null ? null : `${count} bars`, duration].filter((s): s is string => s !== null);
  return tail.length > 0 ? [first, tail.join(" · ")] : [first];
}

function statsAnchor(
  drawing: Drawing,
  a: ScreenPoint,
  b: ScreenPoint,
  width: number,
): { x: number; y: number; above?: boolean } {
  const position = drawing.style.statsPosition ?? "top";
  const mid = midpoint(a, b);
  if (position === "right") return { x: Math.min(width - 12, Math.max(a.x, b.x) + 10), y: mid.y };
  if (position === "middle") return { x: mid.x, y: mid.y };
  if (position === "bottom") return { x: mid.x, y: Math.max(a.y, b.y) + 14 };
  return { x: mid.x, y: Math.min(a.y, b.y), above: true };
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function strokeLine(ctx: CanvasRenderingContext2D, a: ScreenPoint, b: ScreenPoint): void {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function circle(
  ctx: CanvasRenderingContext2D,
  at: ScreenPoint,
  radius: number,
  fill: string,
  stroke: string,
  lineWidth: number,
): void {
  ctx.beginPath();
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function paintArrowEnds(
  ctx: CanvasRenderingContext2D,
  a: ScreenPoint,
  b: ScreenPoint,
  style: DrawingStyle,
  color: string,
): void {
  if (style.leftEnd === "arrow") arrowHead(ctx, b, a, color, 9);
  if (style.rightEnd === "arrow") arrowHead(ctx, a, b, color, 9);
}

/** Arrowhead at `b`, pointing away from `a`. */
function arrowHead(ctx: CanvasRenderingContext2D, a: ScreenPoint, b: ScreenPoint, color: string, size: number): void {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - size * Math.cos(angle - Math.PI / 7), b.y - size * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(b.x - size * Math.cos(angle + Math.PI / 7), b.y - size * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  align: CanvasTextAlign,
): void {
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function lineDash(style: DrawingStyle["lineStyle"]): number[] {
  if (style === "dashed") return [6, 4];
  if (style === "dotted") return [2, 3];
  return [];
}

function fontOf(style: DrawingStyle): string {
  const fontStyle = style.fontStyle ?? "normal";
  const weight = style.fontWeight ?? "normal";
  return `${fontStyle} ${weight} ${style.fontSize ?? 13}px Inter, system-ui, sans-serif`;
}

const extendOf = (d: Drawing): [boolean, boolean] => [d.style.extendLeft === true, d.style.extendRight === true];

/** The segment a straight tool actually paints, after its extend settings. */
function displaySegment(d: Drawing, a: ScreenPoint, b: ScreenPoint, width: number, height: number): [ScreenPoint, ScreenPoint] {
  const [left, right] = extendOf(d);
  if (left && right) return lineToEdges(a, b, width, height);
  if (right) return [a, extendToEdge(a, b, width, height)[1]];
  if (left) return [extendToEdge(b, a, width, height)[1], b];
  return [a, b];
}

/** Price text that stays readable whether the instrument is a index or a satoshi. */
function labelOf(price: number): string {
  const abs = Math.abs(price);
  if (abs >= 1000) return price.toFixed(2);
  if (abs >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

/** Blend a hex colour with alpha; named/rgb colours are returned unchanged. */
function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const hex = color.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  const parts = short
    ? [parseInt(short[1]! + short[1]!, 16), parseInt(short[2]! + short[2]!, 16), parseInt(short[3]! + short[3]!, 16)]
    : long
      ? [parseInt(long[1]!, 16), parseInt(long[2]!, 16), parseInt(long[3]!, 16)]
      : null;
  if (!parts) return color;
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${a})`;
}

/** Hours/minutes representation of a bar span, the way TradingView prints it. */
function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0m";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return hours % 24 === 0 ? `${days}d` : `${days}d ${hours % 24}h`;
}

function angleLabel(a: ScreenPoint, b: ScreenPoint): string {
  const degrees = (Math.atan2(-(b.y - a.y), b.x - a.x) * 180) / Math.PI;
  return `${Math.round(degrees)}°`;
}

/** Count bars whose time falls inside `[t0, t1]` of a bounded bar list. */
function countBars(bars: readonly DrawingBar[], t0: number, t1: number): number {
  if (bars.length === 0) return 0;
  const from = Math.min(t0, t1);
  const to = Math.max(t0, t1);
  return lowerBound(bars, to) - lowerBound(bars, from) + (hasTime(bars, from) ? 1 : 0);
}

/** First index whose time is >= `time`. */
function lowerBound(bars: readonly DrawingBar[], time: number): number {
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid]!.time < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function hasTime(bars: readonly DrawingBar[], time: number): boolean {
  const i = lowerBound(bars, time);
  return bars[i]?.time === time;
}

function priceToYFor(drawing: Drawing, price: number, a: ScreenPoint, b: ScreenPoint): number | null {
  const p0 = drawing.points[0]?.price;
  const p1 = drawing.points[1]?.price;
  if (p0 === undefined || p1 === undefined || p1 === p0) return null;
  return a.y + ((price - p0) / (p1 - p0)) * (b.y - a.y);
}

function midpoint(a: ScreenPoint, b: ScreenPoint): ScreenPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Push a ray from `a` through `b` out to the far pane edge.
 *
 * Advances along the direction vector in fixed steps until the point leaves the
 * pane, then backs off one step. Bisection would be tighter but a coarse march
 * is exact enough at pane scale and cannot divide by a zero component.
 */
function extendToEdge(a: ScreenPoint, b: ScreenPoint, width: number, height: number): [ScreenPoint, ScreenPoint] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return [a, b];
  const span = Math.max(width, height) * 2;
  const len = Math.hypot(dx, dy);
  const steps = Math.ceil(span / Math.max(1, len));
  let far = { x: b.x, y: b.y };
  for (let i = 2; i <= steps; i++) {
    const next = { x: a.x + dx * i, y: a.y + dy * i };
    if (next.x < -width || next.x > width * 2 || next.y < -height || next.y > height * 2) break;
    far = next;
  }
  return [a, far];
}

/** Extend a line through both pane edges, for the infinite-line tool. */
function lineToEdges(a: ScreenPoint, b: ScreenPoint, width: number, height: number): [ScreenPoint, ScreenPoint] {
  const [, far] = extendToEdge(a, b, width, height);
  const [, back] = extendToEdge(b, a, width, height);
  return [back, far];
}
