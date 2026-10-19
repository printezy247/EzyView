import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/desktop/src/**/*.test.{ts,tsx}"],
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "@ezyview/data-adapters": new URL("./packages/data-adapters/src/index.ts", import.meta.url).pathname,
      "@ezyview/indicators": new URL("./packages/indicators/src/index.ts", import.meta.url).pathname,
      "@ezyview/chart-engine": new URL("./packages/chart-engine/src/index.ts", import.meta.url).pathname,
      "@ezyview/drawing-tools": new URL("./packages/drawing-tools/src/index.ts", import.meta.url).pathname,
      "@ezyview/journal": new URL("./packages/journal/src/index.ts", import.meta.url).pathname,
      "@ezyview/pine-transpiler": new URL("./packages/pine-transpiler/src/index.ts", import.meta.url).pathname,
    },
  },
});
