import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Play, Save, Trash2, Upload, X, TrendingUp } from "lucide-react";
// Type-only: Monaco itself is dynamically imported so it stays out of the
// initial bundle. Types are erased by the compiler, so this costs nothing.
import type * as Monaco from "monaco-editor";
import { backtest, runPine, pineCompletions, lintPine, optimizePine, DEFAULT_MAX_COMBOS } from "@ezyview/pine-transpiler";
import type {
  BacktestResult,
  Context,
  OptimizationResult,
  ParamSpec,
  PineCompletion,
  PineLintIssue,
} from "@ezyview/pine-transpiler";
import { useWorkspace, uid } from "./store";
import type { PineScriptRecord } from "./store";
import { parseParamValues } from "./pineOptimize";
import { exportScriptJson, parseScriptJson } from "./pineShare";
import { sanitizeExportFilename } from "./exportUi";

interface Props {
  onClose: () => void;
  /** Bars for the active symbol/interval, used as the script's data source. */
  bars: { open: number; high: number; low: number; close: number; volume: number }[];
  symbol: string;
}

/**
 * Make the live script name safe for a download filename. The rule now lives
 * in exportUi.ts (shared with every Phase 8 export); "script" stays the Pine
 * editor's fallback.
 */
export const pineExportFilename = (name: string): string => sanitizeExportFilename(name, "script");

const STARTER = `//@version=6
indicator("My Script", overlay=true)
len = input.int(14, "Length")
ma = ta.sma(close, len)
plot(ma, "SMA", color.blue)
`;

/** Debounce before recomputing lint markers while the user is typing. */
const LINT_DEBOUNCE_MS = 400;

/** A transpile failure that carries a usable 1-based source position. */
interface SyntaxLocation {
  line: number;
  col: number;
  message: string;
}

/**
 * Pull a source position off a thrown error, if it has one. `PineSyntaxError`
 * and `PineUnsupportedError` both carry 1-based `line`/`col`; anything else
 * (a runtime failure) has no position, and callers keep the message-only
 * error bar rather than inventing a marker on line 1.
 */
function errorLocation(e: unknown): SyntaxLocation | null {
  if (typeof e !== "object" || e === null) return null;
  const cand = e as { line?: unknown; col?: unknown; message?: unknown };
  if (typeof cand.line !== "number" || typeof cand.col !== "number") return null;
  return {
    line: cand.line,
    col: cand.col,
    message: typeof cand.message === "string" ? cand.message : String(e),
  };
}

/**
 * Pine script editor, filling its page.
 *
 * Monaco is configured lazily on first mount so the worker and language
 * registration do not cost anything until the editor's route is visited.
 */
