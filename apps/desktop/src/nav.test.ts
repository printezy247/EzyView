import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route logic for the Phase 2 shell: known routes, left-rail order, and the
 * persisted last route. Node environment — localStorage is stubbed by hand.
 */

const h = vi.hoisted(() => ({ storage: new Map<string, string>() }));

function armLocalStorage(): void {
  const g = globalThis as Record<string, unknown>;
  g.localStorage = {
    getItem: (k: string) => h.storage.get(k) ?? null,
    setItem: (k: string, v: string) => void h.storage.set(k, v),
    removeItem: (k: string) => void h.storage.delete(k),
  };
}

function disarmLocalStorage(): void {
  delete (globalThis as Record<string, unknown>).localStorage;
}

import { NAV_ITEMS, PANEL_ROUTES, ROUTE_PATHS, normalizePath, readLastRoute, rememberRoute } from "./nav";

beforeEach(() => {
  h.storage.clear();
  disarmLocalStorage();
});

describe("route tables", () => {
  it("ROUTE_PATHS lists the six navigation destinations in rail order", () => {
    expect([...ROUTE_PATHS]).toEqual(["/chart", "/journal", "/fundamentals", "/options", "/pine", "/settings"]);
  });

  it("NAV_ITEMS follows the left-rail order from the spec", () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(["Chart", "Journal", "Fundamentals", "Options", "Pine", "Settings"]);
    expect(NAV_ITEMS.map((i) => i.to)).toEqual([...ROUTE_PATHS]);
    for (const item of NAV_ITEMS) expect(item.key.length).toBeGreaterThan(0);
  });

  it("PANEL_ROUTES maps panel names to their routes", () => {
    expect({ ...PANEL_ROUTES }).toEqual({
      journal: "/journal",
      fundamentals: "/fundamentals",
      options: "/options",
      pine: "/pine",
    });
  });
});

describe("normalizePath", () => {
  it("passes every known route through unchanged", () => {
    for (const route of ROUTE_PATHS) expect(normalizePath(route)).toBe(route);
  });

  it("falls back to /chart when storage is empty", () => {
    armLocalStorage();
    expect(normalizePath("/bogus")).toBe("/chart");
    expect(normalizePath("")).toBe("/chart");
    expect(normalizePath("/")).toBe("/chart");
  });

  it("resolves unknown paths to the stored last route", () => {
    armLocalStorage();
    rememberRoute("/options");
    expect(normalizePath("/bogus")).toBe("/options");
    expect(normalizePath("/")).toBe("/options");
  });

  it("ignores a stale stored route", () => {
    armLocalStorage();
    h.storage.set("ezyview:lastRoute", "/gone-forever");
    expect(normalizePath("/bogus")).toBe("/chart");
  });

  it("defaults to /chart when localStorage does not exist", () => {
    expect(normalizePath("/bogus")).toBe("/chart");
    expect(normalizePath("/journal")).toBe("/journal");
  });
});

describe("rememberRoute", () => {
  it("persists a known route", () => {
    armLocalStorage();
    rememberRoute("/journal");
    expect(h.storage.get("ezyview:lastRoute")).toBe("/journal");
  });

  it("leaves storage untouched for unknown routes", () => {
    armLocalStorage();
    rememberRoute("/options");
    rememberRoute("/bogus");
    expect(h.storage.get("ezyview:lastRoute")).toBe("/options");
  });

  it("is a no-op without localStorage", () => {
    expect(() => rememberRoute("/chart")).not.toThrow();
  });
});

describe("readLastRoute", () => {
  it("returns /chart when storage is empty", () => {
    armLocalStorage();
    expect(readLastRoute()).toBe("/chart");
  });

  it("returns the stored route when it is known", () => {
    armLocalStorage();
    rememberRoute("/pine");
    expect(readLastRoute()).toBe("/pine");
  });

  it("returns /chart when the stored route is stale", () => {
    armLocalStorage();
    h.storage.set("ezyview:lastRoute", "/gone-forever");
    expect(readLastRoute()).toBe("/chart");
  });

  it("returns /chart when localStorage does not exist", () => {
    expect(readLastRoute()).toBe("/chart");
  });
});
