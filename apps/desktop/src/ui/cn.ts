import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class strings, with the later utility winning a conflict. */
export function cn(...inputs: Parameters<typeof clsx>): string {
  return twMerge(clsx(inputs));
}
