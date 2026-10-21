/** HTML embed snippet (an iframe) for a chart share link. Pure. */

const escapeAttr = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function embedSnippet(opts: { src: string; width?: number; height?: number; title?: string }): string {
  const width = opts.width ?? 800;
  const height = opts.height ?? 600;
  const title = opts.title ?? "EzyView chart";
  return `<iframe src="${escapeAttr(opts.src)}" width="${width}" height="${height}" title="${escapeAttr(title)}" loading="lazy" style="border:0"></iframe>`;
}
