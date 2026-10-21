import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke test configuration.
 *
 * The app is a Tauri desktop app, but its whole UI is a web app, so the smoke
 * test drives the Vite dev server in a browser. That covers the part that
 * breaks most often — the shell, the routes and the chart mounting — without
 * needing a WebKitGTK build of the desktop shell.
 *
 * `webServer` starts the dev server itself, so `npm run test:e2e` is one
 * command with no setup.
 */
export default defineConfig({
  testDir: "./e2e",
  // The chart polls a demo feed, so a smoke test that only checks that things
  // render is quick; the visual baselines are the slow part.
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:1420",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: "npm run dev --workspace apps/desktop -- --host 127.0.0.1",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
