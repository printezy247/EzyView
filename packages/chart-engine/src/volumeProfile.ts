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
import type { VolumeProfile } from "./transforms.js";

/** Price bands in the profile: enough to show structure without crowding. */
const ROWS = 24;
/** The longest bar spans this share of the pane width. */
const MAX_WIDTH = 0.25;
/** Point of control: the busiest price band, in a colour neither side uses. */
const POC_UP = "rgba(255,152,0,0.55)";
const POC_DOWN = "rgba(255,152,0,0.4)";

/** `#rrggbb` (or `#rgb`) as `rgba()` with the given alpha; other colours pass through. */
export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const hex = m[1]!.length === 3 ? [...m[1]!].map((ch) => ch + ch).join("") : m[1]!;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

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
  private upFill = withAlpha("#26a69a", 0.28);
  private downFill = withAlpha("#ef5350", 0.28);
  /** The profile only changes with the candles or the visible range, not every repaint. */
  private cache: { candles: readonly Candle[]; from: number; to: number; profile: VolumeProfile } | null = null;

  constructor(private readonly priceToY: (price: number) => number | null) {}

  setCandles(candles: readonly Candle[]): void {
    this.candles = candles;
    if (this.enabled) this.requestUpdate();
  }

  /** Bar colours, from the chart theme's up/down colours. */
  setColors(up: string, down: string): void {
    this.upFill = withAlpha(up, 0.28);
    this.downFill = withAlpha(down, 0.28);
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

  /** Profile of the candles inside the visible time range, reused until either changes. */
  private profile(): VolumeProfile {
    const range = this.chart?.timeScale().getVisibleRange();
    const from = range ? Number(range.from) : Number.NEGATIVE_INFINITY;
    const to = range ? Number(range.to) : Number.POSITIVE_INFINITY;
    const c = this.cache;
    if (c && c.candles === this.candles && c.from === from && c.to === to) return c.profile;

    const len = this.candles.length;
    let lo = 0;
    let hi = len;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.candles[mid]!.time < from) lo = mid + 1;
      else hi = mid;
    }
    const startIndex = lo;

    lo = startIndex;
    hi = len;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.candles[mid]!.time <= to) lo = mid + 1;
      else hi = mid;
    }
    const endIndex = lo;

    const visibleCandles = this.candles.slice(startIndex, endIndex);
    const profile = volumeProfile(visibleCandles, ROWS);
    this.cache = { candles: this.candles, from, to, profile };
    return profile;
  }

  /** @internal Called by {@link VolumeProfileView}'s renderer. */
  render(target: CanvasRenderingTarget2D): void {
    const profile = this.profile();
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
        ctx.fillStyle = poc ? POC_UP : this.upFill;
        ctx.fillRect(right - width, top, upWidth, height);
        ctx.fillStyle = poc ? POC_DOWN : this.downFill;
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
