import { describe, expect, it } from "vitest";
import { svgFromPng } from "./svgExport";

// 1x1 transparent PNG, widened in the IHDR to 640x480 for the size read.
const png = (w: number, h: number): string => {
  const bytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52];
  for (const n of [w, h]) bytes.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
  return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;
};
const META = { title: "T <&>", symbol: "BTCUSDT", resolution: "1D" };

describe("svgFromPng", () => {
  it("wraps the PNG with its real size, header comment and escaped title", () => {
    const url = png(640, 480);
    const svg = svgFromPng(url, META);
    expect(svg).toContain("<!-- ezyview-chart -->");
    expect(svg).toContain('width="640" height="480" viewBox="0 0 640 480"');
    expect(svg).toContain("<title>T &lt;&amp;&gt; (BTCUSDT 1D)</title>");
    expect(svg).toContain(`href="${url}"`);
  });

  it.each(["", "data:text/html;base64,AAAA", 'data:image/png;base64,"><script>', "data:image/png;base64,AAAA"])(
    "rejects non-PNG input %j",
    (bad) => {
      expect(() => svgFromPng(bad, META)).toThrow("Not a PNG data URL");
    },
  );
});
