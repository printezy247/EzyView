/**
 * Layout share files: a layout as pretty JSON, and back.
 *
 * Parsing reuses `restoreLayout`, so an imported file gets the same
 * structural validation as a corrupt localStorage blob: unknown grid → "1",
 * missing chart fields → defaults, indicator defs re-resolved by id (their
 * compute functions never travel in JSON) and unknown ids dropped. Every
 * defect throws the same opaque message, like `pineShare.parseScriptJson`.
 */
import type { IndicatorDef } from "@ezyview/indicators";
import { restoreLayout } from "./layout";
import type { ChartState, Layout } from "./layout";

const FORMAT = "ezyview-layout";
const FORMAT_VERSION = 1;
const NOT_OURS = "Not an EzyView layout";

export function exportLayoutJson(layout: Layout): string {
  return JSON.stringify({ format: FORMAT, version: FORMAT_VERSION, layout }, null, 2);
}

export function parseLayoutJson(
  text: string,
  fallback: ChartState,
  resolveDef: (id: string) => IndicatorDef | null | undefined,
): Layout {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(NOT_OURS);
  }
  if (typeof data !== "object" || data === null) throw new Error(NOT_OURS);
  const envelope = data as Record<string, unknown>;
  if (envelope.format !== FORMAT || envelope.version !== FORMAT_VERSION) throw new Error(NOT_OURS);
  const layout = restoreLayout(envelope.layout, fallback, resolveDef);
  if (!layout) throw new Error(NOT_OURS);
  return layout;
}
