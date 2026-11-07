import { describe, expect, it } from "vitest";

import { resolveTabParam, tabHref, writeTabParam } from "./tabUrl";

/**
 * The `?tab=` contract every multi-view page shares.
 *
 * A sub-view has to survive a reload and be shareable as a link, so the
 * selected tab lives in the URL rather than in React state. These helpers
 * are the one place that knows how a tab id and a query string fit
 * together, so a page cannot get the encoding subtly wrong.
 */

describe("resolveTabParam", () => {
  it("returns the requested tab when it is a known one", () => {
    expect(resolveTabParam("screener", ["watchlists", "screener"], "watchlists")).toBe("screener");
  });

  it("falls back to the default when the parameter is absent", () => {
    expect(resolveTabParam(null, ["watchlists", "screener"], "watchlists")).toBe("watchlists");
  });

  it("falls back to the default when the parameter is unknown", () => {
    expect(resolveTabParam("nope", ["watchlists", "screener"], "watchlists")).toBe("watchlists");
  });

  it("falls back to the default when there are no tabs at all", () => {
    expect(resolveTabParam("screener", [], "watchlists")).toBe("watchlists");
  });
});

describe("writeTabParam", () => {
  it("puts a non-default tab in the query string", () => {
    expect(writeTabParam("screener", "watchlists")).toBe("?tab=screener");
  });

  it("drops the parameter for the default tab, so the URL stays clean", () => {
    expect(writeTabParam("watchlists", "watchlists")).toBe("");
  });

  it("escapes a tab id that needs it", () => {
    expect(writeTabParam("a b&c", "x")).toBe("?tab=a%20b%26c");
  });
});

describe("tabHref", () => {
  it("keeps the path and adds the tab", () => {
    expect(tabHref("/markets", "screener", "watchlists")).toBe("/markets?tab=screener");
  });

  it("returns the bare path for the default tab", () => {
    expect(tabHref("/markets", "watchlists", "watchlists")).toBe("/markets");
  });
});
