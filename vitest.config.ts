import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Resolve a workspace package's entry point to a real filesystem path.
 *
 * `new URL(...).pathname` URL-encodes spaces, so it breaks in any directory
 * whose name contains one. `fileURLToPath` decodes correctly.
 */
const pkg = (name: string): string => fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/desktop/src/**/*.test.{ts,tsx}"],
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "@ezyview/data-adapters": pkg("data-adapters"),
      "@ezyview/indicators": pkg("indicators"),
      "@ezyview/chart-engine": pkg("chart-engine"),
      "@ezyview/drawing-tools": pkg("drawing-tools"),
      "@ezyview/journal": pkg("journal"),
      "@ezyview/pine-transpiler": pkg("pine-transpiler"),
      "@ezyview/paper-trading": pkg("paper-trading"),
      "@ezyview/mt5-adapter": pkg("mt5-adapter"),
    },
  },
});
