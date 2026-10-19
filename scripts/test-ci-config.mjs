#!/usr/bin/env node

import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:net";
import { readFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const config = await readFile(path.join(root, "playwright.config.ts"), "utf8");
const { default: playwrightConfig } = await import(path.join(root, "playwright.config.ts"));
const requiredProjects = ["desktop", "mobile"];

assert.equal(packageJson.scripts["test:smoke"], "node scripts/run-smoke.mjs");
assert.match(config, /webServer\s*:/, "Playwright smoke tests must own the preview server lifecycle");
assert.match(config, /exec node scripts\/start-smoke-server\.mjs/);
assert.match(config, /reuseExistingServer:\s*false/);
assert.match(config, /url:\s*["']http:\/\/127\.0\.0\.1:4321["']/);
const configuredProjects = new Map(
  playwrightConfig.projects?.map((project) => [project.name, project]) ?? [],
);
for (const projectName of requiredProjects) {
  assert.equal(
    configuredProjects.get(projectName)?.use?.channel,
    "chrome",
    `${projectName} must use the Chrome channel`,
  );
}

const listedTests = spawnSync(process.execPath, [
  "node_modules/@playwright/test/cli.js",
  "test",
  "--list",
], { cwd: root, encoding: "utf8" });
assert.equal(listedTests.status, 0, listedTests.stderr);
validatePlaywrightTestList(listedTests.stdout);
assert.throws(
  () => validatePlaywrightTestList("Total: 0 tests in 0 files\n"),
  /at least one Playwright test/,
);
assert.throws(
  () => validatePlaywrightTestList(
    "Listing tests:\n  [desktop] › smoke.spec.ts:3:1 › desktop only\nTotal: 1 test in 1 file\n",
  ),
  /mobile must list at least one Playwright test/,
);

const exactCommandPort = 4324;
const exactCommandBlocker = createServer(() => {}).listen(exactCommandPort, "127.0.0.1");
await new Promise((resolve) => exactCommandBlocker.once("listening", resolve));
try {
  const startedAt = Date.now();
  const result = spawnSync("npm", ["run", "test:smoke"], {
    cwd: root,
    encoding: "utf8",
    timeout: 3_000,
    env: { ...process.env, SMOKE_PORT: String(exactCommandPort) },
  });
  assert.ok(Date.now() - startedAt < 4_500, "exact smoke command must fail promptly");
  assert.notEqual(result.status, 0, "exact smoke command must reject an occupied port");
  assert.match(`${result.stdout}\n${result.stderr}`, /4324.*already in use/i);
} finally {
  exactCommandBlocker.close();
}

const occupiedPort = 4322;
const blocker = createServer().listen(occupiedPort, "127.0.0.1");
await new Promise((resolve) => blocker.once("listening", resolve));
try {
  const result = spawnSync(process.execPath, ["scripts/start-smoke-server.mjs"], {
    cwd: root,
    encoding: "utf8",
    timeout: 5_000,
    env: { ...process.env, SMOKE_PORT: String(occupiedPort) },
  });
  assert.notEqual(result.status, 0, "occupied smoke port must fail");
  assert.match(`${result.stdout}\n${result.stderr}`, /4322.*already in use/i);
} finally {
  blocker.close();
}

const managedPort = 4323;
const managedServer = spawn(process.execPath, ["scripts/start-smoke-server.mjs"], {
  cwd: root,
  env: { ...process.env, SMOKE_PORT: String(managedPort) },
  stdio: "ignore",
});
try {
  const started = await waitForPort(managedPort, 10_000);
  assert.equal(started, true, "managed smoke server must start before interruption");
  managedServer.kill("SIGTERM");
  await once(managedServer, "exit");
  assert.equal(await waitForPort(managedPort, 1_000, false), false, "interrupted smoke server must release its port");
} finally {
  managedServer.kill("SIGTERM");
}

console.log(JSON.stringify({ status: "PASS", checks: ["playwright-web-server", "chrome-channel", "occupied-port"] }));

function validatePlaywrightTestList(output) {
  const summary = output.match(/^Total:\s+(\d+)\s+tests?\s+in\s+(\d+)\s+files?$/m);
  assert.ok(summary, "Playwright test list must include a total summary");

  const total = Number(summary[1]);
  const fileCount = Number(summary[2]);
  assert.ok(total > 0 && fileCount > 0, "CI must list at least one Playwright test");

  const listed = [...output.matchAll(/^\s+\[([^\]]+)\]\s+›\s+(.+)$/gm)].map(
    ([, project, identity]) => ({ project, identity }),
  );
  assert.equal(listed.length, total, "Playwright summary must match listed test cases");

  const files = new Set(
    listed.map(({ identity }) => identity.match(/^([^:]+):\d+:\d+\s+›/)?.[1]),
  );
  files.delete(undefined);
  assert.equal(files.size, fileCount, "Playwright summary must match listed test files");

  const testsByProject = new Map();
  for (const projectName of requiredProjects) {
    const identities = listed
      .filter(({ project }) => project === projectName)
      .map(({ identity }) => identity);
    assert.ok(
      identities.length > 0,
      `${projectName} must list at least one Playwright test`,
    );
    testsByProject.set(projectName, identities.sort());
  }
  assert.deepEqual(
    testsByProject.get("desktop"),
    testsByProject.get("mobile"),
    "desktop and mobile must list the same Playwright tests",
  );
}

async function waitForPort(targetPort, timeout, expected = true) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const occupied = await new Promise((resolve) => {
      const socket = createServer();
      socket.once("error", () => resolve(true));
      socket.listen(targetPort, "127.0.0.1", () => socket.close(() => resolve(false)));
    });
    if (occupied === expected) return occupied;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}
