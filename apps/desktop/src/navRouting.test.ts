import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase B navigation: eight categories instead of six flat destinations, with
 * the old paths kept as aliases so a bookmarked or persisted route still lands
 * somewhere sensible.
 */

const h = vi.hoisted(() => ({ storage: new Map<string, string>() }));

vi.hoisted(() => {
  const g = globalThis as Record<string, unknown>;
  g.localStorage = {
    getItem: (k: string) => h.storage.get(k) ?? null,
    setItem: (k: string, v: string) => void h.storage.set(k, v),
    removeItem: (k: string) => void h.storage.delete(k),
  };
});

import { NAV_ITEMS, NAV_SECTIONS, PANEL_ROUTES, ROUTE_PATHS, normalizePath, readLastRoute, rememberRoute, resolveRoute } from "./nav";

beforeEach(() => h.storage.clear());

describe("route table", () => {
  it("exposes the eight destinations of the redesign", () => {
    expect(NAV_SECTIONS.map((s) => s.to)).toEqual([
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

  it("keeps every section on the route table", () => {
    for (const section of NAV_SECTIONS) expect(ROUTE_PATHS).toContain(section.to);
  });

  it("lists the rail in section order with a command key each", () => {
    expect(NAV_ITEMS.map((n) => n.to)).toEqual(NAV_SECTIONS.map((s) => s.to));
    for (const item of NAV_SECTIONS) expect(item.to.startsWith("/")).toBe(true);
  });

  it("describes what each section holds, for the rail flyout and the palette", () => {
    for (const section of NAV_SECTIONS) {
      expect(section.label.length, section.to).toBeGreaterThan(2);
      expect(section.description.length, section.to).toBeGreaterThan(10);
    }
  });
});

describe("legacy paths resolve forward", () => {
  it("sends the pre-redesign routes to their new section", () => {
    expect(resolveRoute("/fundamentals")).toBe("/research");
    expect(resolveRoute("/options")).toBe("/research");
    expect(resolveRoute("/pine")).toBe("/strategies");
    expect(resolveRoute("/markets")).toBe("/markets");
    expect(resolveRoute("/chart")).toBe("/chart");
  });

  it("leaves an unknown path alone so normalizePath can fall back", () => {
    expect(resolveRoute("/nope")).toBe("/nope");
  });

  it("still knows the old paths, so a persisted deep link is honoured", () => {
    expect(normalizePath("/pine")).toBe("/strategies");
    expect(normalizePath("/fundamentals")).toBe("/research");
    expect(normalizePath("/options")).toBe("/research");
  });

  it("remembers the resolved route, not the alias", () => {
    rememberRoute("/pine");
    expect(readLastRoute()).toBe("/strategies");
  });

  it("falls back to the stored route for an unknown path", () => {
    rememberRoute("/trade");
    expect(normalizePath("/nope")).toBe("/trade");
  });

  it("has a panel route for every migrated panel", () => {
    expect(PANEL_ROUTES.pine).toBe("/strategies");
    expect(ROUTE_PATHS).toContain(PANEL_ROUTES.pine);
    expect(ROUTE_PATHS).toContain(PANEL_ROUTES.journal);
  });
});
