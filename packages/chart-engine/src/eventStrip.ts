import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type {
  IChartApiBase,
  IPanePrimitive,
  IPanePrimitivePaneView,
  IPrimitivePaneRenderer,
  PrimitiveHoveredItem,
  Time,
} from "lightweight-charts";
import type { Impact } from "@ezyview/data-adapters";

/** Height of the event strip docked at the bottom of the main pane. */
export const EVENT_STRIP_HEIGHT = 18;
/** Chips nearer than this merge into one count badge. */
export const EVENT_STRIP_CLUSTER_PX = 14;
/** Hit radius around a chip centre, in CSS px. */
export const EVENT_STRIP_HIT_PX = 9;

/** Impact colours shared by event chips and their vertical lines. */
export const EVENT_IMPACT_COLORS: Record<Impact, string> = {
  high: "#f23645",
  medium: "#ff9800",
  low: "#787b86",
  none: "#787b86",
};

/** Earnings dots use the platform's amber so they read apart from events. */
export const EVENT_EARNINGS_COLOR = "#f0b90b";

/** One earnings dot or economic-event marker on the time axis, with hover detail. */
export interface EventStripMarker {
  time: number;
  title: string;
  kind: "earnings" | "event";
  impact?: Impact;
  actual?: string | null;
  forecast?: string | null;
  previous?: string | null;
  currency?: string;
  source?: string;
  url?: string;
  eps?: number | null;
  estimate?: number | null;
  revenue?: number | null;
  quarter?: string;
}

/** One drawn chip: a single marker, or a count badge for a cluster. */
export interface EventStripChip {
  id: string;
  /** Chip centre in CSS px, pane-relative. */
  x: number;
  color: string;
  shape: "circle" | "square";
  count: number;
  members: EventStripMarker[];
}

/** Minimal time scale surface the layout needs. */
export interface StripTimeScale {
  timeToCoordinate(time: Time): number | null;
}

const chipColor = (m: EventStripMarker): string =>
  m.kind === "earnings" ? EVENT_EARNINGS_COLOR : EVENT_IMPACT_COLORS[m.impact ?? "high"];

const chipShape = (members: EventStripMarker[]): "circle" | "square" =>
  members.length === 1 && members[0]!.kind === "earnings" ? "circle" : "square";

const IMPACT_RANK: Record<string, number> = { high: 3, medium: 2, low: 1, none: 0 };

/** A cluster badge takes the hottest member's colour, so red still reads red. */
const clusterColor = (members: EventStripMarker[]): string => {
  let best: EventStripMarker | null = null;
  for (const m of members) {
    if (m.kind === "earnings") return EVENT_EARNINGS_COLOR;
    if (!best || (IMPACT_RANK[m.impact ?? "high"] ?? 0) > (IMPACT_RANK[best.impact ?? "high"] ?? 0)) best = m;
  }
  return best ? chipColor(best) : "#787b86";
};

/**
 * Lay markers out along the strip: out-of-range times are skipped, and chips
 * nearer than {@link EVENT_STRIP_CLUSTER_PX} merge into one count badge.
 * Pure, so hit-testing and the renderer share it exactly.
 */
export function layoutEventStrip(
  scale: StripTimeScale,
  markers: readonly EventStripMarker[],
): EventStripChip[] {
  const dots = markers
    .map((m) => ({ m, x: scale.timeToCoordinate(m.time as Time) }))
    .filter((d): d is { m: EventStripMarker; x: number } => d.x !== null)
    .sort((a, b) => a.x - b.x);
  const chips: EventStripChip[] = [];
  let index = 0;
  for (const dot of dots) {
    const last = chips[chips.length - 1];
    if (last && dot.x - last.x < EVENT_STRIP_CLUSTER_PX) {
      // Merge right: the badge sits on the newest member.
      last.x = dot.x;
      last.members.push(dot.m);
      last.count = last.members.length;
      last.shape = chipShape(last.members);
      last.color = clusterColor(last.members);
      continue;
    }
    const id = `evstrip:${index++}`;
    chips.push({ id, x: dot.x, color: chipColor(dot.m), shape: chipShape([dot.m]), count: 1, members: [dot.m] });
  }
  return chips;
}

/**
 * Bottom-strip event dots, replacing the old above-bar series markers.
 *
 * A pane primitive, like the fundamental lines: event context that survives
 * series rebuilds and never enters the drawings/undo stack. The library calls
 * `hitTest` on pointer moves, and the hit's external id resolves through
 * `chipAt` to the markers behind a chip or cluster badge.
 */
export class EventStripPrimitive implements IPanePrimitive<Time> {
  private markers: readonly EventStripMarker[] = [];
  private chips: EventStripChip[] = [];
  private height = 0;
  private chart: IChartApiBase<Time> | null = null;
  private requestUpdate: () => void = () => {};

  setMarkers(markers: readonly EventStripMarker[]): void {
    this.markers = markers;
    this.chips = [];
    this.requestUpdate();
  }

  /** Chips from the last render; what an external id resolves against. */
  chipAt(id: string): EventStripChip | null {
    return this.chips.find((c) => c.id === id) ?? null;
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
    if (this.markers.length === 0) return [];
    return [new EventStripView(this)];
  }

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    if (this.height <= 0 || y < this.height - EVENT_STRIP_HEIGHT) return null;
    let best: EventStripChip | null = null;
    let bestDist = EVENT_STRIP_HIT_PX;
    for (const chip of this.chips) {
      const dist = Math.abs(chip.x - x);
      if (dist <= bestDist) {
        best = chip;
        bestDist = dist;
      }
    }
    if (!best) return null;
    return { externalId: best.id, cursorStyle: "pointer", zOrder: "top", hitTestPriority: 2 };
  }

  /** @internal Called by {@link EventStripView}'s renderer. */
  render(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const { height, width } = scope.mediaSize;
      const scale = this.chart?.timeScale() ?? null;
      if (!scale) return;
      this.height = height;
      this.chips = layoutEventStrip(scale, this.markers).filter((c) => c.x >= -20 && c.x <= width + 20);
      const y = height - EVENT_STRIP_HEIGHT / 2;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const chip of this.chips) {
        ctx.fillStyle = chip.color;
        if (chip.count === 1 && chip.shape === "circle") {
          ctx.beginPath();
          ctx.arc(chip.x, y, 4, 0, Math.PI * 2);
          ctx.fill();
        } else if (chip.count === 1) {
          ctx.fillRect(chip.x - 4, y - 4, 8, 8);
        } else {
          const label = String(chip.count);
          const w = Math.max(16, 8 + label.length * 6);
          ctx.beginPath();
          if (typeof ctx.roundRect === "function") ctx.roundRect(chip.x - w / 2, y - 7, w, 14, 7);
          else ctx.rect(chip.x - w / 2, y - 7, w, 14);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.font = "10px Inter, system-ui, sans-serif";
          ctx.fillText(label, chip.x, y + 0.5);
        }
      }
      ctx.restore();
    });
  }
}

class EventStripView implements IPanePrimitivePaneView {
  constructor(private readonly owner: EventStripPrimitive) {}

  zOrder(): "top" {
    return "top";
  }

  renderer(): IPrimitivePaneRenderer | null {
    return { draw: (target) => this.owner.render(target) };
  }
}