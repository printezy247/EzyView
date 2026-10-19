import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type {
  IChartApiBase,
  IPanePrimitive,
  IPanePrimitivePaneView,
  IPrimitivePaneRenderer,
  ITimeScaleApi,
  Time,
} from "lightweight-charts";
import { fibLevels } from "@ezyview/drawing-tools";
import type { Drawing, ScreenPoint } from "@ezyview/drawing-tools";

/**
 * Renders the drawing layer on the price pane.
 *
 * Anchors are projected from (time, price) to pixels on every frame, so the
 * layer survives zoom/pan/resize without storing screen-space state.
 */
export class DrawingsPrimitive implements IPanePrimitive<Time> {
  private drawings: Drawing[] = [];
  private chart: IChartApiBase<Time> | null = null;
  private requestUpdate: () => void = () => {};

  constructor(private readonly priceToY: (price: number) => number | null) {}

  setDrawings(drawings: Drawing[]): void {
    this.drawings = drawings.filter((d) => !d.hidden && d.points.length > 0);
    this.requestUpdate();
  }

  attached(param: { chart: IChartApiBase<Time>; requestUpdate: () => void }): void {
    this.chart = param.chart;
    this.requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this.chart = null;
  }

  paneViews(): readonly IPanePrimitivePaneView[] {
    if (this.drawings.length === 0 || !this.chart) return [];
    return [new DrawingView(this)];
  }

  /** Project one drawing's anchors to pixels. Nulls mean "off-screen / off-scale". */
  project(drawing: Drawing): (ScreenPoint | null)[] {
    const scale: ITimeScaleApi<Time> | null = this.chart?.timeScale() ?? null;
    if (!scale) return [];
    return drawing.points.map((p) => {
      const x = scale.timeToCoordinate(p.time as Time);
      const y = this.priceToY(p.price);
      return x === null || y === null ? null : { x, y };
    });
  }

