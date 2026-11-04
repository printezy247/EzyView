import { useMt5 } from "./mt5";
import { isLivePublicSymbol } from "./data";

/** One dot that says whether the broker or public live feed is answering. */
export function FeedStatus({ symbol }: { symbol: string }) {
  const source = useMt5((s) => s.source);
  const status = useMt5((s) => s.status);
  const error = useMt5((s) => s.error);

  if (source !== "mt5") {
    const livePublic = isLivePublicSymbol(symbol);
    return (
      <span className="flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-ev-up" aria-hidden />
        {livePublic ? "live market feed" : "market feed"}
      </span>
    );
  }

  const dot =
    status === "online"
      ? "var(--ev-up)"
      : status === "connecting"
        ? "var(--ev-warn)"
        : status === "error"
          ? "var(--ev-down)"
          : "var(--ev-dim)";
  const label =
    status === "online" ? "MT5 live" : status === "connecting" ? "MT5 connecting…" : status === "error" ? "MT5 offline" : "MT5";

  return (
    <span role="status" className="flex items-center gap-1.5" title={error ?? undefined}>
      <span className="size-1.5 rounded-full" style={{ background: dot }} aria-hidden />
      {label}
    </span>
  );
}
