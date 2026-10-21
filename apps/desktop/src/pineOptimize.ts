/**
 * Parse one Optimize row's values text into the candidate list.
 *
 * Two forms are accepted: an inclusive step range `10..50 step 10`, and a
 * comma list `1,2,3`. Empty text means "skip this row" and parses to an empty
 * array; anything that is neither form — a non-positive step, a reversed
 * range, or a range whose step count exceeds 10_000 — is rejected as null so
 * the panel can flag the row.
 */
export function parseParamValues(text: string): number[] | null {
  const t = text.trim();
  if (t === "") return [];

  const range = /^(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)\s+step\s+(-?\d+(?:\.\d+)?)$/.exec(t);
  if (range) {
    const start = Number(range[1]);
    const stop = Number(range[2]);
    const step = Number(range[3]);
    if (!(step > 0) || stop < start) return null;
    // Count-based so the stop test never trips on float drift (0.30000000004).
    const steps = Math.floor((stop - start) / step + 1e-9);
    // Cap before building: `0..1000000 step 0.001` would mint a billion
    // elements and hang long before the optimizer's own combo budget applies.
    if (steps + 1 > 10_000) return null;
    const out: number[] = [];
    for (let i = 0; i <= steps; i++) {
      out.push(Math.round((start + i * step) * 1e10) / 1e10);
    }
    return out;
  }

  const parts = t.split(",").map((p) => p.trim());
  const out: number[] = [];
  for (const part of parts) {
    const n = Number(part);
    if (part === "" || !Number.isFinite(n)) return null;
    out.push(n);
  }
  return out;
}
