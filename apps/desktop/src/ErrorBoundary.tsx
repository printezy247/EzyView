import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { appendCrash, formatCrash } from "./diagnostics";

interface State {
  failed: boolean;
}

/**
 * Last-resort net for render errors: log locally, then offer a reload instead
 * of leaving a blank window. Workspace data is persisted, so a reload is safe.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    void appendCrash(formatCrash("render", Object.assign(error, { stack: `${error.stack ?? ""}${info.componentStack ?? ""}` })));
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="flex h-screen flex-col items-center justify-center gap-3 bg-ev-bg text-ev-text">
        <p className="text-sm font-semibold text-ev-strong">Something went wrong.</p>
        <p className="text-xs text-ev-muted">The error was saved to the local crash log (Settings → Diagnostics).</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded bg-ev-line px-3 py-1.5 text-xs text-ev-strong hover:bg-ev-line-strong"
        >
          Reload
        </button>
      </div>
    );
  }
}
