import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { Resolution } from "@ezyview/data-adapters";

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

const RECENT_KEY = "ezyview.recentSymbols";
const MAX_RECENT = 10;

/** Read recently used symbols from storage. */
export function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

/** Persist a symbol as most-recent. */
export function pushRecent(symbol: string): string[] {
  const prev = loadRecent().filter((s) => s !== symbol);
  const next = [symbol, ...prev].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
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
  onClose: () => void;
  onApply: (symbol: string, resolution: string) => void;
}

type Mode = "symbol" | "timeframe" | "command";

/**
 * Quick chart command input overlay: symbol autocomplete, timeframe list,
 * slash commands, recent symbols, keyboard navigation.
 */
export function ChartCommandInput({ open, symbols, currentSymbol, currentResolution, onClose, onApply }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const cmd = parseCommand(query);
  const mode: Mode = cmd ? "command" : query.startsWith("@") ? "timeframe" : "symbol";

  const recent = useMemo(() => loadRecent(), [open]);

  const symbolResults = useMemo(() => {
    const pool = symbols.length > 0 ? symbols : recent;
    return filterSymbols(pool, query).slice(0, 20);
  }, [symbols, query, recent]);

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
    pushRecent(sym);
    onApply(sym, currentResolution);
    onClose();
  };

  const applyTimeframe = (tf: string) => {
    onApply(currentSymbol, tf as Resolution);
    onClose();
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(list.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (cmd) {
        // Slash commands
        if (cmd.name === "tf" && cmd.args) applyTimeframe(cmd.args);
        else if (cmd.name === "sym" && cmd.args) applySymbol(cmd.args);
        else if (cmd.name === "layout") onClose();
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
          className="h-9 flex-1 bg-transparent text-sm text-ev-strong placeholder:text-ev-faint focus:outline-none"
        />
        <kbd className="rounded border border-ev-line px-1.5 text-[11px] text-ev-muted">Esc</kbd>
      </div>
      {mode === "symbol" && recent.length > 0 && query.trim() === "" && (
        <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-ev-faint">Recent</div>
      )}
      <ul className="max-h-60 overflow-y-auto py-1">
        {list.length === 0 && <li className="px-3 py-2 text-xs text-ev-muted">No matches</li>}
        {list.map((item, i) => (
          <li key={item}>
            <button
              type="button"
              onClick={() => (mode === "symbol" ? applySymbol(item) : applyTimeframe(item))}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full px-3 py-1.5 text-left text-sm ${
                i === active ? "bg-ev-raised text-ev-strong" : "text-ev-text-2"
              }`}
            >
              {item}
            </button>
          </li>
        ))}
      </ul>
      {cmd && (
        <div className="border-t border-ev-raised px-3 py-1.5 text-[11px] text-ev-muted">
          Commands: /tf &lt;timeframe&gt;, /sym &lt;symbol&gt;
        </div>
      )}
    </div>
  );
}