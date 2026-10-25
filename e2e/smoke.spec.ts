import { expect, test } from "@playwright/test";

/**
 * Smoke test: the app boots, the shell is there, and every section is
 * reachable.
 *
 * This is deliberately shallow. It does not check that the chart draws pixels
 * — that depends on the demo feed's timing — but it does check the things
 * that break a release: a blank screen, a route that no longer resolves, a
 * navigation rail that lost a section, and a console full of errors.
 */

test("boots into the terminal with the shell in place", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/#/chart");
  await expect(page.getByRole("navigation", { name: "Sections" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();
  await expect(page.getByRole("main", { name: "Charts" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("every navigation section resolves to a page", async ({ page }) => {
  const sections = [
    { path: "/chart", name: /Terminal/i },
    { path: "/markets", name: /Markets/i },
    { path: "/trade", name: /Trade/i },
    { path: "/research", name: /Research/i },
    { path: "/journal", name: /Journal/i },
    { path: "/strategies", name: /Strategies/i },
    { path: "/alerts", name: /Alerts/i },
    { path: "/settings", name: /Settings/i },
  ];

  /* Sequential on purpose: each page must load before the next is checked, and
     running them in parallel would race the client-side router. */
  /* eslint-disable no-await-in-loop */
  for (const section of sections) {
    await page.goto(`/#${section.path}`);
    await expect(page.getByRole("navigation", { name: "Sections" })).toBeVisible();
    await expect(page.getByRole("link", { name: section.name }).first()).toBeVisible();
  }
  /* eslint-enable no-await-in-loop */
});

test("the old routes still land somewhere", async ({ page }) => {
  // A bookmark or a persisted last route from before the redesign. The app
  // routes on the hash, because Tauri's asset protocol breaks history routing.
  // A legacy route redirects to its new home and keeps a `?tab=` deep link,
  // so the tab the old page was on is still the one that opens.
  /* eslint-disable no-await-in-loop -- sequential navigation */
  for (const [from, to] of [
    ["/#/fundamentals", "/research"],
    ["/#/options", "/research"],
    ["/#/pine", "/strategies"],
  ]) {
    await page.goto(from);
    await expect(page).toHaveURL(new RegExp(`#${to}(\\?|$)`));
  }
  /* eslint-enable no-await-in-loop */
});

test("the command palette opens and lists the sections", async ({ page }) => {
  await page.goto("/#/chart");
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Terminal")).toBeVisible();
  await expect(dialog.getByText("Strategies")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("the chart command input opens, scopes symbols and closes on Escape", async ({ page }) => {
  await page.goto("/#/chart");
  await page.keyboard.press("/");

  const input = page.getByRole("combobox", { name: "Chart command input" });
  await expect(input).toBeVisible();
  await input.fill("eur");
  await expect(page.getByRole("button", { name: "OANDA:EURUSD" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(input).toBeHidden();
});

test("a watchlist row retargets the active chart", async ({ page }) => {
  await page.goto("/#/chart");
  await page.getByTitle("Toggle right-hand Watchlist dock").click();

  const watchlist = page.getByRole("complementary", { name: "Watchlist" });
  await expect(watchlist).toBeVisible();
  await watchlist.getByTitle("Open Euro / US Dollar").click();
  await expect(page.getByRole("region", { name: /Chart 1: OANDA:EURUSD/ })).toBeVisible();
});

test("a compare overlay can be added from the chart footer", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto("/#/chart");
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Compare symbols" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Compare symbol").fill("NASDAQ:AAPL");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog.getByText("NASDAQ:AAPL")).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  expect(errors).toEqual([]);
});

test("switching to a column chart does not crash the engine", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto("/#/chart");
  // The chart-type control is a menu: the trigger shows the current type, and
  // the types themselves are menuitemradio rows in the popup.
  await page.getByRole("button", { name: "Candles", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Column", exact: true }).click();
  await expect(page.getByRole("button", { name: "Column", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the chart cell mounts with a canvas", async ({ page }) => {
  await page.goto("/#/chart");
  const cell = page.getByRole("region", { name: /Chart 1:/ });
  await expect(cell).toBeVisible();
  // lightweight-charts renders into a canvas; the element existing is the
  // signal that the engine mounted rather than crashed.
  await expect(cell.locator("canvas").first()).toBeAttached();
});
