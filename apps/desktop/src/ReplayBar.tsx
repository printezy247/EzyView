import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FastForward, Pause, Play, Rewind, X } from "lucide-react";
import type { Resolution } from "@ezyview/data-adapters";
import { loadHistory } from "./data";
import { useWorkspace } from "./store";
import type { ReplaySpeed } from "./layout";
import { useShortcut } from "./shortcuts";
import { Select } from "./ui";

interface Props {
  /** Total bars loaded for the active symbol. */
  totalBars: number;
  /** Defaults to the focused chart, so the transport can render in tests. */
  symbol?: string;
  resolution?: Resolution;
}

/** Base milliseconds per bar at 1×; the speed selector divides it. */
const BASE_MS = 500;

/** Multipliers over BASE_MS, with the wall-clock time each one gives per bar. */
const SPEED_OPTIONS = [
  { value: "0.1", label: "5s / bar" },
  { value: "0.167", label: "3s / bar" },
  { value: "0.5", label: "1s / bar" },
  { value: "1", label: "0.5s / bar" },
  { value: "2", label: "0.25s / bar" },
  { value: "3", label: "0.17s / bar" },
  { value: "5", label: "0.1s / bar" },
];

export function ReplayBar({ totalBars, symbol: symbolProp, resolution: resolutionProp }: Props) {
  const symbol = symbolProp ?? useWorkspace.getState().activeChart().symbol;
  const resolution = resolutionProp ?? useWorkspace.getState().activeChart().resolution;
  const replayBar = useWorkspace((s) => s.replayBar);
  const setReplay = useWorkspace((s) => s.setReplay);
  const replaySpeed = useWorkspace((s) => s.replaySpeed);
  const setReplaySpeed = useWorkspace((s) => s.setReplaySpeed);
  const [playing, setPlaying] = useState(false);

  // If replay was requested with a negative index or null-initialized, resolve to 30 bars back
  useEffect(() => {
    if (replayBar !== null && replayBar < 0 && totalBars > 0) {
      setReplay(Math.max(0, totalBars - 30));
    }
  }, [replayBar, totalBars, setReplay]);

  const maxBar = Math.max(0, totalBars - 1);
  const currentBar = replayBar !== null && replayBar >= 0 ? Math.min(replayBar, maxBar) : maxBar;

  const stop = useCallback(() => {
    setPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (playing) {
      stop();
      return;
    }
    // Starting replay from the end rewinds back 30 bars so the user can immediately watch progression
    if (replayBar === null || replayBar >= maxBar) {
      setReplay(Math.max(0, maxBar - 30));
    }
    setPlaying(true);
  }, [playing, stop, replayBar, maxBar, setReplay]);

  const step = useCallback(
    (delta: number) => {
      stop();
      const base = replayBar !== null && replayBar >= 0 ? replayBar : maxBar;
      const next = Math.max(0, Math.min(maxBar, base + delta));
      setReplay(next);
    },
    [replayBar, maxBar, setReplay, stop],
  );

  // Timer loop for playing bars
  useEffect(() => {
    if (!playing || replayBar === null) return;
    if (currentBar >= maxBar) {
      setPlaying(false);
      return;
    }

    const delay = Math.round(BASE_MS / replaySpeed);
    const timer = setTimeout(() => {
      const cur = useWorkspace.getState().replayBar ?? 0;
      if (cur >= maxBar) {
        setPlaying(false);
        return;
      }
      setReplay(cur + 1);
    }, delay);

    return () => clearTimeout(timer);
  }, [playing, currentBar, maxBar, replaySpeed, setReplay, replayBar]);

  // Replay owns Space/arrows while active. The dispatcher blocks these behind
  // a modal or menu; the `when` keeps them inert when replay is off and the
  // bar is only mounted for its hooks.
  useShortcut({
    id: "replay.play-pause",
    combo: "Space",
    priority: 30,
    when: () => replayBar !== null,
    run: () => toggle(),
  });
  useShortcut({
    id: "replay.step-back",
    combo: ["ArrowLeft", "["],
    priority: 30,
    when: () => replayBar !== null,
    run: () => step(-1),
  });
  useShortcut({
    id: "replay.step-forward",
    combo: ["ArrowRight", "]"],
    priority: 30,
    when: () => replayBar !== null,
    run: () => step(1),
  });
  useShortcut({
    id: "replay.exit",
    combo: "Escape",
    priority: 40,
    when: () => replayBar !== null,
    run: () => {
      stop();
      setReplay(null);
    },
  });

  if (replayBar === null) return null;

  const pct = totalBars > 0 ? Math.round(((currentBar + 1) / totalBars) * 100) : 100;

  return (
    <div
      role="region"
      aria-label="Bar Replay Transport"
      className="flex items-center gap-2 border-t border-ev-raised bg-ev-panel/95 px-3 py-1.5 text-base shadow-lg backdrop-blur"
    >
      <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-ev-accent text-dense">
        <span className="size-2 rounded-full bg-ev-accent animate-pulse" />
        <span>Replay</span>
      </div>

      <div className="h-4 w-px bg-ev-raised mx-1" />

      {/* Rewind to start */}
      <button
        type="button"
        onClick={() => {
          stop();
          setReplay(0);
        }}
        className="rounded p-1 text-ev-muted hover:bg-ev-raised hover:text-ev-strong transition-colors"
        title="Rewind to beginning of history"
        aria-label="Rewind to start"
      >
        <Rewind size={14} aria-hidden />
      </button>

      {/* Step backward */}
      <button
        type="button"
        onClick={() => step(-1)}
        className="flex items-center justify-center rounded p-1 text-ev-muted hover:bg-ev-raised hover:text-ev-strong transition-colors"
        title="Step back one bar (Hotkeys: ← or [)"
        aria-label="Step back one bar"
      >
        <ChevronLeft size={16} aria-hidden />
      </button>

      {/* Play / Pause Toggle */}
      <button
        type="button"
        onClick={toggle}
        className="flex size-7 items-center justify-center rounded bg-ev-accent text-white shadow-sm hover:bg-ev-accent-hover transition-colors"
        title={playing ? "Pause replay (Space)" : "Play replay (Space)"}
        aria-label={playing ? "Pause replay" : "Play replay"}
      >
        {playing ? <Pause size={14} aria-hidden /> : <Play size={14} className="ml-0.5" aria-hidden />}
      </button>

      {/* Step forward */}
      <button
        type="button"
        onClick={() => step(1)}
        className="flex items-center justify-center rounded p-1 text-ev-muted hover:bg-ev-raised hover:text-ev-strong transition-colors"
        title="Step forward one bar (Hotkeys: → or ])"
        aria-label="Step forward one bar"
      >
        <ChevronRight size={16} aria-hidden />
      </button>

      {/* Jump to end (realtime) */}
      <button
        type="button"
        onClick={() => {
          stop();
          setReplay(maxBar);
        }}
        className="rounded p-1 text-ev-muted hover:bg-ev-raised hover:text-ev-strong transition-colors"
        title="Jump to latest candle"
        aria-label="Jump to end"
      >
        <FastForward size={14} aria-hidden />
      </button>

      {/* Position Slider */}
      <input
        type="range"
        min={0}
        max={maxBar}
        value={currentBar}
        onChange={(e) => {
          stop();
          setReplay(Number(e.target.value));
        }}
        className="mx-2 h-1.5 flex-1 accent-ev-accent cursor-pointer"
        aria-label="Replay scrub bar position"
      />

      {/* Bar Counter & Percentage */}
      <span className="w-28 text-right num text-dense text-ev-muted font-medium">
        {currentBar + 1} / {totalBars} <span className="text-micro text-ev-faint">({pct}%)</span>
      </span>

      <div className="h-4 w-px bg-ev-raised mx-1" />

      {/* Jump to a date: load the same history the chart holds and pick the
          last bar at or before that day. */}
      <input
        type="date"
        aria-label="Jump replay to date"
        title="Jump replay to a date"
        onChange={(e) => {
          const value = e.target.value;
          if (!value) return;
          const at = Math.floor(new Date(`${value}T00:00:00`).getTime() / 1000);
          if (!Number.isFinite(at)) return;
          void loadHistory(symbol, resolution, undefined, useWorkspace.getState().activeChart().dataSource).then((bars) => {
            let index = bars.findIndex((b) => b.time > at);
            if (index === -1) index = bars.length - 1;
            else index = Math.max(0, index - 1);
            stop();
            setReplay(Math.min(maxBar, Math.max(0, index)));
          });
        }}
        className="h-6 rounded border border-ev-line bg-ev-raised px-1 text-dense text-ev-strong"
      />

      {/* Speed Selector */}
      <div className="flex items-center gap-1.5 text-dense text-ev-muted font-medium">
        <span aria-hidden>Speed</span>
        <Select
          label="Replay speed"
          size="sm"
          value={String(replaySpeed)}
          onChange={(value) => setReplaySpeed(Number(value) as ReplaySpeed)}
          options={SPEED_OPTIONS}
          className="shrink-0"
        />
      </div>

      {/* Exit Button */}
      <button
        type="button"
        onClick={() => {
          stop();
          setReplay(null);
        }}
        className="ml-1 flex items-center gap-1 rounded border border-ev-line px-2 py-0.5 text-dense text-ev-muted hover:border-ev-dim hover:text-ev-strong transition-colors"
        title="Exit bar replay mode (Escape)"
        aria-label="Exit bar replay"
      >
        <X size={12} aria-hidden />
        <span>Exit</span>
      </button>
    </div>
  );
}
