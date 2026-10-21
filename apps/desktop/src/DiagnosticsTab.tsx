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
        <h2 className="mb-1 text-dense font-medium uppercase tracking-wider text-ev-faint">Performance</h2>
        <dl className="grid max-w-sm grid-cols-2 gap-y-1 text-base">
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
          <h2 className="text-dense font-medium uppercase tracking-wider text-ev-faint">Crash log</h2>
          <button
            type="button"
            onClick={clear}
            disabled={!log}
            className="rounded border border-ev-line px-2 py-0.5 text-dense text-ev-muted hover:text-ev-strong disabled:opacity-40"
          >
            Clear
          </button>
        </div>
        <p className="mb-2 text-dense text-ev-muted">Stored on this machine only; nothing is sent anywhere.</p>
        <pre
          tabIndex={0}
          aria-label="Crash log contents"
          className="max-h-72 overflow-auto rounded border border-ev-line bg-ev-panel p-2 text-dense text-ev-text"
        >
          {log === null ? "Loading…" : log === "" ? "No crashes recorded." : log}
        </pre>
      </section>

      <section aria-label="Third-party notices">
        <h2 className="mb-1 text-dense font-medium uppercase tracking-wider text-ev-faint">Third-party notices</h2>
        <p className="mb-2 text-dense text-ev-muted">
          EzyView is built on open-source components. The charting engine is TradingView Lightweight Charts™, which
          requires this attribution and a link to their site — the link is right here.
        </p>
        <ul className="space-y-1 text-dense">
          <li className="text-ev-text">
            TradingView Lightweight Charts™ — Copyright (с) 2025 TradingView, Inc.{" "}
            <a
              href="https://www.tradingview.com/"
              target="_blank"
              rel="noreferrer noopener"
              className="text-ev-link underline decoration-dotted underline-offset-2 hover:text-ev-strong"
            >
              tradingview.com
            </a>
          </li>
          <li className="text-ev-muted">Full notices ship with the source, in the NOTICE file.</li>
        </ul>
      </section>
    </div>
  );
}
