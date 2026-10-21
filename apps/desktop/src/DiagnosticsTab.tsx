import { useEffect, useState } from "react";
import { clearCrashLog, readCrashLog, startPerfSampler } from "./diagnostics";
import type { PerfStats } from "./diagnostics";

/** Settings → Diagnostics: live perf numbers and the local crash log. */
export function DiagnosticsTab() {
  const [stats, setStats] = useState<PerfStats | null>(null);
  const [log, setLog] = useState<string | null>(null);

  useEffect(() => startPerfSampler(setStats), []);
  useEffect(() => {
    void readCrashLog().then(setLog);
  }, []);

  const clear = () => {
    void clearCrashLog().then(() => setLog(""));
  };

  return (
    <div className="space-y-4">
      <section aria-label="Performance">
        <h2 className="mb-1 text-[11px] font-medium uppercase tracking-wider text-ev-faint">Performance</h2>
        <dl className="grid max-w-sm grid-cols-2 gap-y-1 text-[12px]">
          <dt className="text-ev-muted">Frames per second</dt>
          <dd className="text-ev-strong">{stats ? stats.fps : "…"}</dd>
          <dt className="text-ev-muted">Long tasks (&gt;50 ms)</dt>
          <dd className="text-ev-strong">{stats ? stats.longTasks : "…"}</dd>
          <dt className="text-ev-muted">JS heap</dt>
          <dd className="text-ev-strong">{stats?.heapMb == null ? "not reported" : `${stats.heapMb} MB`}</dd>
        </dl>
      </section>

      <section aria-label="Crash log">
        <div className="mb-1 flex items-center gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-ev-faint">Crash log</h2>
          <button
            type="button"
            onClick={clear}
            disabled={!log}
            className="rounded border border-ev-line px-2 py-0.5 text-[11px] text-ev-muted hover:text-ev-strong disabled:opacity-40"
          >
            Clear
          </button>
        </div>
        <p className="mb-2 text-[11px] text-ev-muted">Stored on this machine only; nothing is sent anywhere.</p>
        <pre
          tabIndex={0}
          aria-label="Crash log contents"
          className="max-h-72 overflow-auto rounded border border-ev-line bg-ev-panel p-2 text-[11px] text-ev-text"
        >
          {log === null ? "Loading…" : log === "" ? "No crashes recorded." : log}
        </pre>
      </section>
    </div>
  );
}
