/**
 * Time ↔ pixel conversion that works beyond the loaded bars.
 *
 * lightweight-charts only maps time through its own bar list: it returns null
 * to the right of the last bar, to the left of the first, and for any time that
 * is not an exact bar timestamp. Drawings need to live there (future targets,
 * ranges placed past "now", anchors from another timeframe), so we rebuild the
 * mapping from the bar list: interpolate inside the data, extrapolate outside
 * using the typical bar gap.
 *
 * `l0` is the x pixel of bar index 0 and `spacing` the pixels per bar; both come
 * from `timeScale().logicalToCoordinate(0 | 1)`.
 */

/** Median gap between consecutive bars, robust to weekend and session gaps. */
export function barStep(times: readonly number[]): number {
  if (times.length < 2) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i += 1) gaps.push(times[i]! - times[i - 1]!);
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)]!;
}

/** Float bar index → time. Linear inside the data, extrapolated outside. */
function indexToTime(times: readonly number[], index: number, step: number): number {
  const last = times.length - 1;
  if (index <= 0) return times[0]! + index * step;
  if (index >= last) return times[last]! + (index - last) * step;
  const lo = Math.floor(index);
  const frac = index - lo;
  return times[lo]! + (times[lo + 1]! - times[lo]!) * frac;
}

/** Time → float bar index. Inverse of `indexToTime`. */
function timeToIndex(times: readonly number[], time: number, step: number): number {
  const last = times.length - 1;
  if (time <= times[0]!) return (time - times[0]!) / step;
  if (time >= times[last]!) return last + (time - times[last]!) / step;
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= time) lo = mid;
    else hi = mid;
  }
  return lo + (time - times[lo]!) / (times[lo + 1]! - times[lo]!);
}

/** Pixel x → epoch seconds, or null when there is not enough data to map. */
export function xToTime(times: readonly number[], l0: number, spacing: number, x: number): number | null {
  const step = barStep(times);
  if (step <= 0 || !Number.isFinite(spacing) || spacing === 0) return null;
  return indexToTime(times, (x - l0) / spacing, step);
}

/** Epoch seconds → pixel x, or null when there is not enough data to map. */
export function timeToX(times: readonly number[], l0: number, spacing: number, time: number): number | null {
  const step = barStep(times);
  if (step <= 0 || !Number.isFinite(spacing) || spacing === 0) return null;
  return l0 + timeToIndex(times, time, step) * spacing;
}
