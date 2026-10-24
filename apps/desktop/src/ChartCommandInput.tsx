import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { Resolution } from "@ezyview/data-adapters";
import { sourceLabel } from "./chartSource";
import type { EffectiveSource } from "./chartSource";

/** Timeframes offered in the quick switcher. */
export const TIMEFRAMES: readonly string[] = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "1D",
  "1W",
  "1M",
];

const LEGACY_RECENT_KEY = "ezyview.recentSymbols";
const MAX_RECENT = 10;

/** Recent symbols are per source: an MT5 ticker must not lead a demo chart. */
export function recentKey(source: EffectiveSource): string {
  return `${LEGACY_RECENT_KEY}.${source}`;
}

const readRecent = (key: string): string[] => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
};

/** Read recently used symbols for one source, falling back to the old global list. */
export function loadRecent(source: EffectiveSource = "demo"): string[] {
  const own = readRecent(recentKey(source));
  if (own.length > 0) return own;
  // Pre-§26 saves kept one global list. It is a demo-era list, so only demo
  // inherits it; MT5 and live sources start clean instead of showing symbols
  // their provider cannot serve.
  return source === "demo" ? readRecent(LEGACY_RECENT_KEY) : [];
}

/** Persist a symbol as most-recent for its source. */
export function pushRecent(symbol: string, source: EffectiveSource = "demo"): string[] {
  const prev = loadRecent(source).filter((s) => s !== symbol);
  const next = [symbol, ...prev].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(recentKey(source), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

/** Can this symbol be requested from `source`? Keeps cross-feed rows out. */
export function symbolsForSource(symbols: readonly string[], source: EffectiveSource): string[] {
  const clean = symbols.filter((s) => s.trim().length > 0);
  switch (source) {
    case "mt5":
      // MT5 names are bare (EURUSD); the app's demo/live names are prefixed.
      return clean.filter((s) => !s.includes(":"));
    case "binance":
    case "kraken": {
      const prefix = `${source.toUpperCase()}:`;
      return clean.filter((s) => s.toUpperCase().startsWith(prefix));
    }
    case "twelvedata":
      return clean.filter((s) => !s.startsWith("BINANCE:") && !s.startsWith("KRAKEN:"));
    default:
      return clean.filter((s) => s.includes(":"));
  }
}

/** Resolve a typed symbol into the shape the active source expects. */
export function normalizeSymbolForSource(input: string, source: EffectiveSource): string {
  const value = input.trim().toUpperCase();
  if (!value) return "";
  if (source === "mt5") return value.includes(":") ? value.slice(value.lastIndexOf(":") + 1) : value;
  if (source === "twelvedata") return value.replace(":", "/");
  if (source === "binance" || source === "kraken") {
    const prefix = `${source.toUpperCase()}:`;
    if (value.startsWith(prefix)) return value;
    return value.includes(":") ? value : `${prefix}${value}`;
  }
  // Demo: OANDA is the forex pair venue; already-decorated symbols stay put.
  if (value.includes(":")) return value;
  if (/^[A-Z]{6}$/.test(value)) return `OANDA:${value}`;
  return value;
}

/** `EUR/USD` (or `EURUSD`) -> the active source's pair symbol. */
export function resolvePair(input: string, source: EffectiveSource): string | null {
  const value = input.trim().toUpperCase().replace(/\s+/g, "");
  const six = /^[A-Z]{6}$/.exec(value);
  const split = /^([A-Z]{2,5})[/:-]([A-Z]{2,5})$/.exec(value);
  const base = six ? value.slice(0, 3) : split?.[1];
  const quote = six ? value.slice(3) : split?.[2];
  if (!base || !quote) return null;
  switch (source) {
    case "mt5":
      return `${base}${quote}`;
    case "binance":
      return `BINANCE:${base}${quote}`;
    case "kraken":
      return `KRAKEN:${base}${quote}`;
    case "twelvedata":
      return `${base}/${quote}`;
    default:
      return `OANDA:${base}${quote}`;
  }
}

/** Canonical timeframe spelling, or null when it is not in the picker. */
export function normalizeTimeframe(input: string): string | null {
  const value = input.trim();
  // Exact spelling wins first: "1m" and "1M" both lower-case to "1m", and a
  // case-insensitive search would silently turn the monthly timeframe into
  // the minute one.
  const exact = TIMEFRAMES.find((t) => t === value);
  if (exact) return exact;
  const lower = value.toLowerCase();
  const aliases: Record<string, string> = { "60": "1h", "240": "4h", "1d": "1D", "1w": "1W", "1mo": "1M" };
  const alias = aliases[lower];
  if (alias) return alias;
  const folded = TIMEFRAMES.filter((t) => t.toLowerCase() === lower);
  return folded.length === 1 ? folded[0]! : null;
}

/** Step through the picker's timeframe list; clamps at both ends. */
export function stepTimeframe(current: string, delta: number): string | null {
  const normalized = normalizeTimeframe(current);
  if (!normalized) return null;
  const index = TIMEFRAMES.indexOf(normalized);
  const next = Math.max(0, Math.min(TIMEFRAMES.length - 1, index + delta));
  return TIMEFRAMES[next] ?? null;
}

/** Parse a slash command. Returns null when the input is not a command. */
export function parseCommand(input: string): { name: string; args: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const body = trimmed.slice(1).trim();
  if (!body) return null;
  const space = body.indexOf(" ");
  if (space < 0) return { name: body.toLowerCase(), args: "" };
  return { name: body.slice(0, space).toLowerCase(), args: body.slice(space + 1).trim() };
}

/** Filter a symbol list by a query (case-insensitive substring). */
export function filterSymbols(symbols: string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return symbols;
  return symbols.filter((s) => s.toLowerCase().includes(q));
}

interface Props {
  open: boolean;
  symbols: string[];
  currentSymbol: string;
  currentResolution: string;
  /** The cell's resolved feed; symbols and recents are scoped to it. */
  source: EffectiveSource;
  layouts: { id: string; name: string }[];
  onClose: () => void;
  onApply: (symbol: string, resolution: string) => void;
  onApplyLayout: (layoutId: string) => void;
}

type Mode = "symbol" | "timeframe" | "command";

/**
 * Quick chart command input overlay: symbol autocomplete, timeframe list,
 * slash commands, recent symbols, keyboard navigation.
 */
export function ChartCommandInput({
  open,
  symbols,
  currentSymbol,
  currentResolution,
  source,
  layouts,
  onClose,
  onApply,
  onApplyLayout,
}: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const cmd = parseCommand(query);
  const mode: Mode = cmd ? "command" : query.startsWith("@") ? "timeframe" : "symbol";

  const recent = useMemo(() => loadRecent(source), [open, source]);

  const symbolResults = useMemo(() => {
    const pool = symbolsForSource([...recent, ...symbols], source);
    return [...new Set(filterSymbols(pool, query))].slice(0, 20);
  }, [symbols, query, recent, source]);

  const tfResults = useMemo(() => {
    if (mode === "timeframe") {
      const q = query.slice(1).trim().toLowerCase();
      return TIMEFRAMES.filter((t) => t.toLowerCase().includes(q));
    }
    return TIMEFRAMES;
  }, [mode, query]);

  const list = mode === "symbol" ? symbolResults : mode === "timeframe" ? tfResults : [];

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  const applySymbol = (sym: string) => {
    const normalized = normalizeSymbolForSource(sym, source);
    if (!normalized) return;
    pushRecent(normalized, source);
    onApply(normalized, currentResolution);
    onClose();
  };

  const applyTimeframe = (tf: string, close = true) => {
    const normalized = normalizeTimeframe(tf);
    if (!normalized) return;
    onApply(currentSymbol, normalized as Resolution);
    if (close) onClose();
  };

  const step = (delta: number) => {
    const next = stepTimeframe(currentResolution, delta);
    if (next) applyTimeframe(next, false);
  };

  const applyLayout = (args: string) => {
    const name = args.trim().toLowerCase();
    if (!name) return;
    const match = layouts.find((l) => l.id.toLowerCase() === name || l.name.toLowerCase() === name);
    if (match) {
      onApplyLayout(match.id);
      onClose();
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(list.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && query === "" && mode === "symbol") {
      // TradingView-style timeframe stepping from an empty palette. Keep the
      // palette open so several steps can be taken without reopening it.
      e.preventDefault();
      step(e.key === "ArrowRight" ? 1 : -1);
    } else if ((e.key === "+" || e.key === "-") && query === "" && mode === "symbol") {
      e.preventDefault();
      step(e.key === "+" ? 1 : -1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (cmd) {
        if (cmd.name === "tf" && cmd.args) applyTimeframe(cmd.args);
        else if (cmd.name === "sym" && cmd.args) applySymbol(cmd.args);
        else if (cmd.name === "pair" && cmd.args) {
          const pair = resolvePair(cmd.args, source);
          if (pair) applySymbol(pair);
        } else if (cmd.name === "layout") applyLayout(cmd.args);
        else onClose();
        return;
      }
      if (mode === "symbol") {
        const pick = list[active] ?? query.trim();
        if (pick) applySymbol(pick);
      } else if (mode === "timeframe") {
        const pick = list[active];
        if (pick) applyTimeframe(pick);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "Tab") {
      // Tab cycles mode: symbol -> timeframe
      e.preventDefault();
      if (mode === "symbol") setQuery("@");
      else setQuery("");
    }
  };

  return (
    <div className="absolute left-2 top-2 z-40 w-72 rounded border border-ev-line bg-ev-panel shadow-2xl">
      <div className="flex items-center gap-2 border-b border-ev-raised px-3">
        <Search size={14} aria-hidden className="text-ev-muted" />
        <input
          ref={inputRef}
          role="combobox"
          aria-label="Chart command input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          placeholder="Symbol, @timeframe, or /command"
          className="h-9 flex-1 bg-transparent text-body text-ev-strong placeholder:text-ev-faint focus:outline-none"
        />
        <span className="rounded border border-ev-line px-1.5 text-dense text-ev-muted" title="Active data source">
          {sourceLabel(source)}
        </span>
        <kbd className="rounded border border-ev-line px-1.5 text-dense text-ev-muted">Esc</kbd>
      </div>
      {mode === "symbol" && recent.length > 0 && query.trim() === "" && (
        <div className="px-3 py-1 text-micro uppercase tracking-wider text-ev-faint">Recent · {sourceLabel(source)}</div>
      )}
      <ul className="max-h-60 overflow-y-auto py-1">
        {list.length === 0 && <li className="px-3 py-2 text-base text-ev-muted">No matches</li>}
        {list.map((item, i) => (
          <li key={item}>
            <button
              type="button"
              onClick={() => (mode === "symbol" ? applySymbol(item) : applyTimeframe(item))}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full px-3 py-1.5 text-left text-body ${
                i === active ? "bg-ev-raised text-ev-strong" : "text-ev-muted"
              }`}
            >
              {item}
            </button>
          </li>
        ))}
      </ul>
      {cmd && (
        <div className="border-t border-ev-raised px-3 py-1.5 text-dense text-ev-muted">
          Commands: /tf &lt;timeframe&gt;, /sym &lt;symbol&gt;, /pair &lt;base/quote&gt;, /layout &lt;name&gt;
        </div>
      )}
    </div>
  );
}