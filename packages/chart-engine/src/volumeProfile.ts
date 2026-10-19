import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type {
  IChartApiBase,
  IPanePrimitive,
  IPanePrimitivePaneView,
  IPrimitivePaneRenderer,
  Time,
} from "lightweight-charts";
import type { Candle } from "@ezyview/data-adapters";
import { volumeProfile } from "./transforms.js";

/** Price bands in the profile: enough to show structure without crowding. */
const ROWS = 24;
/** The longest bar spans this share of the pane width. */
const MAX_WIDTH = 0.25;

/**
 * Visible-range volume profile: horizontal volume-by-price bars along the
 * right edge, recomputed from whatever candles are on screen at paint time.
 *
 * Like the `bgcolor()` bands it is a pane primitive, not a series — it has no
 * time axis of its own and must not move the price scale.
 */
export class VolumeProfilePrimitive implements IPanePrimitive<Time> {
  private candles: readonly Candle[] = [];
  private enabled = false;
  private chart: IChartApiBase<Time> | null = null;
  private requestUpdate: () => void = () => {};

  constructor(private readonly priceToY: (price: number) => number | null) {}

  setCandles(candles: readonly Candle[]): void {
    this.candles = candles;
    if (this.enabled) this.requestUpdate();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
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
    if (!this.enabled || this.candles.length === 0) return [];
    return [new VolumeProfileView(this)];
  }

  /** Candles whose time falls inside the visible time range. */
  private visible(): readonly Candle[] {
    const range = this.chart?.timeScale().getVisibleRange();
    if (!range) return this.candles;
    const from = Number(range.from);
    const to = Number(range.to);
    return this.candles.filter((c) => c.time >= from && c.time <= to);
  }

  /** @internal Called by {@link VolumeProfileView}'s renderer. */
  render(target: CanvasRenderingTarget2D): void {
    const profile = volumeProfile(this.visible(), ROWS);
    if (profile.poc < 0) return;
    const max = profile.rows[profile.poc]!.volume;
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const right = scope.mediaSize.width;
      const maxWidth = right * MAX_WIDTH;
      profile.rows.forEach((row, i) => {
        const yTop = this.priceToY(row.high);
        const yBottom = this.priceToY(row.low);
        if (yTop === null || yBottom === null || row.volume <= 0) return;
        const top = Math.min(yTop, yBottom) + 0.5;
        const height = Math.max(1, Math.abs(yBottom - yTop) - 1);
        const width = (row.volume / max) * maxWidth;
        const upWidth = (row.upVolume / row.volume) * width;
        const poc = i === profile.poc;
        ctx.fillStyle = poc ? "rgba(255,152,0,0.55)" : "rgba(38,166,154,0.28)";
        ctx.fillRect(right - width, top, upWidth, height);
        ctx.fillStyle = poc ? "rgba(255,152,0,0.4)" : "rgba(239,83,80,0.28)";
        ctx.fillRect(right - width + upWidth, top, width - upWidth, height);
      });
    });
  }
}

class VolumeProfileView implements IPanePrimitivePaneView {
  constructor(private readonly owner: VolumeProfilePrimitive) {}

  zOrder(): "bottom" {
    // Behind the candles so price action stays readable over the bars.
    return "bottom";
  }

  renderer(): IPrimitivePaneRenderer | null {
    return { draw: (target) => this.owner.render(target) };
  }
}
