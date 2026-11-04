import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { appendCrash, formatCrash } from "./diagnostics";
import { Button } from "./ui";

interface Props {
  children: ReactNode;
  fallback?: (reset: () => void, error: Error | null) => ReactNode;
  onReset?: () => void;
  title?: string;
}

interface State {
  failed: boolean;
  error: Error | null;
}

/**
 * Last-resort net for render errors: log locally, then offer a recovery instead
 * of leaving a blank window. Workspace data is persisted, so a reload or reset is safe.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { failed: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    void appendCrash(formatCrash("render", Object.assign(error, { stack: `${error.stack ?? ""}${info.componentStack ?? ""}` })));
  }

  reset = (): void => {
    this.setState({ failed: false, error: null });
    this.props.onReset?.();
  };

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback) {
      return this.props.fallback(this.reset, this.state.error);
    }
    return (
      <div role="alert" className="flex h-screen flex-col items-center justify-center gap-3 bg-ev-bg text-ev-text">
        <p className="text-body font-semibold text-ev-strong">{this.props.title ?? "Something went wrong."}</p>
        <p className="text-base text-ev-muted">The error was saved to the local crash log (Settings → Diagnostics).</p>
        <Button size="sm" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    );
  }
}
