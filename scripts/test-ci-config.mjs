#!/usr/bin/env node

import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:net";
import { readFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const workflow = await readFile(path.join(root, ".github/workflows/ci.yml"), "utf8");
const requiredProjects = ["desktop", "mobile"];
const defaultPlaywrightConfig = await loadPlaywrightConfig();
const isolatedPlaywrightConfig = await loadPlaywrightConfig("4399");

assert.equal(packageJson.scripts["test:smoke"], "node scripts/run-smoke.mjs");
assertSmokeConfig(defaultPlaywrightConfig, "4321");
assertSmokeConfig(isolatedPlaywrightConfig, "4399");
const configuredProjects = new Map(
  defaultPlaywrightConfig.projects?.map((project) => [project.name, project]) ?? [],
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

const buildStep = workflow.match(
  /- name: Build Astro site\s+env:\s+PUBLIC_ASSESSMENT_FORM_URL:\s*["']?([^\s"']+)["']?\s+run: npm run build/,
);
assert.ok(buildStep, "CI build step must provide PUBLIC_ASSESSMENT_FORM_URL");
const ciAssessmentUrl = new URL(buildStep[1]);
assert.equal(ciAssessmentUrl.protocol, "https:");
assert.equal(ciAssessmentUrl.hostname, "wenjuan.feishu.cn");
assert.equal(ciAssessmentUrl.searchParams.get("assessment_fixture"), "ci");
const ciBuild = spawnSync("npm", ["run", "build"], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, PUBLIC_ASSESSMENT_FORM_URL: ciAssessmentUrl.toString() },
});
assert.equal(ciBuild.status, 0, `${ciBuild.stdout}\n${ciBuild.stderr}`);

const smokeStep = workflow.match(/- name: Run Playwright smoke tests\s+[\s\S]*?(?=\n\s+- name:|$)/)?.[0];
assert.ok(smokeStep, "CI must run the Playwright smoke command");
assert.match(smokeStep, /run:\s+npm run test:smoke\s*$/m);
assert.doesNotMatch(smokeStep, /SMOKE_PORT/, "CI smoke must retain the default port 4321");

await expectExactSmokeRejectsOccupiedPort();
await expectExactSmokeRejectsOccupiedPort("4399");

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

console.log(JSON.stringify({
  status: "PASS",
  checks: ["ci-build-env", "playwright-web-server", "smoke-port-consistency", "chrome-channel", "occupied-port"],
}));

async function loadPlaywrightConfig(smokePort) {
  const previous = process.env.SMOKE_PORT;
  if (smokePort === undefined) delete process.env.SMOKE_PORT;
  else process.env.SMOKE_PORT = smokePort;
  try {
    const configUrl = pathToFileURL(path.join(root, "playwright.config.ts"));
    configUrl.searchParams.set("smoke-port", smokePort ?? "default");
    return (await import(configUrl.href)).default;
  } finally {
    if (previous === undefined) delete process.env.SMOKE_PORT;
    else process.env.SMOKE_PORT = previous;
  }
}

function assertSmokeConfig(playwrightConfig, expectedPort) {
  const expectedUrl = `http://127.0.0.1:${expectedPort}`;
  assert.equal(playwrightConfig.use?.baseURL, expectedUrl, "Playwright runner must use the resolved smoke port");
  assert.equal(playwrightConfig.webServer?.url, expectedUrl, "Playwright preflight must use the resolved smoke port");
  assert.equal(playwrightConfig.webServer?.command, "exec node scripts/start-smoke-server.mjs");
  assert.equal(playwrightConfig.webServer?.reuseExistingServer, false);
}

async function expectExactSmokeRejectsOccupiedPort(smokePort) {
  const expectedPort = Number(smokePort ?? "4321");
  const blocker = createServer(() => {}).listen(expectedPort, "127.0.0.1");
  await once(blocker, "listening");
  try {
    const startedAt = Date.now();
    const result = spawnSync("npm", ["run", "test:smoke"], {
      cwd: root,
      encoding: "utf8",
      timeout: 3_000,
      env: smokeEnvironment(smokePort),
    });
    assert.ok(Date.now() - startedAt < 4_500, "exact smoke command must fail promptly");
    assert.notEqual(result.status, 0, "exact smoke command must reject an occupied port");
    assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(`${expectedPort}.*already in use`, "i"));
  } finally {
    await new Promise((resolve) => blocker.close(resolve));
  }
  assert.equal(await waitForPort(expectedPort, 1_000, false), false, `smoke preflight must release ${expectedPort}`);
}

function smokeEnvironment(smokePort) {
  const environment = { ...process.env };
  if (smokePort === undefined) delete environment.SMOKE_PORT;
  else environment.SMOKE_PORT = smokePort;
  return environment;
}

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