  /** @internal Called by {@link DrawingView}'s renderer. */
  render(target: CanvasRenderingTarget2D): void {
    if (!this.chart) return;
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const { width, height } = scope.mediaSize;
      for (const drawing of this.drawings) {
        const pts = this.project(drawing);
        if (pts.every((p) => p === null)) continue;
        ctx.save();
        ctx.strokeStyle = drawing.style.color;
        ctx.lineWidth = drawing.style.width;
        ctx.setLineDash(lineDash(drawing.style.lineStyle));
        this.renderOne(ctx, drawing, pts, width, height);
        ctx.restore();
      }
    });
  }

  private renderOne(
    ctx: CanvasRenderingContext2D,
    drawing: Drawing,
    pts: (ScreenPoint | null)[],
    width: number,
    height: number,
  ): void {
    const a = pts[0] ?? null;
    const b = pts[1] ?? null;
    const c = pts[2] ?? null;
    switch (drawing.tool) {
      case "trend_line":
        if (a && b) stroke(ctx, a, b);
        return;
      case "ray": {
        if (!a || !b) return;
        const [, far] = extendToEdge(a, b, width, height);
        stroke(ctx, a, far);
        return;
      }
      case "extended_line":
        if (a && b) stroke(ctx, ...lineToEdges(a, b, width, height));
        return;
      case "horizontal_line":
        if (!a) return;
        stroke(ctx, { x: 0, y: a.y }, { x: width, y: a.y });
        if (drawing.style.showLabels !== false) {
          drawLabel(ctx, labelOf(drawing.points[0]!.price), width - 4, a.y, drawing.style.color, "right");
        }
        return;
      case "vertical_line":
        if (!a) return;
        stroke(ctx, { x: a.x, y: 0 }, { x: a.x, y: height });
        return;
      case "rectangle": {
        if (!a || !b) return;
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const w = Math.abs(a.x - b.x);
        const h = Math.abs(a.y - b.y);
        if (drawing.style.fill) {
          ctx.fillStyle = drawing.style.fill;
          ctx.fillRect(x, y, w, h);
        }
        ctx.strokeRect(x, y, w, h);
        return;
      }
      case "parallel_channel": {
        if (!a || !b || !c) return;
        // a→b defines the base line; c is the offset point for the parallel.
        const offX = c.x - a.x;
        const offY = c.y - a.y;
        stroke(ctx, a, b);
        stroke(ctx, c, { x: b.x + offX, y: b.y + offY });
        if (drawing.style.fill) {
          ctx.fillStyle = drawing.style.fill;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.lineTo(b.x + offX, b.y + offY);
          ctx.lineTo(c.x, c.y);
          ctx.closePath();
          ctx.fill();
        }
        return;
      }
      case "arrow": {
        if (!a || !b) return;
        stroke(ctx, a, b);
        drawArrowHead(ctx, a, b, drawing.style.color);
        return;
      }
      case "brush": {
        if (pts.length < 2) return;
        ctx.beginPath();
        const first = pts.find((p) => p !== null)!;
        ctx.moveTo(first.x, first.y);
        for (const p of pts) if (p) ctx.lineTo(p.x, p.y);
        ctx.stroke();
        return;
      }
      case "ellipse": {
        if (!a || !b) return;
        const rx = Math.abs(a.x - b.x) / 2;
        const ry = Math.abs(a.y - b.y) / 2;
        ctx.beginPath();
        ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, rx, ry, 0, 0, Math.PI * 2);
        if (drawing.style.fill) {
          ctx.fillStyle = drawing.style.fill;
          ctx.fill();
        }
        ctx.stroke();
        return;
      }
      case "triangle": {
        if (!a || !b || !c) return;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.closePath();
        if (drawing.style.fill) {
          ctx.fillStyle = drawing.style.fill;
          ctx.fill();
        }
        ctx.stroke();
        return;
      }
      case "text": {
        if (!a) return;
        ctx.font = `${drawing.style.fontSize ?? 13}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = drawing.style.color;
        ctx.textBaseline = "top";
        ctx.fillText(drawing.text ?? "Text", a.x, a.y);
        return;
      }
      case "measure": {
        if (!a || !b) return;
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const w = Math.abs(a.x - b.x);
        const h = Math.abs(a.y - b.y);
        ctx.fillStyle = "rgba(41, 98, 255, 0.12)";
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        this.drawMeasureLabels(ctx, drawing, a, b);
        return;
      }
      case "long_position":
      case "short_position": {
        if (!a || !b || !c) return;
        const long = drawing.tool === "long_position";
        const entryY = a.y;
        const stopY = b.y;
        const targetY = c.y;
        const x0 = Math.min(a.x, b.x, c.x);
        const x1 = Math.max(a.x, b.x, c.x);
        // Green (target) above entry, red (stop) below — or inverted for shorts.
        const profitTop = long ? Math.min(entryY, targetY) : Math.min(entryY, stopY);
        const profitBottom = long ? Math.max(entryY, targetY) : Math.max(entryY, stopY);
        ctx.fillStyle = "rgba(38, 166, 154, 0.22)";
        ctx.fillRect(x0, profitTop, x1 - x0, profitBottom - profitTop);
        ctx.fillStyle = "rgba(239, 83, 80, 0.22)";
        const riskTop = long ? Math.min(entryY, stopY) : Math.min(entryY, targetY);
        const riskBottom = long ? Math.max(entryY, stopY) : Math.max(entryY, targetY);
        ctx.fillRect(x0, riskTop, x1 - x0, riskBottom - riskTop);
        ctx.strokeStyle = "#d1d4dc";
        stroke(ctx, { x: x0, y: entryY }, { x: x1, y: entryY });
        ctx.strokeRect(x0, profitTop, x1 - x0, riskBottom - profitTop);
        if (drawing.style.showLabels !== false) {
          ctx.font = "11px Inter, system-ui, sans-serif";
          ctx.fillStyle = "#26a69a";
          ctx.fillText(`Target ${labelOf(drawing.points[2]!.price)}`, x1 + 6, targetY + 4);
          ctx.fillStyle = "#ef5350";
          ctx.fillText(`Stop ${labelOf(drawing.points[1]!.price)}`, x1 + 6, stopY + 4);
        }
        return;
      }
      case "fib_extension": {
        if (!a || !b || !c) return;
        const p0 = drawing.points[0]!.price;
        const p1 = drawing.points[1]!.price;
        const p2 = drawing.points[2]!.price;
        const x0 = Math.min(a.x, b.x, c.x);
        const x1 = Math.max(a.x, b.x, c.x);
        ctx.font = "11px Inter, system-ui, sans-serif";
        ctx.textBaseline = "bottom";
        for (const ratio of FIB_EXTENSION_RATIOS) {
          const price = p2 + (p1 - p0) * ratio;
          const y = this.priceToY(price);
          if (y === null) continue;
          ctx.globalAlpha = ratio === 1 ? 1 : 0.75;
          stroke(ctx, { x: x0, y }, { x: x1, y });
          if (drawing.style.showLabels !== false) {
            ctx.fillStyle = drawing.style.color;
            ctx.fillText(`${(ratio * 100).toFixed(1)}%  ${labelOf(price)}`, x1 + 6, y + 4);
          }
        }
        ctx.globalAlpha = 1;
        return;
      }
      case "fib_retracement": {
        if (!a || !b) return;
        const p0 = drawing.points[0]!.price;
        const p1 = drawing.points[1]!.price;
        const x0 = Math.min(a.x, b.x);
        const x1 = Math.max(a.x, b.x);
        ctx.font = `${drawing.style.fontSize ?? 11}px Inter, system-ui, sans-serif`;
        ctx.textBaseline = "bottom";
        for (const level of fibLevels(p0, p1)) {
          const y = this.priceToY(level.price);
          if (y === null) continue;
          ctx.globalAlpha = level.ratio === 0 || level.ratio === 1 ? 1 : 0.75;
          stroke(ctx, { x: x0, y }, { x: x1, y });
          if (drawing.style.showLabels !== false) {
            ctx.fillStyle = drawing.style.color;
            ctx.fillText(`${level.label}  ${labelOf(level.price)}`, x1 + 6, y + 4);
          }
        }
        ctx.globalAlpha = 1;
        return;
      }
      default:
        if (a && b) stroke(ctx, a, b);
    }
  }

  /** Price change, bar count and percent between the measure tool's anchors. */
  private drawMeasureLabels(
    ctx: CanvasRenderingContext2D,
    drawing: Drawing,
    a: ScreenPoint,
    b: ScreenPoint,
  ): void {
    const p0 = drawing.points[0]!.price;
    const p1 = drawing.points[1]!.price;
    const delta = p1 - p0;
    const pct = p0 === 0 ? 0 : (delta / p0) * 100;
    const bars = Math.abs(drawing.points[1]!.time - drawing.points[0]!.time);
    const text = `${delta >= 0 ? "+" : ""}${labelOf(delta)}  (${pct.toFixed(2)}%)  ${bars}s`;
    ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = delta >= 0 ? "#26a69a" : "#ef5350";
    ctx.fillText(text, (a.x + b.x) / 2, Math.min(a.y, b.y) - 6);
    ctx.textAlign = "start";
  }
}

const FIB_EXTENSION_RATIOS = [0, 0.618, 1, 1.618, 2.618, 4.236];

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

function stroke(ctx: CanvasRenderingContext2D, a: ScreenPoint, b: ScreenPoint): void {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function lineDash(style: Drawing["style"]["lineStyle"]): number[] {
  if (style === "dashed") return [6, 4];
  if (style === "dotted") return [2, 3];
  return [];
}

/** Price text that stays readable whether the instrument is a index or a satoshi. */
function labelOf(price: number): string {
  const abs = Math.abs(price);
  if (abs >= 1000) return price.toFixed(2);
  if (abs >= 1) return price.toFixed(4);
  return price.toFixed(6);
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

/** Arrowhead at `b`, pointing away from `a`. */
function drawArrowHead(ctx: CanvasRenderingContext2D, a: ScreenPoint, b: ScreenPoint, color: string): void {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const size = 9;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - size * Math.cos(angle - Math.PI / 7), b.y - size * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(b.x - size * Math.cos(angle + Math.PI / 7), b.y - size * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
}
