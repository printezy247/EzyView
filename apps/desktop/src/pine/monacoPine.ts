import type * as Monaco from "monaco-editor";
import { pineCompletions } from "@ezyview/pine-transpiler";
import type { PineCompletion } from "@ezyview/pine-transpiler";
import { themeColors } from "@ezyview/brand";

let registered = false;

export function registerPineLanguage(monaco: typeof Monaco): void {
  if (registered) return;
  registered = true;

  monaco.languages.register({ id: "pine" });
  monaco.languages.setLanguageConfiguration("pine", {
    comments: { lineComment: "//" },
    brackets: [
      ["(", ")"],
      ["[", "]"],
      ["{", "}"],
    ],
    autoClosingPairs: [
      { open: "(", close: ")" },
      { open: "[", close: "]" },
      { open: "{", close: "}" },
      { open: '"', close: '"', notIn: ["string"] },
    ],
  });

  // Suggestions come from the transpiler's frozen catalog; this map only
  // translates its four kinds into Monaco's icon vocabulary. Plain insertText
  // only — no snippets.
  const completions = pineCompletions();
  const kinds: Record<PineCompletion["kind"], Monaco.languages.CompletionItemKind> = {
    keyword: monaco.languages.CompletionItemKind.Keyword,
    builtin: monaco.languages.CompletionItemKind.Constant,
    namespace: monaco.languages.CompletionItemKind.Module,
    function: monaco.languages.CompletionItemKind.Function,
  };
  monaco.languages.registerCompletionItemProvider("pine", {
    triggerCharacters: [".", ":"],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      // Right after a namespace dot the word range is empty (or holds the
      // member being typed), so inserting the full dotted label would yield
      // "ta.ta.sma". There, insert only the label's last segment; the full
      // label stays the visible/filtered text either way.
      const before = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: Math.max(1, word.startColumn - 1),
        endLineNumber: position.lineNumber,
        endColumn: word.startColumn,
      });
      const afterDot = before === ".";
      return {
        suggestions: completions.map((c) => ({
          label: c.label,
          kind: kinds[c.kind],
          detail: c.detail,
          insertText: afterDot ? c.label.slice(c.label.lastIndexOf(".") + 1) : (c.insertText ?? c.label),
          range,
        })),
      };
    },
  });

  monaco.languages.setMonarchTokensProvider("pine", {
    keywords: [
      "if", "else", "for", "to", "by", "while", "var", "return", "and", "or", "not", "true", "false", "na",
    ],
    typeKeywords: ["int", "float", "bool", "string", "color", "series", "simple"],
    builtins: [
      "open", "high", "low", "close", "volume", "hl2", "hlc3", "ohlc4", "bar_index",
    ],
    namespaces: ["ta", "math", "color", "input", "strategy", "shape", "location", "size"],
    functions: [
      "plot", "plotshape", "bgcolor", "indicator", "strategy", "nz", "na", "crossover", "crossunder",
    ],
    tokenizer: {
      root: [
        [/[a-zA-Z_]\w*/, {
          cases: {
            "@typeKeywords": "type.identifier",
            "@namespaces": "namespace",
            "@keywords": "keyword",
            "@builtins": "constant",
            "@functions": "predefined",
            "@default": "identifier",
          },
        }],
        { include: "@whitespace" },
        [/[{}()[\]]/, "delimiter.brackets"],
        [/[<>]=?|==|!=|:=|\+|-|\*|\/|%|&&|\|\||[<>=!&|^~]/, "operator"],
        [/\d+\.\d+|\d+/, "number"],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, "string", "@string_double"],
      ],
      whitespace: [
        [/[ \t\r\n]+/, ""],
        [/\/\*/, "comment", "@comment"],
        [/\/\/.*$/, "comment"],
      ],
      comment: [
        [/[^/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[/*]/, "comment"],
      ],
      string_double: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, "string", "@pop"],
      ],
    },
  });

  definePineTheme(monaco);
}

/** Monaco wants bare RRGGBB, not `#rrggbb` — strip the hash. */
const bare = (hex: string): string => hex.replace("#", "");

/**
 * The Pine editor theme is built from the app's brand tokens (contrast-corrected
 * where a token is too dim for code), and dropped in twice so a theme switch
 * only needs `setTheme`, not a re-parse.
 */
export function definePineTheme(monaco: typeof Monaco): void {
  for (const theme of ["dark", "light"] as const) {
    const c = themeColors(theme);
    monaco.editor.defineTheme(`pine-${theme}`, {
      base: theme === "light" ? "vs" : "vs-dark",
      inherit: true,
      rules: [
        { token: "keyword", foreground: bare(c.accentText) },
        { token: "type.identifier", foreground: bare(c.link) },
        ...(theme === "dark"
          ? [
              { token: "namespace", foreground: "d2a8ff" },
              { token: "predefined", foreground: bare(c.orange) },
              { token: "string", foreground: "a5d6ff" },
            ]
          : []),
        { token: "constant", foreground: bare(c.link) },
        { token: "number", foreground: bare(c.link) },
        { token: "comment", foreground: bare(c.faint) },
        { token: "operator", foreground: bare(c.accentText) },
      ],
      colors: {
        "editor.background": bare(c.bg),
        "editor.lineHighlightBackground": bare(theme === "light" ? c.raised : c.panel),
      },
    });
  }
}
