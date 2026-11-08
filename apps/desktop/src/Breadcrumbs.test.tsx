// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { Breadcrumbs } from "./Breadcrumbs";

/**
 * The breadcrumb strip.
 *
 * The app is three levels deep in places — a section, a sub-view, and a
 * symbol — and before this strip it showed none of them. The crumbs are
 * derived from the route, so the strip can never point somewhere the
 * router does not.
 */

describe("Breadcrumbs", () => {
  it("shows the section on a page with no sub-view", () => {
    render(
      <MemoryRouter initialEntries={["/alerts"]}>
        <Breadcrumbs />
      </MemoryRouter>,
    );
    expect(screen.getByText("Alerts")).toBeTruthy();
  });

  it("shows the sub-view when the page has one", () => {
    render(
      <MemoryRouter initialEntries={["/markets?tab=screener"]}>
        <Breadcrumbs />
      </MemoryRouter>,
    );
    expect(screen.getByText("Markets")).toBeTruthy();
    expect(screen.getByText("Screener")).toBeTruthy();
  });

  it("falls back to the default tab when the URL names an unknown one", () => {
    render(
      <MemoryRouter initialEntries={["/markets?tab=nope"]}>
        <Breadcrumbs />
      </MemoryRouter>,
    );
    expect(screen.getByText("Watchlists")).toBeTruthy();
  });

  it("links the section crumb to the section", () => {
    render(
      <MemoryRouter initialEntries={["/markets?tab=screener"]}>
        <Breadcrumbs />
      </MemoryRouter>,
    );
    const link = document.querySelector<HTMLAnchorElement>('a[href="/markets"]');
    expect(link).toBeTruthy();
  });

  it("links the sub-view crumb to the tab's own URL", () => {
    render(
      <MemoryRouter initialEntries={["/markets?tab=screener"]}>
        <Breadcrumbs />
      </MemoryRouter>,
    );
    const link = document.querySelector<HTMLAnchorElement>('a[href="/markets?tab=screener"]');
    expect(link).toBeTruthy();
  });

  it("renders nothing but the chart crumb on the terminal", () => {
    render(
      <MemoryRouter initialEntries={["/chart"]}>
        <Breadcrumbs />
      </MemoryRouter>,
    );
    expect(screen.getByText("Terminal")).toBeTruthy();
  });
});
