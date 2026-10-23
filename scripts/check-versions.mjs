#!/usr/bin/env node
/**
 * The app version is declared in four places. A release built from a tree where
 * they disagree installs under one version and reports another, so fail the
 * build instead of trusting a human to keep them in step.
 */
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const fromJson = (path) => JSON.parse(read(path)).version;
const cargo = read("apps/desktop/src-tauri/Cargo.toml");
const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(cargo)?.[1];

const versions = new Map([
  ["package.json", fromJson("package.json")],
  ["apps/desktop/package.json", fromJson("apps/desktop/package.json")],
  ["apps/desktop/src-tauri/tauri.conf.json", fromJson("apps/desktop/src-tauri/tauri.conf.json")],
  ["apps/desktop/src-tauri/Cargo.toml", cargoVersion],
]);

const distinct = new Set(versions.values());
if (distinct.size !== 1 || distinct.has(undefined)) {
  console.error("Version mismatch:");
  for (const [file, version] of versions) console.error(`  ${file}: ${version ?? "missing"}`);
  process.exit(1);
}

console.log(`Version ${[...distinct][0]} is consistent across ${versions.size} files.`);
