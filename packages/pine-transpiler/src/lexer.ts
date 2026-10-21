/** Thrown for any syntax error, carrying the source position. */
export class PineSyntaxError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly col: number,
  ) {
    super(`Pine syntax error at ${line}:${col} — ${message}`);
    this.name = "PineSyntaxError";
  }
}

export type TokenType =
  | "number"
  | "string"
  | "ident"
  | "op"
  | "punct"
  | "newline"
  | "eof";

export interface Token {
  type: TokenType;
  /** Raw source text of the token. */
  value: string;
  /** Parsed value for numbers and strings. */
  literal?: number | string;
  line: number;
  col: number;
}

/** Longest-match-first, so `:=` beats `:` and `>=` beats `>`. */
const OPERATORS = [
  ":=",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "<<",
  ">>",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "=",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "%",
  "?",
  ":",
  "!",
  "&",
  "|",
  "^",
  "~",
] as const;

const PUNCT = ["(", ")", "[", "]", "{", "}", ",", "."] as const;

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

/**
 * Turn Pine source into a token stream.
 *
 * Newlines are significant in Pine (they terminate statements), so they are
 * emitted as tokens rather than skipped. Comments are dropped.
 */
export function lex(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const push = (type: TokenType, value: string, literal?: number | string): void => {
    tokens.push({ type, value, literal, line, col });
    col += value.length;
  };

  while (i < source.length) {
    const ch = source[i]!;

    // Line comments, including the //@version directive which we only need to
    // tolerate — the transpiler targets v5/v6 semantics regardless.
    if (ch === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }

    if (ch === "\n") {
      push("newline", "\n");
      i++;
      line++;
      col = 1;
      continue;
    }

    if (ch === " " || ch === "\t" || ch === "\r") {
      i++;
      col++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      i++;
      col++;
      let text = "";
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\" && i + 1 < source.length) {
          const next = source[i + 1]!;
          text += next === "n" ? "\n" : next === "t" ? "\t" : next;
          i += 2;
          col += 2;
          continue;
        }
        text += source[i];
        i++;
        col++;
      }
      i++;
      col++;
      push("string", source.slice(start, i), text);
      continue;
    }

    if (isDigit(ch) || (ch === "." && isDigit(source[i + 1] ?? ""))) {
      const start = i;
      while (i < source.length && (isDigit(source[i]!) || source[i] === ".")) {
        i++;
        col++;
      }
      // Hex literals, e.g. 0xff.
      const raw = source.slice(start, i);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new PineSyntaxError("number literal must be finite", line, col);
      push("number", raw, value);
      continue;
    }

    if (isIdentStart(ch)) {
      const start = i;
      while (i < source.length && isIdentPart(source[i]!)) {
        i++;
        col++;
      }
      push("ident", source.slice(start, i));
      continue;
    }

    const op = OPERATORS.find((o) => source.startsWith(o, i));
    if (op) {
      // Advance by the operator's full length, not one char — otherwise a
      // leftover fragment (e.g. the `=` in `:=`) gets re-lexed as its own token.
      i += op.length;
      col += op.length;
      push("op", op);
      continue;
    }

    const punct = PUNCT.find((p) => p === ch);
    if (punct) {
      i++;
      col++;
      push("punct", punct);
      continue;
    }

    // Unknown character: emit it as punctuation so the parser can raise a
    // located error instead of desyncing.
    i++;
    col++;
    push("punct", ch);
  }

  tokens.push({ type: "eof", value: "<eof>", line, col });
  return tokens;
}

/** Drop newline tokens, for contexts where Pine's ASI does not apply. */
export function stripNewlines(tokens: Token[]): Token[] {
  return tokens.filter((t) => t.type !== "newline");
}
