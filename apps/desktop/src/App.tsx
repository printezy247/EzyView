import { Activity, Cpu } from "lucide-react";

/**
 * P0 shell. P1 replaces `<WorkspacePlaceholder>` with the real chart workspace.
 */
export default function App() {
  return (
    <div className="flex h-full flex-col bg-[#0e1117] text-[#d1d4dc]">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-[#1e222d] px-4">
        <span className="font-semibold tracking-tight text-white">EzyView</span>
        <span className="rounded border border-[#2a2e39] px-1.5 py-0.5 text-[11px] text-[#787b86]">
          scaffold
        </span>
        <div className="ml-auto flex items-center gap-2 text-[12px] text-[#787b86]">
          <Cpu size={14} aria-hidden />
          <span>desktop-first · Tauri v2</span>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 items-center justify-center">
        <div className="max-w-md px-8 text-center">
          <div className="mb-4 flex justify-center text-[#2962ff]">
            <Activity size={40} strokeWidth={1.5} aria-hidden />
          </div>
          <h1 className="mb-2 text-lg font-semibold text-white">Workspace coming online</h1>
          <p className="text-sm leading-relaxed text-[#787b86]">
            P0 scaffold is in place: monorepo, typed packages, adapter contracts and the Tauri
            shell. Charts, indicators, drawings and layouts arrive in P1.
          </p>
        </div>
      </main>

      <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-[#1e222d] px-4 text-[11px] text-[#787b86]">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-[#26a69a]" aria-hidden />
          offline demo feed
        </span>
        <span>v0.1.0 · P0</span>
      </footer>
    </div>
  );
}
