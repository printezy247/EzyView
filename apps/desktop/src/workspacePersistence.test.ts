/**
 * @vitest-environment happy-dom
 *
 * The workspace lives in localStorage, and localStorage fails in two ways
 * that used to cost the user their layouts: a truncated payload (which the
 * next write overwrote with defaults) and a full disk (which threw out of
 * the store's `set`).
 */
import { describe, expect, it, vi } from "vitest";

const KEY = "ezyview.workspace";

describe("workspace persistence", () => {
  it("parks a corrupt payload instead of overwriting it", async () => {
    localStorage.clear();
    localStorage.setItem(KEY, "{ this is not json");
    vi.resetModules();

    await import("./store");

    // The broken blob is kept aside for support instead of being replaced
    // by the default workspace.
    expect(localStorage.getItem(`${KEY}.corrupt`)).toBe("{ this is not json");
  });

  it("restores a workspace that is valid JSON", async () => {
    localStorage.clear();
    const payload = {
      state: { layouts: [], activeLayoutId: "l1" },
      version: 1,
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
    vi.resetModules();

    const mod = await import("./store");
    expect(mod.useWorkspace.getState().layouts.length).toBeGreaterThan(0);
    expect(localStorage.getItem(`${KEY}.corrupt`)).toBeNull();
  });

  it("survives a storage that refuses to write", async () => {
    localStorage.clear();
    vi.resetModules();
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    const mod = await import("./store");
    expect(() => mod.useWorkspace.getState().setAppTheme("light")).not.toThrow();
    setItem.mockRestore();
  });
});
