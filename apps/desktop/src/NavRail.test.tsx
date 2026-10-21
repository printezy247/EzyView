// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { NavRail } from "./NavRail";
import { NAV_SECTIONS } from "./nav";

/**
 * Render test for the navigation rail.
 *
 * The route table itself is unit-tested in `nav.test.ts`. What matters here is
 * that the rail actually renders every section, that each one is reachable,
 * and that the current section is marked — a section that exists in the table
 * but not in the rail is a destination the user cannot get to.
 *
 * The links are found by their `href` rather than their accessible name: the
 * hover flyout puts the label and the description inside the link, so the name
 * is a long string that other sections' descriptions also contain.
 */

const linkFor = (to: string): HTMLAnchorElement => {
  const link = document.querySelector<HTMLAnchorElement>(`a[href="${to}"]`);
  if (!link) throw new Error(`no link to ${to}`);
  return link;
};

describe("NavRail", () => {
  it("renders every section of the table", () => {
    render(
      <MemoryRouter>
        <NavRail />
      </MemoryRouter>,
    );
    for (const section of NAV_SECTIONS) {
      // The label appears twice on purpose: once for screen readers, once in
      // the hover flyout.
      expect(screen.getAllByText(section.label).length, section.key).toBeGreaterThan(0);
    }
  });

  it("has a link for each section", () => {
    render(
      <MemoryRouter>
        <NavRail />
      </MemoryRouter>,
    );
    expect(document.querySelectorAll("nav a").length).toBe(NAV_SECTIONS.length);
    for (const section of NAV_SECTIONS) {
      expect(linkFor(section.to), section.key).toBeTruthy();
    }
  });

  it("marks the current section", () => {
    render(
      <MemoryRouter initialEntries={["/trade"]}>
        <NavRail />
      </MemoryRouter>,
    );
    expect(linkFor("/trade").getAttribute("aria-current")).toBe("page");
    expect(linkFor("/chart").getAttribute("aria-current")).toBeNull();
  });

  it("describes each section, since the rail is icon-only", () => {
    render(
      <MemoryRouter>
        <NavRail />
      </MemoryRouter>,
    );
    for (const section of NAV_SECTIONS) {
      expect(linkFor(section.to).getAttribute("title")).toContain(section.description);
    }
  });
});
