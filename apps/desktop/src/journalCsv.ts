/**
 * Journal entries → CSV (RFC 4180).
 *
 * CRLF line endings and quote-only-when-needed cells so the file opens cleanly
 * in Excel/Sheets and survives naive splitters. Pure: no store, no clock.
 */
import type { JournalEntry, RuleCheck } from "@ezyview/journal";

const HEADER =
  "id,symbol,side,qty,entryPrice,exitPrice,entryTime,exitTime,pnl,fees,plannedRisk,setup,tags,notes,rating,source,emotion,stopPrice,targetPrice,rules";

export function entriesToCsv(entries: readonly JournalEntry[]): string {
  const rows = [HEADER];
  for (const entry of entries) {
    rows.push(
      [
        entry.id,
        entry.symbol,
        entry.side,
        entry.qty,
        entry.entryPrice,
        entry.exitPrice,
        entry.entryTime,
        entry.exitTime,
        entry.pnl,
        entry.fees,
        entry.plannedRisk,
        entry.setup,
        joinTags(entry.tags),
        entry.notes,
        entry.rating,
        entry.source,
        entry.emotion,
        entry.stopPrice,
        entry.targetPrice,
        joinRules(entry.rules),
      ]
        .map(cell)
        .join(","),
    );
  }
  return rows.join("\r\n");
}

/** RFC 4180: quote when the value holds `"`, comma, CR or LF; double the quotes. */
function cell(value: unknown): string {
  if (value === undefined || value === null) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Same trim/dedupe contract as the store's addEntry; `|`-joined. */
function joinTags(tags: readonly string[] | undefined): string | undefined {
  if (!Array.isArray(tags)) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = typeof raw === "string" ? raw.trim() : "";
    if (tag === "" || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out.length > 0 ? out.join("|") : undefined;
}

/** `label✓` / `label✗` per rule, `|`-joined; `|` inside a label becomes `/`. */
function joinRules(rules: readonly RuleCheck[] | undefined): string | undefined {
  if (!rules || rules.length === 0) return undefined;
  return rules.map((rule) => `${rule.label.replace(/\|/g, "/")}${rule.done ? "✓" : "✗"}`).join("|");
}
