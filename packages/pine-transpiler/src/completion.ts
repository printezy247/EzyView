/** One editor completion suggestion for the Pine language. */
export interface PineCompletion {
  label: string;
  kind: "keyword" | "builtin" | "namespace" | "function";
  detail: string;
  insertText?: string;
}

// The catalog is a frozen literal — no runtime introspection of `runtime.ts`,
// so the editor's suggestions cannot drift with an accidental export.

const keyword = (label: string): PineCompletion => ({ label, kind: "keyword", detail: "keyword" });
const builtin = (label: string): PineCompletion => ({ label, kind: "builtin", detail: "builtin" });
const namespace = (label: string): PineCompletion => ({ label, kind: "namespace", detail: "namespace" });
/** Top-level callable; `ns` names the namespace a dotted member lives in. */
const fn = (label: string, ns = "function"): PineCompletion => ({ label, kind: "function", detail: ns });
/** Namespace value (color.red, shape.cross, …) — constants and value-bags. */
const value = (label: string, ns: string): PineCompletion => ({ label, kind: "builtin", detail: ns });

const KEYWORDS = [
  "if", "else", "for", "to", "by", "while", "var", "return",
  "and", "or", "not", "true", "false", "na",
  // Type keywords. `color` is omitted: the color namespace owns that label.
  "int", "float", "bool", "string", "series", "simple",
];

const BUILTINS = ["open", "high", "low", "close", "volume", "hl2", "hlc3", "ohlc4", "bar_index"];

const NAMESPACES = ["ta", "math", "color", "input", "strategy", "shape", "location", "size"];

const TOP_LEVEL_FNS = ["plot", "plotshape", "bgcolor", "indicator", "nz", "crossover", "crossunder"];

// Members mirrored by hand from runtime.ts / transpile.ts — only what the
// emitter actually supports reaches the editor.
const TA_FNS = [
  "sma", "ema", "rma", "wma", "stdev", "hma", "highest", "lowest",
  "change", "tr", "atr", "rsi", "crossover", "crossunder", "cross",
];

const MATH_FNS = [
  "abs", "max", "min", "round", "floor", "ceil", "sqrt",
  "pow", "log", "log10", "exp", "sign", "avg", "sum",
];

const INPUT_FNS = ["int", "float", "bool", "string"];

const STRATEGY_FNS = ["entry", "close", "exit", "close_all"];

const COLOR_CONSTS = [
  "red", "green", "blue", "orange", "purple", "yellow",
  "teal", "black", "white", "gray", "silver",
];

const SHAPE_CONSTS = [
  "cross", "xcross", "circle", "triangleup", "trailedtriangleup", "triangledown",
  "arrowup", "arrowdown", "labelup", "labeldown", "square", "diamond",
];

const LOCATION_CONSTS = ["abovebar", "belowbar", "top", "bottom", "absolute"];

const SIZE_CONSTS = ["auto", "tiny", "small", "normal", "large"];

/**
 * Every Pine completion EzyView offers, in a stable order.
 *
 * Labels are unique: where one word carries two roles in Pine (`strategy` is
 * both a declaration and a namespace, `na` both a literal and a call), the
 * namespace or keyword entry owns the label — the inserted text is identical
 * either way, and dotted members (`strategy.entry`) surface via their own
 * labels. `color.new` is callable but lives in the color value-bag, so it is
 * listed as a builtin alongside the color constants.
 */
const CATALOG: PineCompletion[] = [
  ...KEYWORDS.map(keyword),
  ...BUILTINS.map(builtin),
  ...NAMESPACES.map(namespace),
  ...COLOR_CONSTS.map((m) => value(`color.${m}`, "color")),
  value("color.new", "color"),
  ...SHAPE_CONSTS.map((m) => value(`shape.${m}`, "shape")),
  ...LOCATION_CONSTS.map((m) => value(`location.${m}`, "location")),
  ...SIZE_CONSTS.map((m) => value(`size.${m}`, "size")),
  ...TOP_LEVEL_FNS.map((label) => fn(label)),
  ...TA_FNS.map((m) => fn(`ta.${m}`, "ta")),
  ...MATH_FNS.map((m) => fn(`math.${m}`, "math")),
  ...INPUT_FNS.map((m) => fn(`input.${m}`, "input")),
  ...STRATEGY_FNS.map((m) => fn(`strategy.${m}`, "strategy")),
];
Object.freeze(CATALOG);

/** The frozen completion catalog. Cheap to call; the same frozen array every time. */
export function pineCompletions(): PineCompletion[] {
  return CATALOG;
}
