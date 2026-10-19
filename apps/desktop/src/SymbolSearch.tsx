import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import type { SymbolInfo } from "@ezyview/data-adapters";
import { searchSymbols } from "./data";

interface Props {
  symbol: string;
  onSelect: (symbol: string) => void;
}

/** Type-ahead symbol picker backed by the active market adapter. */
export function SymbolSearch({ symbol, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SymbolInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery(symbol);
  }, [open, symbol]);

  useEffect(() => {
    if (!open) return;
    setBusy(true);
    const t = setTimeout(() => {
      let cancelled = false;
      void searchSymbols(query).then((found) => {
        if (cancelled) return;
        setResults(found);
        setBusy(false);
      });
      return () => {
        cancelled = true;
      };
    }, 150);
    return () => clearTimeout(t);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded px-2 py-1 text-sm font-semibold text-white hover:bg-[#1e222d]"
      >
        {symbol}
        <ChevronDown size={13} aria-hidden className="text-[#787b86]" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-80 rounded border border-[#2a2e39] bg-[#131722] shadow-xl">
          <div className="flex items-center gap-2 border-b border-[#1e222d] px-3 py-2">
            <Search size={14} aria-hidden className="text-[#787b86]" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search symbol"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-[#787b86]"
            />
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {busy && <li className="px-3 py-2 text-xs text-[#787b86]">Searching…</li>}
            {!busy && results.length === 0 && <li className="px-3 py-2 text-xs text-[#787b86]">No matches</li>}
            {!busy &&
              results.map((s) => (
                <li key={s.symbol}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(s.symbol);
                      setOpen(false);
                    }}
                    className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left hover:bg-[#1e222d]"
                  >
                    <span className="text-sm font-medium text-white">{s.ticker}</span>
                    <span className="truncate text-xs text-[#787b86]">{s.description}</span>
                    <span className="ml-auto shrink-0 text-[10px] uppercase text-[#434651]">{s.assetClass}</span>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
