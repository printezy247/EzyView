import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Visual baselines for the redesigned shell.
 *
 * A screenshot is the only way to catch a regression that is not a bug: a
 * palette that drifts, a type scale that stops being uniform, a control that
 * grows a pixel here and there. Those changes pass every functional test and
 * still make the app feel like a different product.
 *
 * The baselines are committed. A deliberate redesign replaces them; an
 * accidental change must not.
 *
 * Two things move on their own and are dealt with rather than fought:
 *
 * - The clock is installed at a fixed time, so the demo feed's history window
 *   is the same on every run. The clock is *not* paused: pausing it stops
 *   `requestAnimationFrame`, and the chart never paints.
 * - The live price walks off `Math.random()`, so it can never match. The
 *   price and the clock are masked, and a small pixel tolerance absorbs the
 *   last candle, which is the only part of the plot that moves.
 */

const FROZEN = new Date("2026-10-21T12:00:00Z");

const settle = async (page: Page) => {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  // The quote has to have arrived: until it does, the price renders as a dash
  // and the change is missing, so the toolbar is a different width and the
  // masked region does not line up with the baseline.
  const price = page.locator("[data-volatile='price']").first();
  await expect(price).not.toHaveText("—", { timeout: 10_000 });
  // One more frame, so the chart has painted before the shutter.
  await page.waitForTimeout(600);
};

/** The readouts that are live by nature, and so are masked out. */
/**
 * The chrome colour the masked readouts sit on, so the committed baseline
 * reads as the app rather than as a wall of magenta.
 */
const MASK_COLOR = "#0e1216";

const volatileRegions = (page: Page) => [
  // The last price and its change.
  page.locator("[data-volatile='price']"),
  // The market clock in the footer.
  page.locator("[data-volatile='clock']"),
];

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: FROZEN });
});

test.describe("shell", () => {
  test("the terminal", async ({ page }) => {
    await page.goto("/#/chart");
    await settle(page);
    await expect(page).toHaveScreenshot("terminal.png", {
      animations: "disabled",
      mask: volatileRegions(page),
      maskColor: MASK_COLOR,
      maxDiffPixels: 4000,
    });
  });

  test("the navigation rail", async ({ page }) => {
    await page.goto("/#/chart");
    await settle(page);
    await expect(page.getByRole("navigation", { name: "Sections" })).toHaveScreenshot("nav-rail.png", {
      animations: "disabled",
    });
  });

  test("the command palette", async ({ page }) => {
    await page.goto("/#/chart");
    await settle(page);
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Command palette" })).toHaveScreenshot("command-palette.png", {
      animations: "disabled",
    });
  });
});

test.describe("sections", () => {
  for (const [name, path] of [
    ["markets", "/#/markets"],
    ["trade", "/#/trade"],
    ["research", "/#/research"],
    ["alerts", "/#/alerts"],
    ["settings", "/#/settings"],
  ] as const) {
    test(`the ${name} section`, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      await expect(page).toHaveScreenshot(`${name}.png`, {
        animations: "disabled",
        mask: volatileRegions(page),
        maskColor: MASK_COLOR,
        maxDiffPixels: 4000,
      });
    });
  }
});
