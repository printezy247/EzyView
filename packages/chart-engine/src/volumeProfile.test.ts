import { describe, expect, it } from "vitest";
import { withAlpha } from "./volumeProfile.js";

describe("withAlpha", () => {
  it("turns a hex colour into rgba", () => {
    expect(withAlpha("#26a69a", 0.28)).toBe("rgba(38,166,154,0.28)");
    expect(withAlpha("#fff", 0.5)).toBe("rgba(255,255,255,0.5)");
  });

  it("passes other colour formats through", () => {
    expect(withAlpha("rgb(1,2,3)", 0.5)).toBe("rgb(1,2,3)");
  });
});
