import { DEFAULT_DRAWING_STYLE, TOOL_ANCHORS, type Drawing } from "@ezyview/drawing-tools";

/**
 * JSON import/export for a chart's drawings.
 *
 * The envelope carries a version so a future format change can reject old
 * files instead of misreading them; validation keeps malformed entries out of
 * the store (a bad point would break hit-testing and rendering alike).
 */
export function serializeDrawings(drawings: readonly Drawing[]): string {
  return JSON.stringify({ version: 1, drawings }, null, 2);
}

export type ParseResult = { ok: true; drawings: Drawing[] } | { ok: false; error: string };

export function parseDrawings(json: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: "File is not valid JSON" };
  }
  if (typeof data !== "object" || data === null) return { ok: false, error: "Expected a JSON object" };
  const drawings = (data as { drawings?: unknown }).drawings;
  if (!Array.isArray(drawings)) return { ok: false, error: 'Missing a "drawings" array' };

  const out: Drawing[] = [];
  for (let i = 0; i < drawings.length; i++) {
    const bad = (why: string): ParseResult => ({ ok: false, error: `Drawing ${i}: ${why}` });
    const entry: unknown = drawings[i];
    if (typeof entry !== "object" || entry === null) return bad("not an object");
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== "string" || e.id === "") return bad("missing id");
    if (typeof e.tool !== "string" || !(e.tool in TOOL_ANCHORS)) return bad("unknown tool");
    if (!Array.isArray(e.points)) return bad("missing points");
    for (const p of e.points) {
      if (typeof p !== "object" || p === null) return bad("point is not an object");
      const { time, price } = p as { time?: unknown; price?: unknown };
      if (typeof time !== "number" || !Number.isFinite(time)) return bad("point time is not a finite number");
      if (typeof price !== "number" || !Number.isFinite(price)) return bad("point price is not a finite number");
    }
    if (typeof e.style !== "object" || e.style === null || Array.isArray(e.style)) return bad("style is not an object");
    // Unknown extra fields ride along untouched; known optional fields are
    // checked so garbage cannot reach the renderer.
    if (e.text !== undefined && typeof e.text !== "string") return bad("text is not a string");
    if (e.locked !== undefined && typeof e.locked !== "boolean") return bad("locked is not a boolean");
    if (e.hidden !== undefined && typeof e.hidden !== "boolean") return bad("hidden is not a boolean");
    if (e.name !== undefined && typeof e.name !== "string") return bad("name is not a string");
    if (e.visibility !== undefined) {
      if (typeof e.visibility !== "object" || e.visibility === null || Array.isArray(e.visibility)) {
        return bad("visibility is not an object");
      }
      for (const [unit, on] of Object.entries(e.visibility)) {
        if (typeof on !== "boolean") return bad(`visibility.${unit} is not a boolean`);
      }
    }
    out.push({
      ...(entry as object),
      id: e.id,
      tool: e.tool as Drawing["tool"],
      points: e.points as Drawing["points"],
      // A bare `{}` style is valid; defaults fill the gaps at render time.
      style: { ...DEFAULT_DRAWING_STYLE, ...(e.style as Drawing["style"]) },
    } as Drawing);
  }
  return { ok: true, drawings: out };
}
