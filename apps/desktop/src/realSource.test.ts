import { describe, expect, it } from "vitest";
import { describeRealSource } from "./realSource";

describe("describeRealSource", () => {
  it("names a demo session as safe", () => {
    const result = describeRealSource({ kind: "session", demo: true, server: "S", login: "1" });
    expect(result.key).toBeNull();
    expect(result.kind).toBe("demo");
  });

  it("names a real session and gives it an ack key", () => {
    const result = describeRealSource({ kind: "session", demo: false, server: "S", login: "1" });
    expect(result.kind).toBe("real");
    expect(result.key).toBe("S|1");
  });

  it("treats an attached demo terminal as safe", () => {
    const result = describeRealSource({ kind: "attached", tradeMode: 0, login: 42 });
    expect(result.key).toBeNull();
    expect(result.kind).toBe("demo");
  });

  it("treats an attached real terminal as real", () => {
    const result = describeRealSource({ kind: "attached", tradeMode: 1, login: 42 });
    expect(result.kind).toBe("real");
    expect(result.key).toBe("attached|42");
  });

  it("fails closed: an unreadable terminal is unknown, not demo", () => {
    const result = describeRealSource({ kind: "error", message: "bridge unreachable" });
    expect(result.kind).toBe("unknown");
    // An unknown account must still be acknowledged before the source is used.
    expect(result.key).toBe("unknown");
  });

  it("treats an unknown trade mode on an attached terminal as unknown", () => {
    const result = describeRealSource({ kind: "attached", tradeMode: 7, login: 42 });
    expect(result.kind).toBe("unknown");
    expect(result.key).not.toBeNull();
  });
});
