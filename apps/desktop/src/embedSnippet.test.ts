import { describe, expect, it } from "vitest";
import { embedSnippet } from "./embedSnippet";

describe("embedSnippet", () => {
  it("applies defaults", () => {
    expect(embedSnippet({ src: "https://x/?share=BTC%3A1D" })).toBe(
      '<iframe src="https://x/?share=BTC%3A1D" width="800" height="600" title="EzyView chart" loading="lazy" style="border:0"></iframe>',
    );
  });

  it("escapes attribute values", () => {
    const out = embedSnippet({ src: 'a"b', title: 'x" onload="y', width: 10, height: 20 });
    expect(out).toContain('src="a&quot;b"');
    expect(out).toContain('title="x&quot; onload=&quot;y"');
    expect(out).toContain('width="10" height="20"');
  });
});
