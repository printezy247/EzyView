import { useCallback, useEffect, useRef } from "react";
import { Pause, Play, Rewind, Square } from "lucide-react";
import { useWorkspace } from "./store";

interface Props {
  /** Total bars loaded for the active symbol. */
  totalBars: number;
}

/**
 * Bar-by-bar replay transport.
 *
 * Play advances the cursor on a timer; the chart slices its cached history to
 * that cursor, so no data is refetched while replaying. The cursor lives in the
 * workspace store because the chart reads it there.
 */
export function ReplayBar({ totalBars }: Props) {
  const replayBar = useWorkspace((s) => s.replayBar);
  const setReplay = useWorkspace((s) => s.setReplay);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const playing = replayBar !== null && timer.current !== null;

  const stop = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
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
    timer.current = setInterval(() => {
      const current = useWorkspace.getState().replayBar ?? 0;
      if (current >= totalBars - 1) {
        stop();
        return;
      }
      setReplay(current + 1);
    }, 120);
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
