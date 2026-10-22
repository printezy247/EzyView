import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type {
  IChartApiBase,
  IPanePrimitive,
  IPanePrimitivePaneView,
  IPrimitivePaneRenderer,
  Time,
} from "lightweight-charts";

/** One `bgcolor()` series: a paint color plus a lit/unlit flag per bar. */
export interface BgBand {
  color: string;
  /** `true` paints that bar; `false`/missing leaves it alone. */
  flags: readonly boolean[];
}

/**
 * Paints vertical background bands behind the price series.
 *
 * A `bgcolor()` has no price of its own — it is a region of the pane — so it
 * cannot be a series without wrecking the price scale. A pane primitive draws
 * it directly instead, in z-order "bottom" so candles stay on top.
 */
export class BgBandsPrimitive implements IPanePrimitive<Time> {
  private bands: readonly BgBand[] = [];
  private times: readonly Time[] = [];
  private chart: IChartApiBase<Time> | null = null;
  private requestUpdate: () => void = () => {};

  setBands(bands: readonly BgBand[], times: readonly Time[]): void {
    this.bands = bands;
    this.times = times;
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
    if (this.bands.length === 0 || this.times.length === 0) return [];
    return [new BgBandView(this)];
  }

  /** @internal Called by {@link BgBandView}'s renderer. */
  render(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const { height } = scope.mediaSize;
      const range = this.chart?.timeScale().getVisibleRange();
      const fromTime = range ? Number(range.from) : Number.NEGATIVE_INFINITY;
      const toTime = range ? Number(range.to) : Number.POSITIVE_INFINITY;

      let startIdx = 0;
      let endIdx = this.times.length;
      if (this.times.length > 0 && range) {
        let lo = 0;
        let hi = this.times.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (Number(this.times[mid]!) < fromTime) lo = mid + 1;
          else hi = mid;
        }
        startIdx = Math.max(0, lo - 1);

        lo = startIdx;
        hi = this.times.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (Number(this.times[mid]!) <= toTime) lo = mid + 1;
          else hi = mid;
        }
        endIdx = Math.min(this.times.length, lo + 1);
      }

      for (const band of this.bands) {
        ctx.fillStyle = band.color;
        for (let i = startIdx; i < endIdx; i++) {
          if (!band.flags[i]) continue;
          const x = this.barX(i);
          if (x === null) continue;
          ctx.fillRect(x.left, 0, x.width, height);
        }
      }
    });
  }

  /**
   * Horizontal span of one bar, derived from its neighbours' pixel positions.
   *
   * Consecutive lit bars tile exactly, since each uses the same gap width.
   */
  private barX(index: number): { left: number; width: number } | null {
    const scale = this.scale;
    if (!scale) return null;
    const here = scale.timeToCoordinate(this.times[index]!);
    if (here === null) return null;
    const before = index > 0 ? scale.timeToCoordinate(this.times[index - 1]!) : null;
    const after = index + 1 < this.times.length ? scale.timeToCoordinate(this.times[index + 1]!) : null;
    const gap = before !== null ? Math.abs(here - before) : after !== null ? Math.abs(after - here) : 6;
    const width = Math.max(1, gap);
    return { left: here - width / 2, width };
  }

  private get scale(): { timeToCoordinate(time: Time): number | null } | null {
    return this.chart?.timeScale() ?? null;
  }
}

class BgBandView implements IPanePrimitivePaneView {
  constructor(private readonly owner: BgBandsPrimitive) {}

  zOrder(): "bottom" {
    // Background bands belong behind candles and indicators.
    return "bottom";
  }

  renderer(): IPrimitivePaneRenderer | null {
    return { draw: (target) => this.owner.render(target) };
  }
}
