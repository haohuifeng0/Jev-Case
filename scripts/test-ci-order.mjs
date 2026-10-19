#!/usr/bin/env node

import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = await readFile(path.join(root, ".github/workflows/ci.yml"), "utf8");
const validationStep = workflow.indexOf("npm run validate:data");
const buildStep = workflow.indexOf("npm run build");

assert.notEqual(validationStep, -1, "CI must validate data");
assert.notEqual(buildStep, -1, "CI must build the site");
assert.ok(validationStep < buildStep, "CI must validate data before building");
assert.match(workflow, /permissions:\s+contents:\s+read/);
for (const action of ["actions/checkout@v4", "actions/setup-node@v4", "actions/upload-artifact@v4"]) {
  assert.match(workflow, new RegExp(action.replaceAll("/", "\\/")));
}
for (const command of [
  "npm ci",
  "npm run validate:business",
  "npm run check",
  "npx playwright install --with-deps chrome",
  "npm run test:smoke",
]) {
  assert.match(workflow, new RegExp(command.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.match(workflow, /Upload Playwright artifacts on failure/);
assert.doesNotMatch(workflow, /secrets\.|deploy|environment:/i);

const fixtureDirectory = await mkdtemp(path.join(tmpdir(), "jev-ci-order-"));
const markerPath = path.join(fixtureDirectory, "build-reached");
try {
  await cp(path.join(root, "src/data"), fixtureDirectory, { recursive: true });
  await writeFile(path.join(fixtureDirectory, "scenarios.json"), "{invalid-json\n");

  const validation = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/validate-data.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, DATA_DIR: fixtureDirectory },
  });

  if (validation.status === 0) await writeFile(markerPath, "build reached\n");
  assert.notEqual(validation.status, 0, "invalid data must fail the validation gate");
  assert.match(`${validation.stdout}\n${validation.stderr}`, /scenarios\.json: malformed JSON/);
  await assert.rejects(readFile(markerPath), /./, "build must not run after validation failure");
} finally {
  await rm(fixtureDirectory, { recursive: true, force: true });
}

console.log(JSON.stringify({ status: "PASS", check: "validation-before-build" }));
