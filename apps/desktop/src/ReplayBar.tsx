import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FastForward, Pause, Play, Rewind, X } from "lucide-react";
import { useWorkspace } from "./store";
import type { ReplaySpeed } from "./layout";

interface Props {
  /** Total bars loaded for the active symbol. */
  totalBars: number;
}

/** Base milliseconds per bar at 1×; the speed selector divides it. */
const BASE_MS = 500;

export function ReplayBar({ totalBars }: Props) {
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

  // Global hotkeys for replay bar: Space (play/pause), Left/Right (step), Escape (exit)
  useEffect(() => {
    if (replayBar === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing into an input, textarea or contenteditable
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.code === "ArrowLeft" || e.key === "[") {
        e.preventDefault();
        step(-1);
      } else if (e.code === "ArrowRight" || e.key === "]") {
        e.preventDefault();
        step(1);
      } else if (e.code === "Escape") {
        e.preventDefault();
        stop();
        setReplay(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [replayBar, toggle, step, stop, setReplay]);

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

      {/* Speed Selector */}
      <label className="flex items-center gap-1.5 text-dense text-ev-muted font-medium">
        <span>Speed</span>
        <select
          value={replaySpeed}
          onChange={(e) => setReplaySpeed(Number(e.target.value) as ReplaySpeed)}
          className="rounded border border-ev-line bg-ev-raised px-1.5 py-0.5 text-dense font-semibold text-ev-strong cursor-pointer"
          aria-label="Replay speed"
        >
          <option value={0.1}>0.1×</option>
          <option value={0.5}>0.5×</option>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
          <option value={3}>3×</option>
          <option value={5}>5×</option>
        </select>
      </label>

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
