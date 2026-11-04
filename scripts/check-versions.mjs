#!/usr/bin/env node
/**
 * The app version is declared in four places, plus the MCP server version.
 * A release built from a tree where the app files disagree installs under
 * one version and reports another, so fail the build instead of trusting a
 * human to keep them in step.
 */
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const fromJson = (path) => JSON.parse(read(path)).version;
const cargo = read("apps/desktop/src-tauri/Cargo.toml");
const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(cargo)?.[1];

const appVersions = new Map([
  ["package.json", fromJson("package.json")],
  ["apps/desktop/package.json", fromJson("apps/desktop/package.json")],
  ["apps/desktop/src-tauri/tauri.conf.json", fromJson("apps/desktop/src-tauri/tauri.conf.json")],
  ["apps/desktop/src-tauri/Cargo.toml", cargoVersion],
]);

const mcpVersion = fromJson("packages/mcp-server/package.json");

const distinct = new Set(appVersions.values());
if (distinct.size !== 1 || distinct.has(undefined)) {
  console.error("Version mismatch:");
  for (const [file, version] of appVersions) console.error(`  ${file}: ${version ?? "missing"}`);
  process.exit(1);
}
if (!mcpVersion) {
  console.error("Version mismatch:\n  packages/mcp-server/package.json: missing");
  process.exit(1);
}

process.stdout.write(
  `Version ${[...distinct][0]} is consistent across ${appVersions.size} app files; mcp-server is ${mcpVersion}.\n`,
);
