import { describe, expect, it, vi } from "vitest";

describe("workspace persistence failures", () => {
  it("reports a full disk instead of losing the workspace silently", async () => {
    // A fresh module so the localStorage stub is picked up on first read.
    vi.resetModules();
    const setItem = vi.fn(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const removeItem = vi.fn();
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem,
      removeItem,
      clear: vi.fn(),
      key: () => null,
      length: 0,
    });

    const { notice } = await import("./notice");
    const spy = vi.spyOn(notice, "alert");
    const { writeWorkspaceForTest } = await import("./store");
    writeWorkspaceForTest("ezyview.workspace.v1", "{}");
    // The first write fails and the backup is dropped, then the write is
    // tried again and fails again: the user is told.
    expect(setItem).toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    vi.unstubAllGlobals();
  });
});
