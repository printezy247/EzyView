import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Play, Save, Trash2, Upload, X, TrendingUp } from "lucide-react";
// Type-only: Monaco itself is dynamically imported so it stays out of the
// initial bundle. Types are erased by the compiler, so this costs nothing.
import type * as Monaco from "monaco-editor";
import { lintPine } from "@ezyview/pine-transpiler";
import type { BacktestResult, Context, PineLintIssue } from "@ezyview/pine-transpiler";
import { runPineWithBudget } from "./pineRunner";
import { useWorkspace, uid } from "./store";
import type { PineScriptRecord } from "./store";
import { exportScriptJson, parseScriptJson } from "./pineShare";
import { sanitizeExportFilename } from "./exportUi";
import { Button, IconButton, Input, Select } from "./ui";
import { StrategyTester } from "./pine/StrategyTester";
import { OptimizePanel } from "./pine/OptimizePanel";
import { registerPineLanguage } from "./pine/monacoPine";

interface Props {
  onClose: () => void;
  /** Bars for the active symbol/interval, used as the script's data source. */
  bars: { open: number; high: number; low: number; close: number; volume: number }[];
  symbol: string;
  /** The app theme, so the code editor matches the shell. */
  uiTheme: "dark" | "light" | "tokyo";
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

export interface BacktestParams {
  initialCash: number;
  commission: number;
  commissionType: "cash" | "percent";
  slippage: number;
  multiplier: number;
  fillOnNextOpen: boolean;
}

export const DEFAULT_BACKTEST_PARAMS: BacktestParams = {
  initialCash: 10_000,
  commission: 0,
  commissionType: "cash",
  slippage: 0,
  multiplier: 1,
  fillOnNextOpen: false,
};

export function loadBacktestParams(id: string): BacktestParams {
  try {
    const raw = localStorage.getItem(`pine_costs_${id}`);
    if (raw) return { ...DEFAULT_BACKTEST_PARAMS, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return DEFAULT_BACKTEST_PARAMS;
}

export function saveBacktestParams(id: string, params: BacktestParams): void {
  try {
    localStorage.setItem(`pine_costs_${id}`, JSON.stringify(params));
  } catch {
    // ignore
  }
}

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
export function PineEditor({ onClose, bars, symbol, uiTheme }: Props) {
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
  const [backtestParams, setBacktestParams] = useState<BacktestParams>(() => loadBacktestParams(scriptId));
  // Best combo from the Optimize panel, merged into the next run's inputs so
  // the tester reflects the applied grid point without re-running the grid.
  const [appliedBest, setAppliedBest] = useState<Record<string, number> | null>(null);
  // Transient value of the versions select; cleared on pick so the same
  // entry can be restored again after further edits.
  const [versionChoice, setVersionChoice] = useState("");
  // While the runner worker executes the script (budget-bounded): the Run
  // button disables so double-clicks cannot stack identical jobs.
  const [runBusy, setRunBusy] = useState(false);
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
    setBacktestParams(loadBacktestParams(scriptId));
  }, [scriptId]);

  const updateBacktestParams = (patch: Partial<BacktestParams>) => {
    setBacktestParams((prev) => {
      const next = { ...prev, ...patch };
      saveBacktestParams(scriptId, next);
      return next;
    });
  };
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
        theme: `pine-${uiTheme === "light" ? "light" : "dark"}`,
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

  // Follow app-theme switches without rebuilding the editor (both variants
  // were registered up front).
  useEffect(() => {
    monacoApi.current?.editor.setTheme(uiTheme === "light" ? "pine-light" : "pine-dark");
  }, [uiTheme]);

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
    if (runBusy) return;
    setRunBusy(true);
    const fail = (e: unknown): void => {
      // Errors thrown off the worker are message-only; a transpile failure that
      // ran inline still carries line/col for the marker.
      const msg = e instanceof Error ? e.message : String(e);
      syntaxError.current = errorLocation(e);
      setError(msg);
      refreshMarkers();
      setResult(null);
      setPineResult(scriptId, { id: scriptId, name, source, options: null, plots: [], orders: [], error: msg });
      setRunBusy(false);
    };
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
    // The runner executes in a Worker with a time budget; it answers with the
    // run plus the scalar inputs (the worker's copy of ctx.inputs), so the
    // tester panel (and the optimizer) can show/apply what this run used.
    const effectiveCommission =
      backtestParams.commissionType === "percent"
        ? (backtestParams.commission / 100) * (bars[bars.length - 1]?.close ?? 1)
        : backtestParams.commission;

    void runPineWithBudget(source, ctx, {
      backtestOpts: {
        initialCash: backtestParams.initialCash,
        commission: effectiveCommission,
        slippage: backtestParams.slippage,
        contractMultiplier: backtestParams.multiplier,
        fillOnClose: !backtestParams.fillOnNextOpen,
      },
    })
      .then(({ result: scriptRun, inputs, tested }) => {
        // A clean run retires the previous syntax marker; lint findings remain.
        syntaxError.current = null;
        setError(null);
        refreshMarkers();
        // A strategy's orders become fills; an indicator simply has none.
        setResult(tested);
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
      })
      .catch(fail)
      .finally(() => setRunBusy(false));
  }, [bars, name, scriptId, source, appliedBest, setPineResult, refreshMarkers, runBusy, backtestParams]);

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
      className="flex min-h-0 flex-1 flex-col border-t border-ev-raised bg-ev-bg text-dense"
    >
      <div className="flex items-center justify-between border-b border-ev-raised px-4 py-2.5">
        <h2 id="pine-editor-title" className="text-body font-semibold text-ev-strong">Pine Editor — {symbol}</h2>
        <IconButton size="sm" label="Close" onClick={onClose}>
          <X size={16} aria-hidden />
        </IconButton>
      </div>

      <div className="flex items-center gap-2 border-b border-ev-raised px-4 py-2">
        <Input
          aria-label="Script name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-48"
          placeholder="Script name"
        />
        <Button variant="outline" onClick={() => savePineScript(scriptId, name, source)}>
          <Save size={13} aria-hidden /> Save
        </Button>
        <Button variant="solid" onClick={run} disabled={runBusy}>
          <Play size={13} aria-hidden /> Add to chart
        </Button>
        {versions.length > 0 && (
          <Select
            label="Script versions"
            placeholder="Versions…"
            value={versionChoice}
            options={[
              { value: "", label: "Versions…" },
              ...versions.map((v, i) => ({
                value: String(i),
                label: `v${versions.length - i} · ${new Date(v.savedAt * 1000).toLocaleString()}`,
              })),
            ]}
            onChange={(value) => {
              const index = Number(value);
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
          />
        )}
        <Button variant="outline" onClick={exportScript}>
          <Download size={13} aria-hidden /> Export
        </Button>
        <Button variant="outline" onClick={() => importInput.current?.click()}>
          <Upload size={13} aria-hidden /> Import
        </Button>
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
              className={`rounded px-2 py-1 text-base ${
                s.id === scriptId ? "bg-ev-accent text-white" : "bg-ev-line text-ev-muted hover:bg-ev-line-strong"
              }`}
            >
              {s.name}
            </button>
          ))}
          <IconButton
            size="sm"
            label="Delete script"
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
            className="text-ev-muted"
          >
            <Trash2 size={13} aria-hidden />
          </IconButton>
        </div>
      </div>

      <div ref={host} className="min-h-0 flex-1" />

      {error && (
        <div role="alert" className="border-t border-ev-line bg-ev-down/15 px-4 py-2 text-base text-ev-down-text">
          {error}
        </div>
      )}
      {record?.plots.length ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-ev-raised px-4 py-2 text-base text-ev-muted">
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

      {result && result.trades.length > 0 && (
        <StrategyTester
          result={result}
          inputs={record?.inputs}
          costs={backtestParams}
          onCostsChange={updateBacktestParams}
        />
      )}
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

/** Parameter grid over the last run's numeric inputs.
 *
 * Rows are driven by `baseInputs` (numeric entries of the record's input
 * snapshot); each row's values text parses to a `ParamSpec`. Combos rebuild a
 * fresh context per run — same OHLCV, inputs = base overridden by the combo —
 * so `runPine`'s in-place mutation cannot leak between grid points. A combo
 * whose script throws is skipped by `optimizePine` itself; the hint counts
 * those as `expected - runs.length`.
 */
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
