import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const alias = {
  "@ezyview/data-adapters": src("../../packages/data-adapters/src/index.ts"),
  "@ezyview/indicators": src("../../packages/indicators/src/index.ts"),
  "@ezyview/chart-engine": src("../../packages/chart-engine/src/index.ts"),
  "@ezyview/drawing-tools": src("../../packages/drawing-tools/src/index.ts"),
  "@ezyview/journal": src("../../packages/journal/src/index.ts"),
  "@ezyview/pine-transpiler": src("../../packages/pine-transpiler/src/index.ts"),
  "@ezyview/paper-trading": src("../../packages/paper-trading/src/index.ts"),
  "@ezyview/mt5-adapter": src("../../packages/mt5-adapter/src/index.ts"),
};

// Tauri expects the dev server on a fixed port with a fixed host.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
    watch: {
      ignored: ["**/src-tauri/**", "**/target/**", "**/dist/**"],
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      input: src("./index.html"),
    },
  },
});
