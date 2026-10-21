import { describe, expect, it } from "vitest";
import { exportScriptJson, parseScriptJson } from "./pineShare";

describe("pineShare export/parse", () => {
  it("round-trips name and source through pretty JSON", () => {
    const json = exportScriptJson({ name: "My Script", source: '//@version=6\nplot(close)\n' });
    // Pretty-printed, tagged, version-stamped.
    expect(json).toContain("\n");
    const envelope = JSON.parse(json) as Record<string, unknown>;
    expect(envelope.format).toBe("ezyview-pine");
    expect(envelope.version).toBe(1);
    expect(parseScriptJson(json)).toEqual({ name: "My Script", source: '//@version=6\nplot(close)\n' });
  });

  it("rejects text that is not JSON", () => {
    expect(() => parseScriptJson("not json at all")).toThrow("Not an EzyView Pine script");
    expect(() => parseScriptJson("")).toThrow("Not an EzyView Pine script");
  });

  it("rejects JSON that is not an EzyView Pine envelope", () => {
    expect(() => parseScriptJson("null")).toThrow("Not an EzyView Pine script");
    expect(() => parseScriptJson("[1,2,3]")).toThrow("Not an EzyView Pine script");
    expect(() => parseScriptJson('{"format":"someone-else","version":1,"name":"a","source":"b"}')).toThrow(
      "Not an EzyView Pine script",
    );
    // Future format versions are refused rather than mis-parsed.
    expect(() => parseScriptJson('{"format":"ezyview-pine","version":2,"name":"a","source":"b"}')).toThrow(
      "Not an EzyView Pine script",
    );
  });

  it("rejects a well-tagged envelope with the wrong shape", () => {
    expect(() => parseScriptJson('{"format":"ezyview-pine","version":1}')).toThrow("Not an EzyView Pine script");
    expect(() => parseScriptJson('{"format":"ezyview-pine","version":1,"name":42,"source":"b"}')).toThrow(
      "Not an EzyView Pine script",
    );
    expect(() => parseScriptJson('{"format":"ezyview-pine","version":1,"name":"a","source":null}')).toThrow(
      "Not an EzyView Pine script",
    );
  });
});
