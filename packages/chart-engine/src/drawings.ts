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
    switch (drawing.tool) {
      case "trend_line":
        if (a && b) stroke(ctx, a, b);
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
}

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
