/**
 * Share format for Pine scripts: a tagged, versioned JSON envelope so a
 * `.pine.json` file can be told apart from any other JSON on disk.
 */

/** Minimal script payload — just what a share file carries. */
export interface SharedScript {
  name: string;
  source: string;
}

const FORMAT = "ezyview-pine";
const FORMAT_VERSION = 1;
const NOT_OURS = "Not an EzyView Pine script";

/** Serialize a script as pretty-printed share JSON. */
export function exportScriptJson(record: { name: string; source: string }): string {
  return JSON.stringify(
    { format: FORMAT, version: FORMAT_VERSION, name: record.name, source: record.source },
    null,
    2,
  );
}

/**
 * Parse share JSON back into a script. Anything that is not JSON, not our
 * format tag, a different format version, or missing a string `name`/`source`
 * throws the same opaque error — callers show it verbatim, so it names the
 * format rather than the specific defect.
 */
export function parseScriptJson(text: string): SharedScript {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(NOT_OURS);
  }
  if (typeof data !== "object" || data === null) throw new Error(NOT_OURS);
  const envelope = data as Record<string, unknown>;
  if (envelope.format !== FORMAT || envelope.version !== FORMAT_VERSION) throw new Error(NOT_OURS);
  if (typeof envelope.name !== "string" || typeof envelope.source !== "string") throw new Error(NOT_OURS);
  return { name: envelope.name, source: envelope.source };
}