export function PineEditor({ onClose, bars, symbol }: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  const editor = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  // Marker updates need the Monaco API outside the mount effect (run button),
  // so it is stashed here alongside the editor it created.
  const monacoApi = useRef<typeof Monaco | null>(null);
  // Position of the last failed run; cleared by the next successful one and
  // whenever a different document is loaded (switch/import/delete/restore),
  // so a debounced refresh never stamps an old buffer's error onto a new one.
  const syntaxError = useRef<SyntaxLocation | null>(null);
  const lintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scriptId, setScriptId] = useState<string>(() => uid());
  const [name, setName] = useState("My Script");
  const [source, setSource] = useState(STARTER);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  // Best combo from the Optimize panel, merged into the next run's inputs so
  // the tester reflects the applied grid point without re-running the grid.
  const [appliedBest, setAppliedBest] = useState<Record<string, number> | null>(null);
  // Transient value of the versions select; cleared on pick so the same
  // entry can be restored again after further edits.
  const [versionChoice, setVersionChoice] = useState("");
  const importInput = useRef<HTMLInputElement | null>(null);

  const scripts = useWorkspace((s) => s.pineScripts);
  const savePineScript = useWorkspace((s) => s.savePineScript);
  const restorePineScriptVersion = useWorkspace((s) => s.restorePineScriptVersion);
  const deletePineScript = useWorkspace((s) => s.deletePineScript);
  const setPineResult = useWorkspace((s) => s.setPineResult);
  const record: PineScriptRecord | undefined = scripts[scriptId];
  // A script switch starts from a clean optimize slate: the previous script's
  // applied combo must not seed the next script's runs.
  useEffect(() => {
    setAppliedBest(null);
  }, [scriptId]);
  // Numeric slice of the last run's input snapshot — the keys the Optimize
  // panel offers (bool/string inputs are not grid-able).
  const numericInputs: Record<string, number> = {};
  for (const [key, value] of Object.entries(record?.inputs ?? {})) {
    if (typeof value === "number") numericInputs[key] = value;
  }

  // Monaco is ~1 MB of JS, so it is fetched on first open rather than bundled
  // into the initial payload — most sessions never visit this route at all.
  useEffect(() => {
    if (!host.current || editor.current) return;
    let disposed = false;
    let sub: Monaco.IDisposable | null = null;

    void loadMonaco().then((monaco) => {
      // The route can unmount while the chunk is still in flight.
      if (disposed || !host.current || editor.current) return;
      registerPineLanguage(monaco);
      const created = monaco.editor.create(host.current, {
        value: source,
        language: "pine",
        theme: "pine-dark",
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 12,
        lineNumbers: "on",
        scrollBeyondLastLine: false,
      });
      editor.current = created;
      monacoApi.current = monaco;
      // First paint: mark the initial buffer immediately instead of staying
      // marker-silent until the first edit or run attempt.
      const initialModel = created.getModel();
      if (initialModel) applyMarkers(monaco, initialModel, lintPine(initialModel.getValue()), null);
      sub = created.onDidChangeModelContent(() => {
        setSource(created.getValue());
        // Lint is cheap but not free — debounce so fast typing does not run
        // it on every keystroke.
        if (lintTimer.current !== null) clearTimeout(lintTimer.current);
        lintTimer.current = setTimeout(() => {
          lintTimer.current = null;
          const model = created.getModel();
          if (model) applyMarkers(monaco, model, lintPine(model.getValue()), syntaxError.current);
        }, LINT_DEBOUNCE_MS);
      });
    });

    return () => {
      disposed = true;
      if (lintTimer.current !== null) {
        clearTimeout(lintTimer.current);
        lintTimer.current = null;
      }
      sub?.dispose();
      editor.current?.dispose();
      editor.current = null;
      monacoApi.current = null;
    };
    // Mount-only: the editor owns its buffer after this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Recompute markers from the live buffer: lint findings always, plus the
   * syntax error of the last failed run when there was one. Monaco may still
   * be loading (the route was only just opened), in which case there is
   * nothing to mark yet.
   */
  const refreshMarkers = useCallback(() => {
    const api = monacoApi.current;
    const model = editor.current?.getModel();
    if (!api || !model) return;
    applyMarkers(api, model, lintPine(model.getValue()), syntaxError.current);
  }, []);

  const run = useCallback(() => {
    if (bars.length === 0) {
      setError("No data loaded for this symbol yet.");
      refreshMarkers();
      return;
    }
    try {
      const ctx: Context = {
        open: bars.map((b) => b.open),
        high: bars.map((b) => b.high),
        low: bars.map((b) => b.low),
        close: bars.map((b) => b.close),
        volume: bars.map((b) => b.volume),
        barIndex: bars.length - 1,
        // A grid point applied via "Apply best" seeds the next run; normal
        // runs without an applied combo start from an empty map (spreading
        // null/undefined is a no-op).
        inputs: { ...appliedBest },
      };
      const scriptRun = runPine(source, ctx);
      // A clean run retires the previous syntax marker; lint findings remain.
      syntaxError.current = null;
      setError(null);
      refreshMarkers();
      // A strategy's orders become fills; an indicator simply has none.
      const tested = backtest(scriptRun.orders, { close: ctx.close });
      setResult(tested);
      // runPine mutates ctx.inputs in place; keep the scalar entries so the
      // tester panel (and the optimizer) can show/apply what this run used.
      const inputs: Record<string, number | string | boolean> = {};
      for (const [key, value] of Object.entries(ctx.inputs)) {
        if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
          inputs[key] = value;
        }
      }
      setPineResult(scriptId, {
        id: scriptId,
        name,
        source,
        options: scriptRun.options,
        plots: scriptRun.plots,
        orders: scriptRun.orders,
        error: null,
        inputs,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      syntaxError.current = errorLocation(e);
      setError(msg);
      refreshMarkers();
      setResult(null);
      setPineResult(scriptId, { id: scriptId, name, source, options: null, plots: [], orders: [], error: msg });
    }
  }, [bars, name, scriptId, source, appliedBest, setPineResult, refreshMarkers]);

  /** Download the live buffer as a share file; the name seeds the filename. */
  const exportScript = (): void => {
    const json = exportScriptJson({ name, source });
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pineExportFilename(name)}.pine.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Import a share file as a new script and switch the editor onto it. */
  const importScriptFile = async (file: File): Promise<void> => {
    try {
      const parsed = parseScriptJson(await file.text());
      const id = uid();
      savePineScript(id, parsed.name, parsed.source);
      setScriptId(id);
      setName(parsed.name);
      setSource(parsed.source);
      editor.current?.setValue(parsed.source);
      // The banner alone is not enough: the old document's syntax marker and
      // backtest result must not be re-stamped onto the imported buffer.
      syntaxError.current = null;
      setError(null);
      setResult(null);
      refreshMarkers();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const versions = record?.versions ?? [];

  return (
    <section
      aria-label="Pine editor"
      className="flex min-h-0 flex-1 flex-col border-t border-ev-raised bg-ev-bg text-[11px]"
    >
      <div className="flex items-center justify-between border-b border-ev-raised px-4 py-2.5">
        <h2 id="pine-editor-title" className="text-sm font-semibold text-ev-strong">Pine Editor — {symbol}</h2>
        <button type="button" onClick={onClose} className="text-ev-muted hover:text-ev-strong" aria-label="Close">
          <X size={16} aria-hidden />
        </button>
      </div>

      <div className="flex items-center gap-2 border-b border-ev-raised px-4 py-2">
        <input
          aria-label="Script name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-48 rounded bg-ev-bg px-2.5 py-1.5 text-sm text-ev-strong outline-none placeholder:text-ev-muted"
          placeholder="Script name"
        />
        <button
          type="button"
          onClick={() => savePineScript(scriptId, name, source)}
          className="flex items-center gap-1 rounded bg-ev-line px-2.5 py-1.5 text-xs text-ev-strong hover:bg-ev-line-strong"
        >
          <Save size={13} aria-hidden /> Save
        </button>
        <button
          type="button"
          onClick={run}
          className="flex items-center gap-1 rounded bg-ev-accent px-2.5 py-1.5 text-xs font-medium text-white hover:bg-ev-accent-hover"
        >
          <Play size={13} aria-hidden /> Add to chart
        </button>
        {versions.length > 0 && (
          <select
            aria-label="Script versions"
            value={versionChoice}
            onChange={(e) => {
              const index = Number(e.target.value);
              setVersionChoice(""); // reset so the same entry can be picked again
              const entry = record?.versions?.[index];
              if (!entry) return;
              restorePineScriptVersion(scriptId, index);
              setSource(entry.source);
              editor.current?.setValue(entry.source);
              // Restored document: retire the failed-run marker and result of
              // the version that was replaced, then re-lint what is now loaded.
              syntaxError.current = null;
              setError(null);
              setResult(null);
              refreshMarkers();
            }}
            className="rounded bg-ev-bg px-2 py-1.5 text-xs text-ev-strong outline-none"
          >
            <option value="">Versions…</option>
            {/* Newest first; the archive is prepend-ordered in the store. */}
            {versions.map((v, i) => (
              <option key={`${v.savedAt}-${i}`} value={String(i)}>
                v{versions.length - i} · {new Date(v.savedAt * 1000).toLocaleString()}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={exportScript}
          className="flex items-center gap-1 rounded bg-ev-line px-2.5 py-1.5 text-xs text-ev-strong hover:bg-ev-line-strong"
        >
          <Download size={13} aria-hidden /> Export
        </button>
        <button
          type="button"
          onClick={() => importInput.current?.click()}
          className="flex items-center gap-1 rounded bg-ev-line px-2.5 py-1.5 text-xs text-ev-strong hover:bg-ev-line-strong"
        >
          <Upload size={13} aria-hidden /> Import
        </button>
        <input
          ref={importInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Reset so importing the same file again re-fires the change event.
            e.target.value = "";
            if (file) void importScriptFile(file);
          }}
        />
        <div className="ml-auto flex items-center gap-1">
          {Object.values(scripts).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setScriptId(s.id);
                setName(s.name);
                setSource(s.source);
                editor.current?.setValue(s.source);
                // New document, new slate: markers/results of the previous
                // script must not describe this buffer.
                syntaxError.current = null;
                setError(null);
                setResult(null);
                refreshMarkers();
              }}
              className={`rounded px-2 py-1 text-xs ${
                s.id === scriptId ? "bg-ev-accent text-white" : "bg-ev-line text-ev-text-2 hover:bg-ev-line-strong"
              }`}
            >
              {s.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              deletePineScript(scriptId);
              setScriptId(uid());
              setName("My Script");
              setSource(STARTER);
              editor.current?.setValue(STARTER);
              // Fresh script: the deleted one's failure marker/result and
              // banner do not belong on the starter buffer.
              syntaxError.current = null;
              setError(null);
              setResult(null);
              refreshMarkers();
            }}
            className="rounded bg-ev-line p-1.5 text-ev-text-2 hover:bg-ev-line-strong"
            aria-label="Delete script"
          >
            <Trash2 size={13} aria-hidden />
          </button>
        </div>
      </div>

      <div ref={host} className="min-h-0 flex-1" />

      {error && (
        <div role="alert" className="border-t border-ev-line bg-ev-down/15 px-4 py-2 text-xs text-ev-down">
          {error}
        </div>
      )}
      {record?.plots.length ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-ev-raised px-4 py-2 text-xs text-ev-text-2">
          <TrendingUp size={13} aria-hidden />
          <span>
            {record.plots.length} plot{record.plots.length === 1 ? "" : "s"}
            {record.orders.length > 0 ? ` · ${record.orders.length} order${record.orders.length === 1 ? "" : "s"}` : ""}
          </span>
          {record.plots.map((p) => (
            <span key={p.title} className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
              {p.title}
            </span>
          ))}
        </div>
      ) : null}

      {result && result.trades.length > 0 && <StrategyTester result={result} inputs={record?.inputs} />}
      {Object.keys(numericInputs).length > 0 && (
        <OptimizePanel
          // Remount on script change so the previous script's grid rows and
          // outcome table do not linger on the new script's panel.
          key={scriptId}
          source={source}
          bars={bars}
          baseInputs={numericInputs}
          appliedBest={appliedBest}
          onApplyBest={setAppliedBest}
        />
      )}
    </section>
  );
}

/**
 * Parameter grid over the last run's numeric inputs.
 *
 * Rows are driven by `baseInputs` (numeric entries of the record's input
 * snapshot); each row's values text parses to a `ParamSpec`. Combos rebuild a
 * fresh context per run — same OHLCV, inputs = base overridden by the combo —
 * so `runPine`'s in-place mutation cannot leak between grid points. A combo
 * whose script throws is skipped by `optimizePine` itself; the hint counts
 * those as `expected - runs.length`.
 */
function OptimizePanel({
  source,
  bars,
  baseInputs,
  appliedBest,
  onApplyBest,
}: {
  source: string;
  bars: { open: number; high: number; low: number; close: number; volume: number }[];
  baseInputs: Record<string, number>;
  appliedBest: Record<string, number> | null;
  onApplyBest: (inputs: Record<string, number>) => void;
}) {
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<OptimizationResult | null>(null);
  const [runHint, setRunHint] = useState<string | null>(null);

  const keys = Object.keys(baseInputs);

  // Parsed on render so the Run button's disabled state matches what a click
  // would actually execute; invalid rows are flagged live, empty ones skipped.
  const specs: ParamSpec[] = [];
  const invalidKeys: string[] = [];
  for (const key of keys) {
    const values = parseParamValues(texts[key] ?? "");
    if (values === null) invalidKeys.push(key);
    else if (values.length > 0) specs.push({ key, values });
  }
  const canRun = specs.length > 0 && bars.length > 0;

  const handleOptimize = (): void => {
    const close = bars.map((b) => b.close);
    const next = optimizePine((vals) => {
      const ctx: Context = {
        open: bars.map((b) => b.open),
        high: bars.map((b) => b.high),
        low: bars.map((b) => b.low),
        close,
        volume: bars.map((b) => b.volume),
        barIndex: bars.length - 1,
        inputs: { ...baseInputs, ...vals },
      };
      return backtest(runPine(source, ctx).orders, { close });
    }, specs);
    setOutcome(next);
    const expected = Math.min(
      specs.reduce((n, s) => n * s.values.length, 1),
      DEFAULT_MAX_COMBOS,
    );
    const notes: string[] = [];
    if (next.capped) notes.push(`capped at ${DEFAULT_MAX_COMBOS}`);
    const failed = expected - next.runs.length;
    if (failed > 0) notes.push(`${failed} combo${failed === 1 ? "" : "s"} failed`);
    // A wholly-failing grid would otherwise report only the count; surface
    // the first thrown message so the script's breakage is visible.
    if (next.firstFailure) notes.push(next.firstFailure);
    setRunHint(notes.length > 0 ? notes.join(" · ") : null);
  };

  return (
    <div className="border-t border-ev-raised px-4 py-2 text-xs">
      <div className="mb-1.5 flex items-center gap-3 text-ev-text-2">
        <span className="font-semibold uppercase tracking-wider text-ev-faint">Optimize</span>
        <button
          type="button"
          onClick={handleOptimize}
          disabled={!canRun}
          className="rounded bg-ev-line px-2.5 py-1 text-ev-strong hover:bg-ev-line-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          Run grid
        </button>
        {appliedBest && (
          <span className="text-ev-muted">
            Next run uses: {Object.entries(appliedBest).map(([k, v]) => `${k}=${v}`).join(" ")}
          </span>
        )}
      </div>

      {keys.map((key) => (
        <div key={key} className="mb-1 flex items-center gap-2">
          <label htmlFor={`opt-values-${key}`} className="w-24 shrink-0 text-ev-faint">
            {key}
          </label>
          <input
            id={`opt-values-${key}`}
            value={texts[key] ?? ""}
            onChange={(e) => setTexts((t) => ({ ...t, [key]: e.target.value }))}
            placeholder="10..50 step 10 or 1,2,3"
            className="w-56 rounded bg-ev-bg px-2 py-1 text-ev-strong outline-none placeholder:text-ev-muted"
          />
          <span className="text-ev-faint">now {baseInputs[key]}</span>
        </div>
      ))}

      {bars.length === 0 && <div className="mb-1 text-ev-muted">No data loaded for this symbol yet.</div>}
      {invalidKeys.length > 0 && (
        <div className="mb-1 text-ev-muted">Ignored invalid rows: {invalidKeys.join(", ")}</div>
      )}
      {!canRun && bars.length > 0 && specs.length === 0 && (
        <div className="mb-1 text-ev-muted">Enter values for at least one input, e.g. 10..50 step 10.</div>
      )}

      {outcome && runHint && <div className="mb-1 text-ev-muted">{runHint}</div>}
      {outcome && outcome.runs.length === 0 && (
        <div className="mb-1 text-ev-muted">No successful runs{outcome.capped ? " (grid capped)" : ""}.</div>
      )}
      {outcome && outcome.best && (
        <>
          <div className="mb-1 flex items-center gap-3 text-ev-text-2">
            <span>
              {outcome.runs.length} run{outcome.runs.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => onApplyBest(outcome.best!.inputs)}
              className="rounded bg-ev-line px-2 py-0.5 text-ev-strong hover:bg-ev-line-strong"
            >
              Apply best
            </button>
          </div>
          <table className="w-full text-left tabular-nums">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-ev-faint">
                <th scope="col" className="py-0.5 font-semibold">Params</th>
                <th scope="col" className="py-0.5 font-semibold">Net PnL</th>
                <th scope="col" className="py-0.5 font-semibold">Win rate</th>
                <th scope="col" className="py-0.5 font-semibold">PF</th>
              </tr>
            </thead>
            <tbody className="text-ev-text-2">
              {/* Runs arrive best-first; the first row is the highlighted best. */}
              {outcome.runs.slice(0, 10).map((r, i) => (
                <tr key={i} className={`border-t border-ev-raised ${i === 0 ? "bg-ev-line/40" : ""}`}>
                  <td className="py-0.5">{Object.entries(r.inputs).map(([k, v]) => `${k}=${v}`).join(" ")}</td>
                  <td className={`py-0.5 ${r.result.totalPnl >= 0 ? "text-ev-up" : "text-ev-down"}`}>
                    {r.result.totalPnl.toFixed(2)}
                  </td>
                  <td className="py-0.5">{(r.result.winRate * 100).toFixed(1)}%</td>
                  <td className="py-0.5">
                    {r.result.profitFactor === null ? "∞" : r.result.profitFactor.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

/** Backtest readout: equity curve, headline metrics, the input snapshot, recent fills. */
function StrategyTester({ result, inputs }: { result: BacktestResult; inputs?: Record<string, number | string | boolean> }) {
  const recent = result.trades.toReversed().slice(0, 5);
  const inputEntries = Object.entries(inputs ?? {});
  return (
    <div className="border-t border-ev-raised px-4 py-2 text-xs">
      <EquityCurve equity={result.equity} />
      <div className="mb-1.5 flex items-center gap-4 text-ev-text-2">
        <span className="font-semibold uppercase tracking-wider text-ev-faint">Strategy Tester</span>
        <Metric label="Trades" value={String(result.trades.length)} />
        <Metric
          label="Net PnL"
          value={result.totalPnl.toFixed(2)}
          tone={result.totalPnl >= 0 ? "pos" : "neg"}
        />
        <Metric label="Win rate" value={`${(result.winRate * 100).toFixed(1)}%`} />
        <Metric
          label="Profit factor"
          value={result.profitFactor === null ? "∞" : result.profitFactor.toFixed(2)}
        />
        <Metric label="Max DD" value={`${(result.maxDrawdown * 100).toFixed(2)}%`} tone="neg" />
        <Metric label="Final equity" value={result.finalEquity.toFixed(2)} />
      </div>
      {inputEntries.length > 0 && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-ev-faint">Inputs</span>
          {inputEntries.map(([key, value]) => (
            <span key={key} className="rounded bg-ev-line px-1.5 py-0.5 text-ev-text-2">
              {key}={String(value)}
            </span>
          ))}
        </div>
      )}
      <table className="w-full text-left tabular-nums">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-ev-faint">
            <th scope="col" className="py-0.5 font-semibold">Side</th>
            <th scope="col" className="py-0.5 font-semibold">Entry</th>
            <th scope="col" className="py-0.5 font-semibold">Exit</th>
            <th scope="col" className="py-0.5 font-semibold">PnL</th>
            <th scope="col" className="py-0.5 font-semibold">Return</th>
          </tr>
        </thead>
        <tbody className="text-ev-text-2">
          {recent.map((t, i) => (
            <tr key={`${t.entryBar}-${t.exitBar}-${i}`} className="border-t border-ev-raised">
              <td className="py-0.5 capitalize">{t.side}</td>
              <td className="py-0.5">
                #{t.entryBar} @ {t.entryPrice.toFixed(2)}
              </td>
              <td className="py-0.5">
                #{t.exitBar} @ {t.exitPrice.toFixed(2)}
              </td>
              <td className={`py-0.5 ${t.pnl >= 0 ? "text-ev-up" : "text-ev-down"}`}>{t.pnl.toFixed(2)}</td>
              <td className={`py-0.5 ${t.returnPct >= 0 ? "text-ev-up" : "text-ev-down"}`}>
                {(t.returnPct * 100).toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Inline equity polyline of per-bar cash (the JournalStatsView approach,
 * smaller). Green when the curve ends flat-or-up vs its start, red otherwise.
 * Single-point and flat arrays stay inside the viewBox — no divide-by-zero.
 */
function EquityCurve({ equity }: { equity: readonly number[] }) {
  if (equity.length === 0) return null;
  const W = 100;
  const H = 40;
  const min = Math.min(...equity);
  const max = Math.max(...equity);
  const span = max - min || 1; // flat curve: pin to the mid-line
  const x = (i: number): number => (equity.length === 1 ? W / 2 : (i / (equity.length - 1)) * W);
  const y = (v: number): number => ((max - v) / span) * H;
  const coords =
    equity.length === 1
      ? `${x(0).toFixed(2)},${y(equity[0]!).toFixed(2)}`
      : equity.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const first = equity[0]!;
  const last = equity[equity.length - 1]!;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mb-1.5 h-10 w-full"
      role="img"
      aria-label={`Equity curve ending at ${last.toFixed(2)}`}
      preserveAspectRatio="none"
    >
      {equity.length === 1 ? (
        // A lone point has no length; a short segment keeps it visible.
        <line
          x1={x(0) - 2}
          y1={y(last)}
          x2={x(0) + 2}
          y2={y(last)}
          stroke={last >= first ? "#3fb950" : "#f85149"}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <polyline
          points={coords}
          fill="none"
          stroke={last >= first ? "#3fb950" : "#f85149"}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  const color = tone === "pos" ? "text-ev-up" : tone === "neg" ? "text-ev-down" : "text-ev-strong";
  return (
    <span className="flex items-center gap-1">
      <span className="text-ev-faint">{label}</span>
      <span className={`font-medium ${color}`}>{value}</span>
    </span>
  );
}

/**
 * Single-line range for a 1-based position, clamped to the model so a stale
 * run-time error cannot point past the end of the buffer.
 */
function markerRange(model: Monaco.editor.ITextModel, line: number, column: number): Monaco.IRange {
  const lineNumber = Math.min(Math.max(1, Math.trunc(line)), model.getLineCount());
  const startColumn = Math.min(Math.max(1, Math.trunc(column)), model.getLineMaxColumn(lineNumber));
  return {
    startLineNumber: lineNumber,
    startColumn,
    endLineNumber: lineNumber,
    endColumn: startColumn + 1,
  };
}

/**
 * Publish lint findings plus the last transpile failure under the `pine`
 * marker owner; an empty list clears every marker we own on the model.
 */
function applyMarkers(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
  issues: PineLintIssue[],
  syntax: SyntaxLocation | null,
): void {
  const markers: Monaco.editor.IMarkerData[] = issues.map((issue) => ({
    severity: issue.severity === "error" ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
    message: issue.message,
    ...markerRange(model, issue.line, issue.column),
  }));
  if (syntax) {
    markers.push({
      severity: monaco.MarkerSeverity.Error,
      message: syntax.message,
      ...markerRange(model, syntax.line, syntax.col),
    });
  }
  monaco.editor.setModelMarkers(model, "pine", markers);
}

/** Register Pine's Monaco language once, with TradingView-like coloring. */
let registered = false;
/**
 * Editor core plus its standard contributions (find, folding, suggest…), but
 * none of the bundled languages. Pine is registered by hand, so pulling in the
 * full package would ship ~9 MB of TypeScript/CSS/HTML/JSON workers for nothing.
 */
async function loadMonaco(): Promise<typeof Monaco> {
  // The only worker the editor core needs (diffing, word ranges, links).
  (self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
    getWorker: () =>
      new Worker(new URL("monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url), { type: "module" }),
  };
  const [, api] = await Promise.all([
    import("monaco-editor/esm/vs/editor/editor.all.js"),
    import("monaco-editor/esm/vs/editor/editor.api.js"),
  ]);
  return api as unknown as typeof Monaco;
}

function registerPineLanguage(monaco: typeof Monaco): void {
  if (registered) return;
  registered = true;

  monaco.languages.register({ id: "pine" });
  monaco.languages.setLanguageConfiguration("pine", {
    comments: { lineComment: "//" },
    brackets: [
      ["(", ")"],
      ["[", "]"],
      ["{", "}"],
    ],
    autoClosingPairs: [
      { open: "(", close: ")" },
      { open: "[", close: "]" },
      { open: "{", close: "}" },
      { open: '"', close: '"', notIn: ["string"] },
    ],
  });

  // Suggestions come from the transpiler's frozen catalog; this map only
  // translates its four kinds into Monaco's icon vocabulary. Plain insertText
  // only — no snippets.
  const completions = pineCompletions();
  const kinds: Record<PineCompletion["kind"], Monaco.languages.CompletionItemKind> = {
    keyword: monaco.languages.CompletionItemKind.Keyword,
    builtin: monaco.languages.CompletionItemKind.Constant,
    namespace: monaco.languages.CompletionItemKind.Module,
    function: monaco.languages.CompletionItemKind.Function,
  };
  monaco.languages.registerCompletionItemProvider("pine", {
    triggerCharacters: [".", ":"],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      // Right after a namespace dot the word range is empty (or holds the
      // member being typed), so inserting the full dotted label would yield
      // "ta.ta.sma". There, insert only the label's last segment; the full
      // label stays the visible/filtered text either way.
      const before = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: Math.max(1, word.startColumn - 1),
        endLineNumber: position.lineNumber,
        endColumn: word.startColumn,
      });
      const afterDot = before === ".";
      return {
        suggestions: completions.map((c) => ({
          label: c.label,
          kind: kinds[c.kind],
          detail: c.detail,
          insertText: afterDot ? c.label.slice(c.label.lastIndexOf(".") + 1) : (c.insertText ?? c.label),
          range,
        })),
      };
    },
  });

  monaco.languages.setMonarchTokensProvider("pine", {
    keywords: [
      "if", "else", "for", "to", "by", "while", "var", "return", "and", "or", "not", "true", "false", "na",
    ],
    typeKeywords: ["int", "float", "bool", "string", "color", "series", "simple"],
    builtins: [
      "open", "high", "low", "close", "volume", "hl2", "hlc3", "ohlc4", "bar_index",
    ],
    namespaces: ["ta", "math", "color", "input", "strategy", "shape", "location", "size"],
    functions: [
      "plot", "plotshape", "bgcolor", "indicator", "strategy", "nz", "na", "crossover", "crossunder",
    ],
    tokenizer: {
      root: [
        [/[a-zA-Z_]\w*/, {
          cases: {
            "@typeKeywords": "type.identifier",
            "@namespaces": "namespace",
            "@keywords": "keyword",
            "@builtins": "constant",
            "@functions": "predefined",
            "@default": "identifier",
          },
        }],
        { include: "@whitespace" },
        [/[{}()[\]]/, "delimiter.brackets"],
        [/[<>]=?|==|!=|:=|\+|-|\*|\/|%|&&|\|\||[<>=!&|^~]/, "operator"],
        [/\d+\.\d+|\d+/, "number"],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, "string", "@string_double"],
      ],
      whitespace: [
        [/[ \t\r\n]+/, ""],
        [/\/\*/, "comment", "@comment"],
        [/\/\/.*$/, "comment"],
      ],
      comment: [
        [/[^/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[/*]/, "comment"],
      ],
      string_double: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, "string", "@pop"],
      ],
    },
  });

  monaco.editor.defineTheme("pine-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "ff7b72" },
      { token: "type.identifier", foreground: "79c0ff" },
      { token: "namespace", foreground: "d2a8ff" },
      { token: "predefined", foreground: "ffa657" },
      { token: "constant", foreground: "79c0ff" },
      { token: "number", foreground: "79c0ff" },
      { token: "string", foreground: "a5d6ff" },
      { token: "comment", foreground: "8b949e" },
      { token: "operator", foreground: "ff7b72" },
    ],
    colors: {
      "editor.background": "#0e1117",
      "editor.lineHighlightBackground": "#161b22",
    },
  });
}
