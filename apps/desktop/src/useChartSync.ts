import { useEffect } from "react";
import type { ScreenPoint } from "@ezyview/drawing-tools";
import type { Drawing } from "@ezyview/drawing-tools";
import { THEME_OF, useWorkspace } from "./store";
import type { PineScriptRecord } from "./store";
import { useDrawingUi } from "./drawingUi";
import { EMPTY_FUNDAMENTAL_EVENTS } from "./fundamentalEvents";
import { loadImageAssets } from "./imageAssets";
import { applySessionShading, toBands, toInstances, toPlotSpecs } from "./chartHostKit";
import type { HostContext } from "./chartHostKit";
import type { Props } from "./ChartHost";

export interface ChartSyncOptions {
  /** Timeframe- and hide-filtered drawings; the same array the render path uses. */
  visibleDrawings: Drawing[];
  selectedIds: string[];
  scripts: Record<string, PineScriptRecord>;
  hideAllDrawings: boolean;
}

/**
 * Engine prop-sync: pushes every store/prop change into the chart instance.
 * Kept separate from data subscriptions so a settings change never touches
 * the network and vice versa.
 */
export function useChartSync(ctx: HostContext, props: Props, opts: ChartSyncOptions): void {
  const { chartRef, containerRef, pendingRef, onDrawingBoxRef, setGhost } = ctx;
  const { visibleDrawings, selectedIds, scripts, hideAllDrawings } = opts;
  const activeTool = useWorkspace((s) => s.activeTool);
  const eraserMode = useWorkspace((s) => s.eraserMode);
  const crosshairCursor = useDrawingUi((s) => s.crosshairCursor);
  const selectedId = useWorkspace((s) => s.selectedDrawingId);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setTheme(THEME_OF[props.theme]);
    chart.setShowVolume(props.showVolume);
    chart.setShowVolumeProfile(props.showVolumeProfile ?? false);
    chart.setIndicators(toInstances(props.indicators));
  }, [props.theme, props.showVolume, props.showVolumeProfile, props.indicators]);

  // Canvas settings: per-axis grid visibility/colour, crosshair colour/style
  // and the last-price line. Kept separate from the theme effect so a theme
  // change cannot wipe a user's explicit colours.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setGrid({
      vert: props.showVertGrid ?? props.showGrid,
      horz: props.showHorzGrid ?? props.showGrid,
      vertColor: props.gridVertColor ?? null,
      horzColor: props.gridHorzColor ?? null,
    });
    chart.setCrosshair({ color: props.crosshairColor ?? null, style: props.crosshairStyle ?? "dashed" });
    chart.setLastPriceVisible(props.showLastPrice ?? true);
  }, [
    props.showGrid,
    props.showVertGrid,
    props.showHorzGrid,
    props.gridVertColor,
    props.gridHorzColor,
    props.crosshairColor,
    props.crosshairStyle,
    props.showLastPrice,
  ]);

  // Crosshair style, price scale, timezone and watermark — the Phase 4 controls.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setCrosshairMode(props.crosshairMode ?? "normal");
    chart.setPriceScaleMode(props.priceScale ?? "normal");
    chart.setInvertScale(props.invertScale ?? false);
    chart.setTimezone(props.timezone ?? null);
    chart.setWatermark(props.watermark ? `${props.symbol} · ${props.resolution}` : null);
  }, [props.crosshairMode, props.priceScale, props.invertScale, props.timezone, props.watermark, props.symbol, props.resolution]);

  // Crosshair sync: another cell's pointer moves this chart's crosshair.
  // A null target clears a sync-imposed position so the local pointer wins.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const sync = props.syncCrosshair;
    if (sync) chart.showCrosshairAt(sync.price, sync.time);
    else chart.clearCrosshairPosition();
  }, [props.syncCrosshair]);

  // Every run replaces its script's output wholesale; the chart reconciles both
  // layers in one pass so they cannot fight over pane indices.
  useEffect(() => {
    chartRef.current?.setScriptPlots(toPlotSpecs(scripts), toBands(scripts));
  }, [scripts]);


  useEffect(() => {
    chartRef.current?.setChartType(props.chartType);
  }, [props.chartType]);

  useEffect(() => {
    chartRef.current?.setBoxSize(props.boxSize ?? null);
  }, [props.boxSize]);

  useEffect(() => {
    chartRef.current?.setDrawings(visibleDrawings);
    // An undo/redo can drop a selected drawing; never keep a stale id.
    const st = useWorkspace.getState();
    const alive = st.selectedDrawingIds.filter((id) => visibleDrawings.some((d) => d.id === id));
    if (alive.length !== st.selectedDrawingIds.length) st.setDrawingSelection(alive);
    chartRef.current?.setSelection(alive);
  }, [visibleDrawings]);

  // Image drawings store only an asset id; decode once per set and hand the
  // renderer a map it can draw synchronously on the next frame.
  const imageAssetKey = visibleDrawings
    .map((d) => d.image?.assetId)
    .filter((id): id is string => Boolean(id))
    .sort()
    .join("|");
  useEffect(() => {
    let cancelled = false;
    const ids = imageAssetKey ? imageAssetKey.split("|") : [];
    void loadImageAssets(ids).then((images) => {
      if (!cancelled) chartRef.current?.setDrawingImages(images);
    });
    return () => {
      cancelled = true;
    };
  }, [imageAssetKey]);

  // Mirrors every selection change (click, tree, Escape, marquee) onto the
  // primitive. A foreign id simply finds no drawing here, so multi-cell stays
  // correct.
  useEffect(() => {
    chartRef.current?.setSelection(selectedIds);
  }, [selectedIds]);


  // The floating mini-bar follows the selected drawing's box on screen. The
  // callback is read through a ref: cells pass an inline function, and making
  // it an effect dependency would let one box update re-render the page, hand
  // the cell a new callback and start the cycle again.
  useEffect(() => {
    const chart = chartRef.current;
    const drawing = selectedId ? visibleDrawings.find((d) => d.id === selectedId) : null;
    if (!chart || !drawing) {
      onDrawingBoxRef.current?.(null);
      return;
    }
    const pts = chart.projectDrawing(drawing).filter((p): p is ScreenPoint => p !== null);
    if (pts.length === 0) {
      onDrawingBoxRef.current?.(null);
      return;
    }
    const x0 = Math.min(...pts.map((p) => p.x));
    const x1 = Math.max(...pts.map((p) => p.x));
    const y0 = Math.min(...pts.map((p) => p.y));
    const y1 = Math.max(...pts.map((p) => p.y));
    onDrawingBoxRef.current?.({ x: x0 - 6, y: y0 - 6, w: x1 - x0 + 12, h: y1 - y0 + 12 });
  }, [selectedId, visibleDrawings]);


  // Navigate cursor: crosshair for an armed tool, the eraser, or the cursor
  // mode button; the pointer handlers refine it over handles and bodies.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.style.cursor = activeTool || eraserMode || crosshairCursor ? "crosshair" : "";
  }, [activeTool, eraserMode, crosshairCursor]);

  // Position levels are constant, so they only change when a fill does.
  useEffect(() => {
    chartRef.current?.setTradingLines(props.tradingLines ?? []);
  }, [props.tradingLines]);

  // Session shading: recoloured with the theme so the band stays a subtle
  // wash rather than a competing block of colour. Applied alongside the bars in
  // `applyBars`, since the flags are per loaded bar.
  useEffect(() => {
    applySessionShading(ctx);
  }, [props.session, props.theme]);

  // Fundamental overlays: refetched on symbol/toggle change upstream; each
  // cell applies whatever it is given (empty = clear).
  useEffect(() => {
    chartRef.current?.setFundamentalEvents(props.fundamentalEvents ?? EMPTY_FUNDAMENTAL_EVENTS);
  }, [props.fundamentalEvents]);

  // Switching tools abandons any half-placed drawing; arming a tool also
  // leaves selection mode (tools and selection are mutually exclusive).
  useEffect(() => {
    if (!activeTool) {
      pendingRef.current = null;
      setGhost(null);
      chartRef.current?.setPreview(null);
    } else {
      useWorkspace.getState().selectDrawing(null);
      chartRef.current?.setSelection(null);
    }
  }, [activeTool]);

  // Hiding everything also drops the selection and any rubber-band preview, so
  // the floating bar cannot hover over something the user just hid.
  useEffect(() => {
    if (!hideAllDrawings) return;
    chartRef.current?.setPreview(null);
    useWorkspace.getState().selectDrawing(null);
    chartRef.current?.setSelection(null);
  }, [hideAllDrawings]);
}
