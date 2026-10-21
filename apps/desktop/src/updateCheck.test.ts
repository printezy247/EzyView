import { describe, expect, it } from "vitest";
import { checkForUpdate, isNewer, isReleaseUrl, parseVersion } from "./updateCheck";

const reply = (status: number, body: unknown = {}) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("version compare", () => {
  it("parses tags with or without v and suffixes", () => {
    expect(parseVersion("v0.1.6")).toEqual([0, 1, 6]);
    expect(parseVersion("1.2.3-beta.1")).toEqual([1, 2, 3]);
    for (const bad of ["", "latest", "1.2", "v1.2.x"]) expect(parseVersion(bad)).toBeNull();
  });

  it("orders versions numerically, not lexically", () => {
    expect(isNewer("0.1.6", "v0.1.10")).toBe(true);
    expect(isNewer("0.2.0", "0.1.99")).toBe(false);
    expect(isNewer("1.0.0", "1.0.0")).toBe(false);
    expect(isNewer("junk", "1.0.0")).toBe(false);
  });

  it("only trusts the project's own release links", () => {
    expect(isReleaseUrl("https://github.com/printezy247/EzyView/releases/tag/v1")).toBe(true);
    expect(isReleaseUrl("https://evil.example/releases")).toBe(false);
    expect(isReleaseUrl(undefined)).toBe(false);
  });
});

describe("checkForUpdate", () => {
  it("treats 404 as no releases and other failures as errors", async () => {
    expect(await checkForUpdate(reply(404))).toEqual({ kind: "none" });
    expect(await checkForUpdate(reply(500))).toEqual({ kind: "error", message: "GitHub answered 500" });
    const down = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await checkForUpdate(down)).toEqual({ kind: "error", message: "offline" });
  });

  it("ignores a release whose tag is not a version", async () => {
    expect(await checkForUpdate(reply(200, { tag_name: "nightly", html_url: "https://github.com/printezy247/EzyView/x" }))).toEqual({
      kind: "none",
    });
  });
});
