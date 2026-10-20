import { useCallback, useEffect, useRef } from "react";
import { Pause, Play, Rewind, Square } from "lucide-react";
import { useWorkspace } from "./store";
import type { ReplaySpeed } from "./layout";

interface Props {
  /** Total bars loaded for the active symbol. */
  totalBars: number;
}

/** Base milliseconds per bar at 1×; the speed selector divides it. */
const BASE_MS = 500;

/**
 * Bar-by-bar replay transport.
 *
 * Play advances the cursor on a timer; the chart slices its cached history to
 * that cursor, so no data is refetched while replaying. The cursor lives in the
 * workspace store because the chart reads it there. A recursive timeout (not
 * an interval) so a speed change takes effect on the very next bar.
 */
export function ReplayBar({ totalBars }: Props) {
  const replayBar = useWorkspace((s) => s.replayBar);
  const setReplay = useWorkspace((s) => s.setReplay);
  const replaySpeed = useWorkspace((s) => s.replaySpeed);
  const setReplaySpeed = useWorkspace((s) => s.setReplaySpeed);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playing = replayBar !== null && timer.current !== null;

  const stop = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const toggle = useCallback(() => {
    if (timer.current) {
      stop();
      return;
    }
    // Starting replay from the end would show nothing advance, so rewind first.
    const start = replayBar === null || replayBar >= totalBars - 1 ? 0 : replayBar;
    setReplay(start);
    const schedule = () => {
      const delay = Math.round(BASE_MS / useWorkspace.getState().replaySpeed);
      timer.current = setTimeout(() => {
        const current = useWorkspace.getState().replayBar ?? 0;
        if (current >= totalBars - 1) {
          timer.current = null;
          return;
        }
        setReplay(current + 1);
        schedule();
      }, delay);
    };
    schedule();
  }, [replayBar, setReplay, stop, totalBars]);

  // Tearing down the interval on unmount, and when replay is switched off
  // elsewhere, avoids a timer that outlives the panel.
  useEffect(() => stop, [stop]);
  useEffect(() => {
    if (replayBar === null) stop();
  }, [replayBar, stop]);

  if (replayBar === null) return null;

  const step = useCallback(
    (delta: number) => {
      stop();
      const next = Math.max(0, Math.min(totalBars - 1, (replayBar ?? 0) + delta));
      setReplay(next);
    },
    [replayBar, setReplay, stop, totalBars],
  );

  return (
    <div className="flex items-center gap-2 border-t border-ev-raised bg-ev-panel px-3 py-1.5 text-xs">
      <span className="font-semibold uppercase tracking-wider text-ev-faint">Replay</span>

      <button
        type="button"
        onClick={() => setReplay(0)}
        className="rounded p-1 text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
        aria-label="Rewind to start"
      >
        <Rewind size={13} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => step(-1)}
        className="rounded px-1.5 py-0.5 text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
        aria-label="Step back one bar"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={toggle}
        className="rounded bg-ev-accent p-1 text-white hover:bg-ev-accent-hover"
        aria-label={playing ? "Pause replay" : "Play replay"}
      >
        {playing ? <Pause size={13} aria-hidden /> : <Play size={13} aria-hidden />}
      </button>
      <button
        type="button"
        onClick={() => step(1)}
        className="rounded px-1.5 py-0.5 text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
        aria-label="Step forward one bar"
      >
        ›
      </button>

      <input
        type="range"
        min={0}
        max={Math.max(0, totalBars - 1)}
        value={replayBar}
        onChange={(e) => {
          stop();
          setReplay(Number(e.target.value));
        }}
        className="mx-2 h-1 flex-1 accent-ev-accent"
        aria-label="Replay position"
      />

      <span className="w-24 text-right tabular-nums text-ev-text-2">
        {replayBar + 1} / {totalBars}
      </span>

      <label className="flex items-center gap-1 text-ev-muted">
        Speed
        <select
          value={replaySpeed}
          onChange={(e) => setReplaySpeed(Number(e.target.value) as ReplaySpeed)}
          className="rounded bg-ev-raised px-1 py-0.5 text-ev-strong"
          aria-label="Replay speed"
        >
          <option value={0.5}>0.5×</option>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
          <option value={4}>4×</option>
        </select>
      </label>

      <button
        type="button"
        onClick={() => {
          stop();
          setReplay(null);
        }}
        className="flex items-center gap-1 rounded px-2 py-0.5 text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
      >
        <Square size={11} aria-hidden /> Exit
      </button>
    </div>
  );
}
