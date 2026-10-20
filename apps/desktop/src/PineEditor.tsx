import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Save, Trash2, X, TrendingUp } from "lucide-react";
// Type-only: Monaco itself is dynamically imported so it stays out of the
// initial bundle. Types are erased by the compiler, so this costs nothing.
import type * as Monaco from "monaco-editor";
import { backtest, runPine } from "@ezyview/pine-transpiler";
import type { BacktestResult, Context } from "@ezyview/pine-transpiler";
import { useWorkspace, uid } from "./store";
import type { PineScriptRecord } from "./store";

interface Props {
  onClose: () => void;
  /** Bars for the active symbol/interval, used as the script's data source. */
  bars: { open: number; high: number; low: number; close: number; volume: number }[];
  symbol: string;
}

const STARTER = `//@version=6
indicator("My Script", overlay=true)
len = input.int(14, "Length")
ma = ta.sma(close, len)
plot(ma, "SMA", color.blue)
`;

/**
 * Pine script editor, filling its page.
 *
 * Monaco is configured lazily on first mount so the worker and language
 * registration do not cost anything until the editor's route is visited.
 */
export function PineEditor({ onClose, bars, symbol }: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  const editor = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const [scriptId, setScriptId] = useState<string>(() => uid());
  const [name, setName] = useState("My Script");
  const [source, setSource] = useState(STARTER);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);

  const scripts = useWorkspace((s) => s.pineScripts);
  const savePineScript = useWorkspace((s) => s.savePineScript);
  const deletePineScript = useWorkspace((s) => s.deletePineScript);
  const setPineResult = useWorkspace((s) => s.setPineResult);
  const record: PineScriptRecord | undefined = scripts[scriptId];

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
      sub = created.onDidChangeModelContent(() => {
        setSource(created.getValue());
      });
    });

    return () => {
      disposed = true;
      sub?.dispose();
      editor.current?.dispose();
      editor.current = null;
    };
    // Mount-only: the editor owns its buffer after this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = useCallback(() => {
    if (bars.length === 0) {
      setError("No data loaded for this symbol yet.");
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
        inputs: {},
      };
      const scriptRun = runPine(source, ctx);
      setError(null);
      // A strategy's orders become fills; an indicator simply has none.
      const tested = backtest(scriptRun.orders, { close: ctx.close });
      setResult(tested);
      setPineResult(scriptId, {
        id: scriptId,
        name,
        source,
        options: scriptRun.options,
        plots: scriptRun.plots,
        orders: scriptRun.orders,
        error: null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setResult(null);
      setPineResult(scriptId, { id: scriptId, name, source, options: null, plots: [], orders: [], error: msg });
    }
  }, [bars, name, scriptId, source, setPineResult]);

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

      {result && result.trades.length > 0 && <StrategyTester result={result} />}
    </section>
  );
}

/** Backtest readout: headline metrics plus the most recent fills. */
function StrategyTester({ result }: { result: BacktestResult }) {
  const recent = result.trades.toReversed().slice(0, 5);
  return (
    <div className="border-t border-ev-raised px-4 py-2 text-xs">
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

function Metric({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  const color = tone === "pos" ? "text-ev-up" : tone === "neg" ? "text-ev-down" : "text-ev-strong";
  return (
    <span className="flex items-center gap-1">
      <span className="text-ev-faint">{label}</span>
      <span className={`font-medium ${color}`}>{value}</span>
    </span>
  );
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
