import { useEffect } from "react";
import type { EzyChart } from "@ezyview/chart-engine";
import type { Drawing, DrawingToolId, ScreenPoint } from "@ezyview/drawing-tools";
import {
  defaultStyleForTool,
  isPositionTool,
  setAnchor,
  translateDrawing,
  DEFAULT_DRAWING_STYLE,
} from "@ezyview/drawing-tools";
import { hitTestLevel, moveLevel } from "./priceDrag";
import { logCatch } from "./diagnostics";
import { useDrawingUi } from "./drawingUi";
import { useWorkspace } from "./store";
import type { createChartHostKit } from "./chartHostKit";
import type { HostContext } from "./chartHostKit";
import type { Props } from "./ChartHost";

type ChartHostKit = ReturnType<typeof createChartHostKit>;

/**
 * The gesture controller: one pointer effect owning select/drag/marquee/
 * brush/level-drag, with the same capture/release-pan bookkeeping for all of
 * it. Kept separate from data subscriptions so a tool change never touches
 * the network and vice versa.
 */
export function useDrawingGestures(ctx: HostContext, kit: ChartHostKit, props: Props): void {
  const onLevelPreview = props.onLevelPreview;
  const onLevelCommit = props.onLevelCommit;
  const {
    containerRef,
    chartRef,
    chartIndexRef,
    levelDragRef,
    pendingRef,
    suppressClickRef,
    setGhost,
    setMarquee,
  } = ctx;
  const { hitAt, snapAt, finishDrawing } = kit;

  
  // Selection, dragging, rubber-band previews, freehand strokes and hover
  // cursors share one pointer effect: only one can be active at a time and all
  // need the same capture/release-pan bookkeeping. The pointerdown listener
  // runs in the capture phase, before lightweight-charts' own canvas listeners,
  // so a grab on a drawing stops the event there and the chart never pans.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    type Drag = {
      kind: "drawing";
      /** Every selected drawing moves on a body drag; a handle drag targets one. */
      ids: string[];
      /** 0-based anchor index, or -1 for the body. */
      handle: number;
      /** Pre-drag drawings, pushed as one undo entry when the drag ends. */
      snapshot: Drawing[];
      startPoint: { time: number; price: number };
      moved: boolean;
    };
    type Marquee = {
      kind: "marquee";
      /** Container-relative start and current corner. */
      from: ScreenPoint;
      to: ScreenPoint;
      additive: boolean;
    };
    type LevelDrag = {
      kind: "level";
      /** "SL" or "TP". */
      id: string;
      symbol: string;
      /** Where the line should be drawn while dragging; null until the first move. */
      preview: number | null;
    };
    type BrushDrag = {
      kind: "brush";
      chartIndex: number;
      /** Last appended pointer position, for the 2px throttle. */
      last: ScreenPoint;
    };
    let gesture: Drag | LevelDrag | BrushDrag | Marquee | null = null;

    const localPoint = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const defaultCursor = () => {
      const st = useWorkspace.getState();
      return st.activeTool || st.eraserMode || useDrawingUi.getState().crosshairCursor ? "crosshair" : "";
    };

    /** Style a live preview inherits: the tool's remembered look. */
    const previewStyle = (tool: DrawingToolId) =>
      defaultStyleForTool(tool, useWorkspace.getState().drawingToolStyles[tool] ?? DEFAULT_DRAWING_STYLE);

    /** Snap a preview point to 45° increments around the first anchor. */
    const snapAngle = (
      chart: EzyChart,
      anchor: { time: number; price: number },
      at: ScreenPoint,
      fallback: { time: number; price: number },
    ): { time: number; price: number } => {
      const x0 = chart.timeToCoordinate(anchor.time);
      const y0 = chart.priceToCoordinate(anchor.price);
      if (x0 === null || y0 === null) return fallback;
      const len = Math.hypot(at.x - x0, at.y - y0);
      if (len < 1) return fallback;
      const step = Math.PI / 4;
      const angle = Math.round(Math.atan2(at.y - y0, at.x - x0) / step) * step;
      const conv = chart.screenToTimePrice(x0 + Math.cos(angle) * len, y0 + Math.sin(angle) * len);
      return conv.ok && conv.time !== null && conv.price !== null ? { time: conv.time, price: conv.price } : fallback;
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const chart = chartRef.current;
      const chartIndex = chartIndexRef.current;
      if (!chart || chartIndex === undefined) return;
      const st = useWorkspace.getState();
      const pt = localPoint(e);

      // Freehand: record points from pointerdown to pointerup.
      if (st.activeTool === "brush") {
        const conv = chart.screenToTimePrice(pt.x, pt.y);
        if (!conv.ok || conv.time === null || conv.price === null) return;
        const point = snapAt({ time: conv.time, price: conv.price }, st.magnet);
        pendingRef.current = { tool: "brush", points: [point] };
        gesture = { kind: "brush", chartIndex, last: pt };
        e.stopPropagation();
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        chart.setPanEnabled(false);
        return;
      }
      if (st.activeTool) return;

      // A stop/target line sits on top of the drawings, so it gets first refusal
      // on a grab: the same pixel could otherwise start a drawing drag.
      const levels = levelDragRef.current;
      if (levels) {
        const projected = levels.levels.map((l) => ({ ...l, y: chart.priceToCoordinate(l.price) }));
        const hitLevel = hitTestLevel(projected, pt.y);
        if (hitLevel) {
          e.stopPropagation();
          gesture = { kind: "level", id: hitLevel.id, symbol: levels.symbol, preview: null };
          el.setPointerCapture(e.pointerId);
          chart.setPanEnabled(false);
          return;
        }
      }

      const all = st.activeLayout().charts[chartIndex]?.drawings ?? [];
      const hit = hitAt(pt.x, pt.y, chartIndex);
      if (!hit) {
        // Shift-drag on empty space paints a selection rectangle. Plain drag
        // stays the chart's pan gesture.
        if (e.shiftKey && all.length > 0) {
          e.stopPropagation();
          e.preventDefault();
          suppressClickRef.current = true;
          gesture = { kind: "marquee", from: pt, to: pt, additive: true };
          setMarquee({ from: pt, to: pt });
          el.setPointerCapture(e.pointerId);
          chart.setPanEnabled(false);
        }
        return;
      }
      e.stopPropagation();
      if (e.shiftKey) {
        suppressClickRef.current = true;
        st.toggleDrawingSelection(hit.id);
        chart.setSelection(useWorkspace.getState().selectedDrawingIds);
      } else if (!st.selectedDrawingIds.includes(hit.id)) {
        st.selectDrawing(hit.id);
        chart.setSelection(hit.id);
      }
      const selected = all.filter((d) => useWorkspace.getState().selectedDrawingIds.includes(d.id));
      const targets = selected.length > 0 ? selected : all.filter((d) => d.id === hit.id);
      if (targets.length === 0 || targets.some((d) => d.locked) || st.lockAllDrawings || st.eraserMode) return;
      const start = chart.screenToTimePrice(pt.x, pt.y);
      if (!start.ok || start.time === null || start.price === null) return;
      gesture = {
        kind: "drawing",
        ids: targets.map((d) => d.id),
        handle: targets.length === 1 ? hit.handle : -1,
        snapshot: [...all], // entries are immutable; the array copy is the boundary
        startPoint: { time: start.time, price: start.price },
        moved: false,
      };
      el.setPointerCapture(e.pointerId);
      chart.setPanEnabled(false);
    };

    const onMove = (e: PointerEvent) => {
      const chart = chartRef.current;
      if (!chart) return;
      const pt = localPoint(e);
      const st = useWorkspace.getState();
      const cur = gesture;

      // No gesture: either rubber-band a half-placed drawing or show hover state.
      if (!cur) {
        if (st.activeTool && !st.hideAllDrawings) {
          const pending = pendingRef.current;
          if (!pending || pending.points.length === 0) {
            chart.setPreview(null);
          } else {
            const conv = chart.screenToTimePrice(pt.x, pt.y);
            if (conv.ok && conv.time !== null && conv.price !== null) {
              const want = { time: conv.time, price: conv.price };
              const magnet = e.ctrlKey || e.metaKey ? (st.magnet === "off" ? "weak" : "off") : st.magnet;
              const snapped = magnet === "off" ? want : snapAt(want, magnet);
              const cursorPoint =
                e.shiftKey && pending.points.length === 1
                  ? snapAngle(chart, pending.points[0]!, pt, snapped)
                  : snapped;
              chart.setPreview({
                id: "__preview__",
                tool: pending.tool,
                points: [...pending.points, cursorPoint],
                style: { ...previewStyle(pending.tool) },
              });
            }
          }
          chart.setHovered(null);
          el.style.cursor = "crosshair";
          return;
        }
        const hit = hitAt(pt.x, pt.y);
        chart.setHovered(hit?.id ?? null, hit?.handle ?? null);
        el.style.cursor = hit
          ? st.lockAllDrawings
            ? "not-allowed"
            : hit.handle >= 0
              ? "grab"
              : "move"
          : defaultCursor();
        return;
      }

      if (cur.kind === "brush") {
        if (Math.hypot(pt.x - cur.last.x, pt.y - cur.last.y) < 2) return;
        const conv = chart.screenToTimePrice(pt.x, pt.y);
        const pending = pendingRef.current;
        if (!conv.ok || conv.time === null || conv.price === null || !pending) return;
        cur.last = pt;
        pending.points.push({ time: conv.time, price: conv.price });
        chart.setPreview({
          id: "__preview__",
          tool: "brush",
          points: [...pending.points],
          style: { ...previewStyle("brush") },
        });
        e.preventDefault();
        return;
      }

      if (cur.kind === "marquee") {
        cur.to = pt;
        setMarquee({ from: cur.from, to: pt });
        e.preventDefault();
        return;
      }

      if (cur.kind === "level") {
        // The line follows the pointer visually; the position is only amended on
        // pointerup, so a stray click never moves a stop.
        const price = moveLevel({ id: cur.id, price: 0, y: null }, chart.coordinateToPrice(pt.y));
        if (price !== null) {
          cur.preview = price;
          onLevelPreview?.(cur.symbol, cur.id, price);
        }
        e.preventDefault();
        return;
      }

      const chartIndex = chartIndexRef.current;
      if (chartIndex === undefined) return;
      const conv = chart.screenToTimePrice(pt.x, pt.y);
      if (!conv.ok || conv.time === null || conv.price === null) return;
      for (const id of cur.ids) {
        const target = cur.snapshot.find((d) => d.id === id);
        if (!target) continue;
        let points: { time: number; price: number }[];
        if (cur.handle >= 0) {
          const want = { time: conv.time, price: conv.price };
          const effectiveMagnet = e.ctrlKey || e.metaKey ? (st.magnet === "off" ? "weak" : "off") : st.magnet;
          let snapped = effectiveMagnet === "off" ? want : snapAt(want, effectiveMagnet);
          // Position anatomy: entry/stop/target keep their bar, the width handle
          // keeps its price. Only the axis each one means is draggable.
          if (isPositionTool(target.tool) && cur.handle <= 2) {
            snapped = { time: target.points[cur.handle]!.time, price: snapped.price };
          } else if (isPositionTool(target.tool) && cur.handle === 3) {
            snapped = { time: snapped.time, price: target.points[3]!.price };
          }
          points = setAnchor(target, cur.handle, snapped).points;
          if (e.shiftKey && points.length === 2 && (target.tool === "trend_line" || target.tool === "ray" || target.tool === "extended_line")) {
            const otherIdx = cur.handle === 0 ? 1 : 0;
            points[cur.handle] = { time: snapped.time, price: points[otherIdx]!.price };
          }
        } else {
          points = translateDrawing(target, conv.time - cur.startPoint.time, conv.price - cur.startPoint.price).points;
        }
        st.previewDrawing(id, { points }, chartIndex);
      }
      cur.moved = true;
      e.preventDefault();
    };

    const onFinish = (e: PointerEvent) => {
      const cur = gesture;
      if (!cur) return;
      if (cur.kind === "marquee") {
        const chart = chartRef.current;
        const chartIndex = chartIndexRef.current;
        if (chart && chartIndex !== undefined) {
          const x0 = Math.min(cur.from.x, cur.to.x);
          const x1 = Math.max(cur.from.x, cur.to.x);
          const y0 = Math.min(cur.from.y, cur.to.y);
          const y1 = Math.max(cur.from.y, cur.to.y);
          const all = useWorkspace.getState().activeLayout().charts[chartIndex]?.drawings ?? [];
          const hits = all
            .filter((d) => {
              if (d.hidden) return false;
              const projected = chart.projectDrawing(d).filter((p): p is ScreenPoint => p !== null);
              if (projected.length === 0) return false;
              const bx0 = Math.min(...projected.map((p) => p.x));
              const bx1 = Math.max(...projected.map((p) => p.x));
              const by0 = Math.min(...projected.map((p) => p.y));
              const by1 = Math.max(...projected.map((p) => p.y));
              return bx1 >= x0 && bx0 <= x1 && by1 >= y0 && by0 <= y1;
            })
            .map((d) => d.id);
          const existing = cur.additive ? useWorkspace.getState().selectedDrawingIds : [];
          const ids = [...new Set([...existing, ...hits])];
          useWorkspace.getState().setDrawingSelection(ids);
          chart.setSelection(ids);
        }
        setMarquee(null);
      } else if (cur.kind === "level") {
        if (cur.preview !== null) {
          // One amend carrying only the dragged level, so the other one stays put.
          onLevelCommit?.(cur.symbol, cur.id === "SL" ? { stopLoss: cur.preview } : { takeProfit: cur.preview });
        }
      } else if (cur.kind === "brush") {
        const pending = pendingRef.current;
        if (pending && pending.points.length >= 2) finishDrawing("brush", pending.points, cur.chartIndex);
        pendingRef.current = null;
        chartRef.current?.setPreview(null);
        setGhost(null);
      } else {
        const chartIndex = chartIndexRef.current;
        if (cur.moved && chartIndex !== undefined) {
          useWorkspace.getState().commitDrawingHistory(cur.snapshot, chartIndex);
        }
      }
      try {
        el.releasePointerCapture(e.pointerId);
      } catch (err) {
        // Capture can already be gone (e.g. the window lost the pointer).
        logCatch("pointer-capture", err);
      }
      chartRef.current?.setPanEnabled(true);
      chartRef.current?.setHovered(null);
      el.style.cursor = defaultCursor();
      setMarquee(null);
      gesture = null;
    };

    // Double-click opens the full settings dialog without disturbing a tool.
    const onDoubleClick = (e: MouseEvent) => {
      const st = useWorkspace.getState();
      if (st.activeTool) return;
      const r = el.getBoundingClientRect();
      const hit = hitAt(e.clientX - r.left, e.clientY - r.top);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      st.selectDrawing(hit.id);
      chartRef.current?.setSelection(hit.id);
      useDrawingUi.getState().openSettings(hit.id, "style");
    };

    const onLeave = () => {
      chartRef.current?.setHovered(null);
      el.style.cursor = defaultCursor();
    };

    el.addEventListener("pointerdown", onDown, true);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onFinish);
    el.addEventListener("pointercancel", onFinish);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("dblclick", onDoubleClick, true);
    return () => {
      el.removeEventListener("pointerdown", onDown, true);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onFinish);
      el.removeEventListener("pointercancel", onFinish);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("dblclick", onDoubleClick, true);
      if (gesture) chartRef.current?.setPanEnabled(true);
    };
  }, []);
}
