#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const environment = {
  ...process.env,
  PUBLIC_SITE_URL: "https://haohuifeng0.github.io",
  PUBLIC_BASE_PATH: "/Jev-Case/",
  PUBLIC_ASSESSMENT_FORM_URL: "https://wenjuan.feishu.cn/m/cfm?assessment_fixture=determinism",
};
const textExtensions = new Set([".css", ".html", ".js", ".json", ".svg", ".txt", ".xml"]);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(target) : [target];
  }));
  return nested.flat().sort();
}

async function snapshotDist(buildStartedAt, buildFinishedAt) {
  const records = [];
  const wallClockFields = [];
  for (const file of await collectFiles(dist)) {
    const content = await readFile(file);
    const relativePath = path.relative(dist, file).replaceAll(path.sep, "/");
    records.push({ path: relativePath, bytes: content.byteLength, sha256: createHash("sha256").update(content).digest("hex") });
    if (!textExtensions.has(path.extname(file))) continue;
    for (const match of content.toString("utf8").matchAll(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/gu)) {
      const timestamp = Date.parse(match[0]);
      if (timestamp >= buildStartedAt && timestamp <= buildFinishedAt) wallClockFields.push(`${relativePath}: ${match[0]}`);
    }
  }
  const serialized = `${JSON.stringify(records, null, 2)}\n`;
  return { records, checksum: createHash("sha256").update(serialized).digest("hex"), wallClockFields };
}

async function buildAndSnapshot() {
  await rm(dist, { recursive: true, force: true });
  const startedAt = Date.now();
  const result = spawnSync("npm", ["run", "build"], { cwd: root, encoding: "utf8", env: environment, timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  const finishedAt = Date.now();
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return snapshotDist(startedAt, finishedAt);
}

function runDryRun(outputDirectory) {
  const result = spawnSync(process.execPath, ["scripts/launch-dry-run.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: { ...environment, LAUNCH_AS_OF: "2026-10-21", LAUNCH_OUTPUT_DIR: outputDirectory, LAUNCH_REQUIRE_CLEAN: "false" },
    timeout: 600_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

// Given: two clean static builds with identical public configuration and source inputs.
const first = await buildAndSnapshot();
const second = await buildAndSnapshot();

// When: every emitted file and timestamp-like field is inspected.
const changedPaths = second.records
  .filter((record, index) => JSON.stringify(record) !== JSON.stringify(first.records[index]))
  .map((record) => record.path);

// Then: manifests and checksums are byte-identical and no build clock entered the artifact.
assert.deepEqual(changedPaths, [], `fixed-config builds changed files: ${changedPaths.join(", ")}`);
assert.equal(second.checksum, first.checksum, "fixed-config dist manifest checksums differ");
assert.deepEqual([...first.wallClockFields, ...second.wallClockFields], [], "static artifact contains build-time timestamps");
for (const relativePath of ["src/pages/index.astro", "src/components/verification/VerificationRecord.astro", "src/lib/cases.ts"]) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  assert.doesNotMatch(source, /new Date\(\)|Date\.now\(\)/u, `${relativePath} contains a static wall-clock dependency`);
}

const dryRunRoot = await mkdtemp(path.join(tmpdir(), "jev-deterministic-dry-run-"));
let dryRunChecksum;
try {
  const firstOutput = path.join(dryRunRoot, "first");
  const secondOutput = path.join(dryRunRoot, "second");
  runDryRun(firstOutput);
  runDryRun(secondOutput);
  const firstManifest = await readFile(path.join(firstOutput, "manifest.json"));
  const secondManifest = await readFile(path.join(secondOutput, "manifest.json"));
  const firstChecksum = await readFile(path.join(firstOutput, "manifest.sha256"), "utf8");
  const secondChecksum = await readFile(path.join(secondOutput, "manifest.sha256"), "utf8");
  assert.deepEqual(secondManifest, firstManifest, "fixed-config dry-run manifests differ");
  assert.equal(secondChecksum, firstChecksum, "fixed-config dry-run checksums differ");
  dryRunChecksum = secondChecksum.split(" ")[0];
} finally {
  await rm(dryRunRoot, { recursive: true, force: true });
}

console.log(JSON.stringify({ status: "PASS", files: second.records.length, buildChecksum: second.checksum, dryRunChecksum, wallClockFields: 0 }));
