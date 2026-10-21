import { describe, expect, it } from "vitest";

import { useNotice } from "./notice";

/**
 * The in-app notice surface replaced native window.alert/confirm. The
 * behaviour that matters: a caller always gets an answer, even when a second
 * notice replaces the first, and a plain message resolves as acknowledged.
 */

describe("notice surface", () => {
  it("resolves a confirm with the user's answer", async () => {
    const pending = useNotice.getState().confirm("Delete layout?", { confirmLabel: "Delete" });
    expect(useNotice.getState().notice?.title).toBe("Delete layout?");
    expect(useNotice.getState().notice?.kind).toBe("confirm");
    useNotice.getState().settle(true);
    await expect(pending).resolves.toBe(true);
    expect(useNotice.getState().notice).toBeNull();
  });

  it("resolves a confirm as cancelled when the user cancels", async () => {
    const pending = useNotice.getState().confirm("Factory reset?");
    useNotice.getState().settle(false);
    await expect(pending).resolves.toBe(false);
  });

  it("resolves an alert once dismissed", async () => {
    const pending = useNotice.getState().alert("Import failed", "Not a layout file");
    expect(useNotice.getState().notice?.body).toBe("Not a layout file");
    expect(useNotice.getState().notice?.kind).toBe("alert");
    useNotice.getState().settle(true);
    await expect(pending).resolves.toBeUndefined();
  });

  it("cancels a superseded notice instead of leaving it hanging", async () => {
    const first = useNotice.getState().confirm("First?");
    const second = useNotice.getState().confirm("Second?");
    await expect(first).resolves.toBe(false);
    expect(useNotice.getState().notice?.title).toBe("Second?");
    useNotice.getState().settle(true);
    await expect(second).resolves.toBe(true);
  });

  it("does nothing when there is no open notice", () => {
    useNotice.getState().settle(true);
    expect(useNotice.getState().notice).toBeNull();
  });
});
