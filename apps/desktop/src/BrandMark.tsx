import { CandlestickChart } from "lucide-react";

import { cn } from "./ui";

/**
 * The EzyView mark: a cyan tile with a candlestick glyph. Used in the nav
 * rail header and the status footer so the brand reads the same in both
 * collapsed and expanded chrome.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-md bg-ev-accent text-ev-accent-ink",
        className,
      )}
    >
      <CandlestickChart size={13} strokeWidth={2.2} />
    </span>
  );
}
