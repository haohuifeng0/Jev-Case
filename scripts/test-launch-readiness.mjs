#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const oldOwnerPattern = new RegExp(["hi", "woniu"].join(""), "iu");

async function text(relativePath) {
  try {
    return await readFile(path.join(root, relativePath), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return "";
    throw error;
  }
}

test("Pages workflow separates PR checks from approved production deployment", async () => {
  // Given: the repository deployment workflow.
  const workflow = await text(".github/workflows/pages.yml");

  // When: triggers, permissions, and official Pages actions are inspected.
  // Then: pull requests cannot reach the production deployment job.
  assert.match(workflow, /pull_request:/u);
  assert.match(workflow, /push:\s*\n\s*branches:\s*\[main\]/u);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /if:.*github\.event_name != 'pull_request'/u);
  assert.match(workflow, /environment:\s*\n\s*name: github-pages/u);
  assert.match(workflow, /pages: write/u);
  assert.match(workflow, /id-token: write/u);
  assert.match(workflow, /actions\/configure-pages@v5/u);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/u);
  assert.match(workflow, /actions\/deploy-pages@v4/u);
  assert.match(workflow, /vars\.PUBLIC_ASSESSMENT_FORM_URL/u);
  assert.doesNotMatch(workflow, /secrets\.PUBLIC_ASSESSMENT_FORM_URL/u);
});

test("deployment defaults use the repository Pages URL and support root custom domains", async () => {
  // Given: the Astro and example environment contracts.
  const config = await text("astro.config.mjs");
  const example = await text(".env.example");

  // When: default owner and base values are inspected.
  // Then: the repository URL is exact and root remains a documented override.
  assert.match(config, /https:\/\/haohuifeng0\.github\.io/u);
  assert.match(config, /\/Jev-Case\//u);
  assert.match(example, /PUBLIC_SITE_URL=https:\/\/haohuifeng0\.github\.io/u);
  assert.match(example, /PUBLIC_BASE_PATH=\/Jev-Case\//u);
  assert.match(example, /custom domain.*PUBLIC_BASE_PATH=\//iu);
  assert.doesNotMatch(`${config}\n${example}`, oldOwnerPattern);
});

test("launch tooling and runbooks cover dry-run, rollback, refresh, expiry, and KPI reviews", async () => {
  // Given: the launch package commands and operations documentation.
  const packageJson = JSON.parse(await text("package.json"));
  const launch = await text("docs/launch/README.md");
  const rollback = await text("docs/launch/rollback.md");
  const refresh = await text("docs/launch/catalog-refresh.md");
  const calendar = await text("docs/operations/12-week-calendar.md");

  // When: operator-facing launch controls are inspected.
  // Then: each required control has an executable command and explicit decision rule.
  assert.equal(packageJson.scripts["launch:dry-run"], "node scripts/launch-dry-run.mjs");
  assert.equal(packageJson.scripts["report:verification-expiry"], "node scripts/report-verification-expiry.mjs");
  assert.equal(packageJson.scripts["catalog:cadence"], "node scripts/check-catalog-refresh.mjs");
  assert.match(packageJson.scripts["test:launch"], /test-static-build-determinism\.mjs/u);
  assert.match(launch, /environment approval.*repository settings/iu);
  assert.match(launch, /do not deploy/iu);
  assert.match(rollback, /prior immutable Pages artifact/iu);
  assert.match(rollback, /commit SHA/iu);
  assert.match(refresh, /30 days/iu);
  assert.match(calendar, /If qualified interviews are zero at the end of week 8, stop feature development\./u);
  assert.match(calendar, /## Week-12 review/u);
});

test("deployment and launch sources contain no old owner default", async () => {
  // Given: every deployment/configuration document and generated-canonical source.
  const files = [
    "astro.config.mjs",
    ".env.example",
    "README.md",
    "src/pages/sitemap.xml.ts",
    "scripts/test-built-site.mjs",
    "scripts/test-metadata-security.mjs",
    ".github/workflows/pages.yml",
    "docs/launch/README.md",
  ];
  const contents = await Promise.all(files.map(text));

  // When: legacy owner references are scanned.
  // Then: no deployment default can regenerate the old canonical host.
  assert.doesNotMatch(contents.join("\n"), oldOwnerPattern);
});
