import type { LiveSourceId } from "@ezyview/data-adapters";

/** What a chart cell stores: `auto` follows the global feed switch. */
export type DataSourceChoice = "auto" | "demo" | "mt5" | LiveSourceId;
/** What a chart actually reads from once `auto` is resolved. */
export type EffectiveSource = Exclude<DataSourceChoice, "auto">;

const CHOICES = new Set<string>(["auto", "demo", "mt5", "binance", "kraken", "twelvedata"]);

export const isDataSourceChoice = (v: unknown): v is DataSourceChoice => typeof v === "string" && CHOICES.has(v);

/** `auto` = today's behaviour: the global MT5 switch, else the demo/public feed. */
export function effectiveSource(choice: DataSourceChoice | undefined, globalFeed: "mt5" | "ezyview"): EffectiveSource {
  if (!choice || choice === "auto") return globalFeed === "mt5" ? "mt5" : "demo";
  return choice;
}

const LABELS: Record<EffectiveSource | "auto", string> = {
  auto: "Auto",
  demo: "EzyView demo",
  mt5: "Broker MT5",
  binance: "Binance",
  kraken: "Kraken",
  twelvedata: "Twelve Data",
};

export const sourceLabel = (id: EffectiveSource | "auto"): string => LABELS[id];

/** Non-blocking note for the order forms; null when the price matches the fill venue. */
export function orderWarning(effective: EffectiveSource, mt5TakesOrders: boolean): string | null {
  if (!mt5TakesOrders || effective === "mt5") return null;
  return `Chart price is from ${sourceLabel(effective)}; MT5 fills at the broker price`;
}

export interface SourceOption {
  id: DataSourceChoice;
  label: string;
  disabled?: boolean;
  hint?: string;
}

/** Dropdown rows: the always-on sources plus live sources that handle this symbol. */
export function sourceOptions(
  symbol: string,
  deps: { supports: (id: LiveSourceId, symbol: string) => boolean; hasTwelveKey: boolean },
): SourceOption[] {
  const out: SourceOption[] = (["auto", "demo", "mt5"] as const).map((id) => ({ id, label: sourceLabel(id) }));
  for (const id of ["binance", "kraken", "twelvedata"] as const) {
    if (!deps.supports(id, symbol)) continue;
    const noKey = id === "twelvedata" && !deps.hasTwelveKey;
    out.push({ id, label: sourceLabel(id), ...(noKey ? { disabled: true, hint: "Add a key in API keys" } : {}) });
  }
  return out;
}

/** A live source id, as opposed to auto/demo/MT5. */
export const isLiveSourceChoice = (id: DataSourceChoice | EffectiveSource): id is LiveSourceId =>
  id === "binance" || id === "kraken" || id === "twelvedata";
