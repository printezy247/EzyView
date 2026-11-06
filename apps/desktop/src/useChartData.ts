import { useEffect } from "react";
import type { Candle, Quote } from "@ezyview/data-adapters";
import type { CompareSeries } from "@ezyview/chart-engine";
import { useWorkspace } from "./store";
import { loadHistory, resolveSource, RESOLUTION_SECONDS, subscribeLive } from "./data";
import { pushQuote, setDemoAnchorBase, subscribeQuote } from "./quotePoller";
import { isLiveSourceChoice } from "./chartSource";
import { useMt5 } from "./mt5";
import { hasBarGap, mergeQuote } from "./liveBars";
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
        // The synthetic demo history is a per-resolution random walk, so the
        // poller anchors demo ticks to this close once for every consumer.
        if (candles.length > 0 && feed === "demo") {
          setDemoAnchorBase(props.symbol, candles[candles.length - 1]!.close, props.dataSource);
        }
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


  // Scrolling to the left edge loads one older page (500 bars) at a time, once
  // per request. A page that adds nothing means the provider has no more, and
  // the edge is left alone until the symbol, interval or feed changes.
  useEffect(() => {
    const { needOlderRef } = ctx;
    const key = `${props.symbol}|${props.resolution}|${feed}`;
    let loading = false;
    let exhausted = false;
    let cancelled = false;
    needOlderRef.current = () => {
      if (loading || exhausted || cancelled || props.replayBar != null) return;
      if (historyKeyRef.current !== key) return;
      const first = historyRef.current[0];
      if (!first) return;
      loading = true;
      void loadHistory(props.symbol, props.resolution, undefined, props.dataSource, first.time)
        .then((older) => {
          if (cancelled || historyKeyRef.current !== key) return;
          const added = chartRef.current?.prependCandles(older) ?? 0;
          if (added === 0) {
            exhausted = true;
            return;
          }
          const merged = chartRef.current?.candles();
          if (merged) {
            historyRef.current = [...merged];
            shownRef.current = historyRef.current;
            setShown(historyRef.current);
            applySessionShading(ctx);
          }
        })
        .catch(() => {
          exhausted = true; // a failing provider is not hammered on every scroll
        })
        .finally(() => {
          loading = false;
        });
    };
    return () => {
      cancelled = true;
      needOlderRef.current = () => {};
    };
  }, [props.symbol, props.resolution, props.dataSource, props.replayBar, globalFeed]);

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
  // quotes through `subscribeLive` (the adapter falls back to its own polling)
  // and each pushed tick is fed into the shared poller, so the header,
  // watchlist and ticket read the price the chart just folded in. If that
  // cannot start, or for demo and MT5, `quoteOf` is polled; demo ticks arrive
  // already anchored to the loaded history's last close (see above).
  useEffect(() => {
    if (props.replayBar != null) return;
    let cancelled = false;
    let busy = false;
    const step = RESOLUTION_SECONDS[props.resolution];
    const key = `${props.symbol}|${props.resolution}|${feed}`;
    let rafId: number | null = null;
    let unsubscribe: (() => void) | null = null;

    let backfilling = false;
    /** Bars were missed (dropped socket, sleep): refetch instead of drawing a hole. */
    const backfill = () => {
      if (backfilling) return;
      backfilling = true;
      void loadHistory(props.symbol, props.resolution, undefined, props.dataSource)
        .then((candles) => {
          if (cancelled || historyKeyRef.current !== key || candles.length === 0) return;
          historyRef.current = candles;
          shownRef.current = candles;
          chartRef.current?.setData(candles);
          setShown(candles);
        })
        .catch(() => {
          /* the next tick will try again */
        })
        .finally(() => {
          backfilling = false;
        });
    };

    const apply = (q: Quote) => {
      const history = historyRef.current;
      if (cancelled || history.length === 0) return;
      // The bars belong to another symbol/interval/source: do not mix prices in.
      if (historyKeyRef.current !== key) return;
      const price = q.last;
      const tickTime = q.time || Math.floor(Date.now() / 1000);
      if (hasBarGap(history, tickTime, step)) backfill();
      const merged = mergeQuote(history, price, tickTime, step, q.tickVolume);
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
      subscribeLive(props.symbol, feed, (q) => {
        apply(q);
        pushQuote(props.symbol, q, props.dataSource);
      })
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
