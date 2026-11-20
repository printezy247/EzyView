/**
 * Motion tokens for the shell — the motion-foundations contract adapted to
 * this Vite/React app (no Next.js, so no "use client" directives).
 *
 * Every spring and duration in the app comes from here; inline values are
 * forbidden. `useReducedMotion()` from motion/react overrides all of it.
 */

export const springs = {
  /** Default UI — buttons, chips, nav items. */
  snappy: { type: "spring", stiffness: 300, damping: 30 },
  /** Cards, panels landing softly. */
  gentle: { type: "spring", stiffness: 120, damping: 14 },
  /** Drag release — natural physics feel. */
  release: { type: "spring", stiffness: 200, damping: 20, restDelta: 0.001 },
} as const;

export const durations = {
  instant: 0.08,
  fast: 0.18,
  normal: 0.35,
  slow: 0.6,
} as const;
