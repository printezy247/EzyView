import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route logic for the shell: known routes, left-rail order, and the persisted
 * last route. Node environment — localStorage is stubbed by hand.
 *
 * The eight-section table itself is covered by `navRouting.test.ts`; this file
 * keeps the storage/persistence half, including the legacy-path aliases.
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

import { NAV_ITEMS, NAV_SECTIONS, PANEL_ROUTES, ROUTE_PATHS, isRestorableRoute, normalizePath, readLastRoute, rememberRoute, resolveRoute } from "./nav";

beforeEach(() => {
  h.storage.clear();
  disarmLocalStorage();
});

describe("route tables", () => {
  it("ROUTE_PATHS lists the eight navigation destinations in rail order", () => {
    expect([...ROUTE_PATHS]).toEqual([
      "/chart",
      "/markets",
      "/trade",
      "/research",
      "/journal",
      "/strategies",
      "/alerts",
      "/settings",
    ]);
  });

  it("NAV_ITEMS follows the left-rail order from the redesign", () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual([
      "Terminal",
      "Markets",
      "Trade",
      "Research",
      "Journal",
      "Strategies",
      "Alerts",
      "Settings",
    ]);
    expect(NAV_ITEMS.map((i) => i.to)).toEqual([...ROUTE_PATHS]);
    expect(NAV_ITEMS).toBe(NAV_SECTIONS);
    for (const item of NAV_ITEMS) expect(item.key.length).toBeGreaterThan(0);
  });

  it("PANEL_ROUTES maps panel names to their new sections", () => {
    // The two research panels share a destination; Pine became Strategies.
    expect(PANEL_ROUTES.fundamentals).toBe("/research");
    expect(PANEL_ROUTES.options).toBe("/research");
    expect(PANEL_ROUTES.pine).toBe("/strategies");
    expect(PANEL_ROUTES.journal).toBe("/journal");
    for (const to of Object.values(PANEL_ROUTES)) expect(ROUTE_PATHS).toContain(to);
  });
});

describe("resolveRoute aliases", () => {
  it("maps the pre-redesign paths onto their section", () => {
    expect(resolveRoute("/fundamentals")).toBe("/research");
    expect(resolveRoute("/options")).toBe("/research");
    expect(resolveRoute("/pine")).toBe("/strategies");
  });

  it("passes current and unknown paths through untouched", () => {
    expect(resolveRoute("/chart")).toBe("/chart");
    expect(resolveRoute("/nope")).toBe("/nope");
  });

  it("treats legacy paths as restorable", () => {
    expect(isRestorableRoute("/pine")).toBe(true);
    expect(isRestorableRoute("/chart")).toBe(true);
    expect(isRestorableRoute("/gone-forever")).toBe(false);
  });
});

describe("normalizePath", () => {
  it("passes every known route through unchanged", () => {
    for (const route of ROUTE_PATHS) expect(normalizePath(route)).toBe(route);
  });

  it("resolves a legacy deep link to its section", () => {
    expect(normalizePath("/pine")).toBe("/strategies");
    expect(normalizePath("/options")).toBe("/research");
  });

  it("falls back to /chart when storage is empty", () => {
    armLocalStorage();
    expect(normalizePath("/bogus")).toBe("/chart");
    expect(normalizePath("")).toBe("/chart");
    expect(normalizePath("/")).toBe("/chart");
  });

  it("resolves unknown paths to the stored last route", () => {
    armLocalStorage();
    rememberRoute("/alerts");
    expect(normalizePath("/bogus")).toBe("/alerts");
    expect(normalizePath("/")).toBe("/alerts");
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

  it("stores the resolved section for a legacy path", () => {
    armLocalStorage();
    rememberRoute("/pine");
    expect(h.storage.get("ezyview:lastRoute")).toBe("/strategies");
  });

  it("leaves storage untouched for unknown routes", () => {
    armLocalStorage();
    rememberRoute("/alerts");
    rememberRoute("/bogus");
    expect(h.storage.get("ezyview:lastRoute")).toBe("/alerts");
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
    rememberRoute("/strategies");
    expect(readLastRoute()).toBe("/strategies");
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
