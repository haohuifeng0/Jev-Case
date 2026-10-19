#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "scripts/test-ci-config.mjs"],
  { cwd: root, encoding: "utf8" },
);

assert.equal(
  result.status,
  0,
  `CI config must accept the current desktop/mobile Playwright suite:\n${result.stdout}\n${result.stderr}`,
);

console.log(JSON.stringify({ status: "PASS", check: "current-playwright-suite" }));
