import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type {
  IChartApiBase,
  IPanePrimitive,
  IPanePrimitivePaneView,
  IPrimitivePaneRenderer,
  Time,
} from "lightweight-charts";

/** One macro-event vertical line: an epoch time and the impact colour it takes. */
export interface FundamentalLine {
  time: number;
  color: string;
}

/**
 * Draws full-pane-height dashed vertical lines for economic events.
 *
 * Like {@link BgBandsPrimitive} this is a pane primitive, not a series: a
 * vertical event line has no price of its own. It is attached directly to the
 * main pane and never registered as a drawing, so it stays out of the undo
 * stack and any export. Times outside the loaded range simply have no
 * coordinate and are skipped.
 */
export class FundamentalLinesPrimitive implements IPanePrimitive<Time> {
  private lines: readonly FundamentalLine[] = [];
  private chart: IChartApiBase<Time> | null = null;
  private requestUpdate: () => void = () => {};

  setLines(lines: readonly FundamentalLine[]): void {
    this.lines = lines;
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
    if (this.lines.length === 0) return [];
    return [new FundamentalLinesView(this)];
  }

  /** @internal Called by {@link FundamentalLinesView}'s renderer. */
  render(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const { height } = scope.mediaSize;
      const scale = this.chart?.timeScale() ?? null;
      if (!scale) return;
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      for (const line of this.lines) {
        // Out-of-range times have no coordinate; skip rather than crash.
        const x = scale.timeToCoordinate(line.time as Time);
        if (x === null) continue;
        ctx.strokeStyle = line.color;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      ctx.restore();
    });
  }
}

class FundamentalLinesView implements IPanePrimitivePaneView {
  constructor(private readonly owner: FundamentalLinesPrimitive) {}

  zOrder(): "bottom" {
    // Behind the candles: event context, not a drawing on top of them.
    return "bottom";
  }

  renderer(): IPrimitivePaneRenderer | null {
    return { draw: (target) => this.owner.render(target) };
  }
}
