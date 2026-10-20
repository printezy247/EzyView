/**
 * An href that is safe to open from third-party data (news feeds, profiles).
 * Only absolute http(s) URLs pass; `javascript:`, `data:`, `file:` and
 * relative URLs return undefined so the caller renders plain text instead.
 */
export function safeHref(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}
