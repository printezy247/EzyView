/** One static-analysis finding from `lintPine`. Line and column are 1-based. */
export interface PineLintIssue {
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning";
}

/**
 * Deterministic line-based lint over Pine source.
 *
 * Deliberately not a parse — transpile errors are a separate channel. Each
 * rule scans lines with `indexOf`-style checks; lines whose first
 * non-whitespace text is `//` are blanked before the call-shaped scans so a
 * comment cannot count as a declaration or a plot. The `//@version=` check
 * reads the raw source, because that is exactly where the comment lives.
 *
 * An empty script short-circuits to its single error: warning a blank editor
 * about a missing version or plot is noise, not signal.
 */
export function lintPine(source: string): PineLintIssue[] {
  if (source.trim() === "") {
    return [{ line: 1, column: 1, message: "Empty script", severity: "error" }];
  }

  const issues: PineLintIssue[] = [];

  if (!source.includes("//@version=")) {
    issues.push({ line: 1, column: 1, message: "Missing //@version= comment", severity: "warning" });
  }

  const codeLines = source
    .split(/\r?\n/)
    .map((line) => (line.trimStart().startsWith("//") ? "" : line));

  const indicatorLine = findLine(codeLines, "indicator(");
  const strategyLine = findLine(codeLines, "strategy(");
  if (indicatorLine !== null && strategyLine !== null) {
    // The second occurrence in source order is the later of the two first hits.
    issues.push({
      line: Math.max(indicatorLine, strategyLine),
      column: 1,
      message: "Script declares both indicator() and strategy()",
      severity: "error",
    });
  }

  const hasPlotCall = codeLines.some(
    (line) => line.includes("plot(") || line.includes("plotshape(") || line.includes("strategy."),
  );
  if (!hasPlotCall) {
    issues.push({ line: 1, column: 1, message: "Script has no plot or strategy call", severity: "warning" });
  }

  return issues;
}

/** 1-based line of the first occurrence of `needle`, or null when absent. */
function findLine(lines: string[], needle: string): number | null {
  for (const [i, line] of lines.entries()) {
    if (line.includes(needle)) return i + 1;
  }
  return null;
}
