import { useEffect } from "react";
import type { Candle, Quote } from "@ezyview/data-adapters";
import type { CompareSeries } from "@ezyview/chart-engine";
import { useWorkspace } from "./store";
import { loadHistory, resolveSource, RESOLUTION_SECONDS, subscribeLive } from "./data";
import { subscribeQuote } from "./quotePoller";
import { isLiveSourceChoice } from "./chartSource";
import { useMt5 } from "./mt5";
import { mergeQuote } from "./liveBars";
import { applySessionShading, sliceForReplay } from "./chartHostKit";
import type { HostContext } from "./chartHostKit";
import type { Props } from "./ChartHost";


/**
 * Data subscriptions: the initial history load, live last-bar folding, the
 * replay slice and the compare overlays. Everything here reads and writes
 * through refs or the store, so the chart instance outlives prop changes.
 */
export function useChartData(ctx: HostContext, props: Props): void {
  // `auto` follows the global MT5 switch, so re-run the data effects when it flips.
  const globalFeed = useMt5((s) => s.source);
  const feed = resolveSource(props.dataSource);
  const { chartRef, historyRef, historyKeyRef, shownRef, setShown, setLoadError } = ctx;
  useEffect(() => {
    let cancelled = false;
    void loadHistory(props.symbol, props.resolution, undefined, props.dataSource)
      .then((candles: Candle[]) => {
        if (cancelled) return;
        historyRef.current = candles;
        historyKeyRef.current = `${props.symbol}|${props.resolution}|${feed}`;
        // A stale replay cursor from another symbol would index past the end.
        const cursor = useWorkspace.getState().replayBar;
        const bars = sliceForReplay(candles, cursor);
        chartRef.current?.setData(bars);
        setShown(bars);
        // The bars changed, so the per-bar break flags did too.
        applySessionShading(ctx);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        // A failed load used to leave an empty chart with no explanation.
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [props.symbol, props.resolution, props.dataSource, globalFeed]);


  // Revealing bars one at a time re-slices the cached history; no refetch.
  useEffect(() => {
    if (historyRef.current.length === 0) return;
    const bars = sliceForReplay(historyRef.current, props.replayBar ?? null);
    chartRef.current?.setData(bars);
    setShown(bars);
    if (props.replayBar != null) {
      chartRef.current?.scrollToRealTime();
    }
  }, [props.replayBar]);

  // Live last bar: fold the feed's price into the newest candle (a new candle
  // opens on a new period). Replay pauses it. Binance/Kraken/Twelve Data push
  // quotes through `subscribeLive` (the adapter falls back to its own polling);
  // if that cannot start, or for demo and MT5, `quoteOf` is polled. The demo
  // feed's quotes are not tied to its synthetic history, so its first live
  // price is anchored to the last close; real feeds need no anchor.
  useEffect(() => {
    if (props.replayBar != null) return;
    let cancelled = false;
    let busy = false;
    let anchor: number | null = null;
    const step = RESOLUTION_SECONDS[props.resolution];
    const key = `${props.symbol}|${props.resolution}|${feed}`;
    let rafId: number | null = null;
    let unsubscribe: (() => void) | null = null;

    const apply = (q: Quote) => {
      const history = historyRef.current;
      if (cancelled || history.length === 0) return;
      // The bars belong to another symbol/interval/source: do not mix prices in.
      if (historyKeyRef.current !== key) return;
      if (feed === "demo" && anchor === null) anchor = history[history.length - 1]!.close - q.last;
      const price = q.last + (feed === "demo" ? (anchor ?? 0) : 0);
      const merged = mergeQuote(history, price, q.time || Math.floor(Date.now() / 1000), step);
      if (merged === history) return;
      const openedNewBar = merged.length !== history.length;
      historyRef.current = merged;
      shownRef.current = merged;
      const applyLive = () => {
        rafId = null;
        if (cancelled) return;
        // A tick inside the forming bar is one series.update; only a new bar
        // needs the full setData (and the state update behind the legend).
        if (!openedNewBar && chartRef.current?.updateLastBar(merged[merged.length - 1]!)) return;
        chartRef.current?.setData(merged);
        if (openedNewBar) setShown(merged);
      };
      if (typeof requestAnimationFrame === "function") {
        if (rafId === null) rafId = requestAnimationFrame(applyLive);
      } else {
        applyLive();
      }
    };

    const startPolling = () => {
      if (unsubscribe !== null || cancelled) return;
      // A broker quote is one cheap tick; Twelve Data's free key allows ~8 requests/minute.
      const every = feed === "mt5" ? 500 : feed === "twelvedata" ? 8000 : 1000;
      // The shared poller means the legend, ticket and tape on this chart do
      // not add a second request for the symbol the chart already polls.
      unsubscribe = subscribeQuote(props.symbol, (q) => {
        if (!busy && historyRef.current.length > 0 && historyKeyRef.current === key) {
          busy = true;
          try {
            if (q) apply(q);
          } finally {
            busy = false;
          }
        }
      }, { source: props.dataSource, intervalMs: every });
    };

    if (isLiveSourceChoice(feed)) {
      subscribeLive(props.symbol, feed, apply)
        .then((u) => {
          if (cancelled) u?.();
          else if (u) unsubscribe = u;
          else startPolling();
        })
        .catch(startPolling);
    } else {
      startPolling();
    }
    return () => {
      cancelled = true;
      try {
        unsubscribe?.();
      } catch {
        // ignore
      }
      if (rafId !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafId);
    };
  }, [props.symbol, props.resolution, props.replayBar, props.dataSource, globalFeed]);

  // Compare overlays load their own history at the chart's interval. They are
  // aligned in the engine on every data update, so a live tick moves both the
  // primary and its comparisons together.
  const compareKey = (props.compare ?? [])
    .map((c) => `${c.id}:${c.symbol}:${c.color}:${c.mode}:${c.visible === false ? 0 : 1}`)
    .join("|");
  useEffect(() => {
    let cancelled = false;
    const list = (props.compare ?? []).filter((c) => c.visible !== false);
    void Promise.all(
      list.map(async (overlay): Promise<CompareSeries> => ({
        id: overlay.id,
        symbol: overlay.symbol,
        color: overlay.color,
        mode: overlay.mode,
        data: await loadHistory(overlay.symbol, props.resolution, undefined, props.dataSource),
      })),
    )
      .then((series) => {
        if (!cancelled) chartRef.current?.setCompare(series);
      })
      .catch(() => {
        if (!cancelled) chartRef.current?.setCompare([]);
      });
    return () => {
      cancelled = true;
    };
  }, [compareKey, props.resolution, props.dataSource, globalFeed]);
}
