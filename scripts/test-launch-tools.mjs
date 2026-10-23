#!/usr/bin/env node

import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createCatalogCadenceReport } from "./check-catalog-refresh.mjs";
import { assertCleanWorktree, resolveDeploymentConfig } from "./deployment-config.mjs";
import { cleanupTemporaryOutput, runCommand } from "./launch-dry-run.mjs";
import { createKpiWorksheet } from "./generate-kpi-worksheet.mjs";
import { reviewOperatingCycle } from "./review-operating-cycle.mjs";
import { assertNoExpiredRecords, createVerificationExpiryReport } from "./report-verification-expiry.mjs";

const valid = {
  PUBLIC_SITE_URL: "https://haohuifeng0.github.io",
  PUBLIC_BASE_PATH: "/Jev-Case/",
  PUBLIC_ASSESSMENT_FORM_URL: "https://wenjuan.feishu.cn/m/cfm?assessment_fixture=test",
};
const oldOwnerHost = `https://${["hi", "woniu"].join("")}.github.io`;

test("deployment config accepts repository and custom-domain bases", () => {
  // Given: valid repository and custom-domain contracts.
  const repository = resolveDeploymentConfig(valid, true);
  const custom = resolveDeploymentConfig({ ...valid, PUBLIC_SITE_URL: "https://jev.example", PUBLIC_BASE_PATH: "/" }, true);

  // When: their public roots are resolved.
  // Then: neither path is duplicated.
  assert.equal(repository.productionUrl, "https://haohuifeng0.github.io/Jev-Case/");
  assert.equal(custom.productionUrl, "https://jev.example/");
});

for (const [label, environment, pattern] of [
  ["missing site", { ...valid, PUBLIC_SITE_URL: "" }, /PUBLIC_SITE_URL is required/u],
  ["missing base", { ...valid, PUBLIC_BASE_PATH: "" }, /PUBLIC_BASE_PATH is required/u],
  ["missing form", { ...valid, PUBLIC_ASSESSMENT_FORM_URL: "" }, /PUBLIC_ASSESSMENT_FORM_URL is required/u],
  ["wrong owner", { ...valid, PUBLIC_SITE_URL: oldOwnerHost }, /wrong GitHub Pages owner/u],
  ["double base", { ...valid, PUBLIC_SITE_URL: "https://haohuifeng0.github.io/Jev-Case/" }, /without a path/u],
  ["malformed base", { ...valid, PUBLIC_BASE_PATH: "Jev-Case" }, /start and end with one slash/u],
  ["unsafe form", { ...valid, PUBLIC_ASSESSMENT_FORM_URL: "javascript:alert(1)" }, /approved Feishu HTTPS host/u],
]) {
  test(`deployment config rejects ${label}`, () => {
    // Given: one malformed release contract.
    // When: it is parsed for release.
    // Then: the named boundary fails closed.
    assert.throws(() => resolveDeploymentConfig(environment, true), pattern);
  });
}

test("dirty worktree output cannot masquerade as a clean release", () => {
  // Given: porcelain output from a dirty worktree.
  // When: launch cleanliness is checked.
  // Then: even an apparent PASS marker cannot bypass the dirty file.
  assert.throws(() => assertCleanWorktree("?? misleading-PASS.txt\n"), /requires a clean worktree/u);
});

test("long launch commands time out instead of reporting success", () => {
  // Given: a command that exceeds the configured launch budget.
  const environment = { ...process.env, LAUNCH_COMMAND_TIMEOUT_MS: "25" };

  // When/Then: timeout is an error and no PASS marker is returned.
  assert.throws(
    () => runCommand(process.execPath, ["-e", "setTimeout(() => {}, 1000)"], environment),
    /timed out|ETIMEDOUT/iu,
  );
});

test("repeated interruption cleanup removes partial launch output", async () => {
  // Given: a partial temporary artifact directory.
  const directory = await mkdtemp(path.join(tmpdir(), "jev-launch-interrupt-"));
  await mkdir(path.join(directory, "partial"));
  await writeFile(path.join(directory, "partial", "manifest.json"), "incomplete");

  // When: cleanup is invoked repeatedly as repeated signals may request.
  await cleanupTemporaryOutput(directory);
  await cleanupTemporaryOutput(directory);

  // Then: no partial artifact survives.
  await assert.rejects(access(directory), { code: "ENOENT" });
});

test("verification expiry report marks records older than 90 days", async () => {
  // Given: records on each side of the 90-day boundary.
  const directory = await mkdtemp(path.join(tmpdir(), "jev-expiry-"));
  try {
    const inputPath = path.join(directory, "verifications.json");
    await writeFile(inputPath, JSON.stringify({ schemaVersion: 1, verifications: [
      { projectId: "fresh", reviewedAt: "2026-07-23" },
      { projectId: "expired", reviewedAt: "2026-07-22" },
    ] }));

    // When: the report runs as of a fixed date.
    const report = await createVerificationExpiryReport({ inputPath, asOf: "2026-10-21" });

    // Then: only age greater than 90 days is expired.
    assert.deepEqual(report.records.map(({ projectId, expired }) => ({ projectId, expired })), [
      { projectId: "fresh", expired: false },
      { projectId: "expired", expired: true },
    ]);
    assert.throws(() => assertNoExpiredRecords(report), /exceed the 90-day review window/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("KPI worksheet and week reviews enforce the week-8 stop rule", () => {
  // Given: a privacy-safe 12-week worksheet with no qualified interviews.
  const worksheet = createKpiWorksheet();

  // When: week 8 and week 12 are reviewed.
  const week8 = reviewOperatingCycle(worksheet, 8);
  const week12 = reviewOperatingCycle(worksheet, 12);

  // Then: feature development stops at week 8 and week 12 requires a commercial review.
  assert.equal(worksheet.trim().split("\n").length, 13);
  assert.equal(week8.decision, "STOP_FEATURE_DEVELOPMENT");
  assert.match(week8.reason, /qualified interviews are zero/iu);
  assert.equal(week12.decision, "WEEK_12_REVIEW_REQUIRED");
});

test("catalog cadence rejects stale state and mismatched source pins", async () => {
  // Given: a published source pin and an old cadence state.
  const directory = await mkdtemp(path.join(tmpdir(), "jev-catalog-cadence-"));
  try {
    const sourcePath = path.join(directory, "source.json");
    const statePath = path.join(directory, "state.json");
    await writeFile(sourcePath, JSON.stringify({ schemaVersion: 1, source: { state: "published", commit: "a".repeat(40), sha256: "b".repeat(64) } }));
    await writeFile(statePath, JSON.stringify({ schemaVersion: 1, cadenceDays: 30, reviewedAt: "2026-08-01", sourceCommit: "a".repeat(40), sourceSha256: "b".repeat(64) }));

    // When/Then: stale age fails before it can report success.
    await assert.rejects(createCatalogCadenceReport({ statePath, sourcePath, asOf: "2026-10-21" }), /refresh is stale/u);

    await writeFile(statePath, JSON.stringify({ schemaVersion: 1, cadenceDays: 30, reviewedAt: "2026-10-21", sourceCommit: "c".repeat(40), sourceSha256: "b".repeat(64) }));
    await assert.rejects(createCatalogCadenceReport({ statePath, sourcePath, asOf: "2026-10-21" }), /stale source commit/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
