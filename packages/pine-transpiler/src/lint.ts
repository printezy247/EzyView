/** One static-analysis finding from `lintPine`. Line and column are 1-based. */
export interface PineLintIssue {
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning";
}

/**
 * Deterministic lightweight lint over Pine source.
 *
 * Deliberately not a parse — transpile errors are a separate channel. A small
 * lexical pass masks strings and comments before call-shaped checks so text
 * inside either cannot count as code. The version directive is checked in raw
 * lines because it is itself a comment.
 *
 * An empty script short-circuits to its single error: warning a blank editor
 * about a missing version or plot is noise, not signal.
 */
export function lintPine(source: string): PineLintIssue[] {
  if (source.trim() === "") {
    return [{ line: 1, column: 1, message: "Empty script", severity: "error" }];
  }

  const issues: PineLintIssue[] = [];

  if (!hasVersionDirective(source)) {
    issues.push({ line: 1, column: 1, message: "Missing //@version= comment", severity: "warning" });
  }

  const codeLines = maskStringsAndComments(source).split(/\r?\n/);

  const userFunction = findCall(codeLines, /^\s*[A-Za-z_]\w*\s*\([^\n]*\)\s*=>/);
  if (userFunction !== null) {
    issues.push({
      ...userFunction,
      message: "User-defined functions are not supported by this Pine parser",
      severity: "warning",
    });
  }

  const indicator = findCall(codeLines, /\bindicator\s*\(/);
  const strategy = findCall(codeLines, /\bstrategy\s*\(/);
  if (indicator !== null && strategy !== null) {
    // The second occurrence in source order is the later of the two first hits.
    issues.push({
      line: Math.max(indicator.line, strategy.line),
      column: indicator.line > strategy.line ? indicator.column : strategy.column,
      message: "Script declares both indicator() and strategy()",
      severity: "error",
    });
  }

  const hasPlotCall = findCall(codeLines, /\bplot(?:shape)?\s*\(/) !== null;
  const hasStrategyCall = /\bstrategy\s*\./.test(codeLines.join("\n"));
  if (!hasPlotCall && !hasStrategyCall) {
    issues.push({ line: 1, column: 1, message: "Script has no plot or strategy call", severity: "warning" });
  }

  return issues;
}

function hasVersionDirective(source: string): boolean {
  return source.split(/\r?\n/).some((line) => /^\s*\/\/@version=\d+(?:\s|$)/.test(line));
}

/** Replace strings and line comments with spaces while retaining line breaks. */
function maskStringsAndComments(source: string): string {
  const chars = [...source];
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    if (quote !== null) {
      if (ch !== "\n" && ch !== "\r") chars[i] = " ";
      if (ch === "\\" && i + 1 < chars.length) {
        i++;
        if (chars[i] !== "\n" && chars[i] !== "\r") chars[i] = " ";
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      chars[i] = " ";
      continue;
    }

    if (ch === "/" && chars[i + 1] === "/") {
      while (i < chars.length && chars[i] !== "\n" && chars[i] !== "\r") {
        chars[i] = " ";
        i++;
      }
    }
  }

  return chars.join("");
}

/** Find the first match and return its 1-based source location. */
function findCall(lines: string[], pattern: RegExp): { line: number; column: number } | null {
  for (const [i, line] of lines.entries()) {
    const match = pattern.exec(line);
    if (match !== null) return { line: i + 1, column: match.index + 1 };
  }
  return null;
}
