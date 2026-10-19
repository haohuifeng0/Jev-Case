#!/usr/bin/env node

import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validator = path.join(root, "scripts/validate-business.mjs");
const canonicalBusiness = path.join(root, "src/data/business.json");
const canonicalDocs = path.join(root, "docs/business");

async function withFixture(mutate, verify) {
  const directory = await mkdtemp(path.join(tmpdir(), "jev-business-"));
  const businessPath = path.join(directory, "business.json");
  const docsPath = path.join(directory, "docs");
  try {
    await cp(canonicalBusiness, businessPath);
    await cp(canonicalDocs, docsPath, { recursive: true });
    await mutate({ businessPath, docsPath });
    const result = spawnSync(process.execPath, [validator], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        BUSINESS_JSON_PATH: businessPath,
        BUSINESS_DOCS_DIR: docsPath,
      },
    });
    verify(result, { businessPath, docsPath });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function expectRejected(result, pattern) {
  assert.notEqual(result.status, 0, `fixture unexpectedly passed: ${result.stdout}`);
  assert.match(`${result.stdout}\n${result.stderr}`, pattern);
}

async function mutateJson(file, mutate) {
  const value = JSON.parse(await readFile(file, "utf8"));
  mutate(value);
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

await withFixture(
  async ({ docsPath }) => {
    const file = path.join(docsPath, "assessment.md");
    const text = await readFile(file, "utf8");
    await writeFile(file, text.replaceAll("five working days", "six working days").replaceAll("Five working days", "Six working days"));
  },
  (result) => expectRejected(result, /assessment\.md: timeline must match five working days/i),
);

await withFixture(
  async ({ docsPath }) => {
    const file = path.join(docsPath, "assessment.md");
    const text = await readFile(file, "utf8");
    await writeFile(file, text.replace("**Timeline:** Five working days", "**Timeline:** Six working days"));
  },
  (result) => expectRejected(result, /assessment\.md: Timeline field must match five working days/i),
);

for (const serviceId of ["assessment", "poc"]) {
  for (const field of ["inputs", "outputs", "exclusions"]) {
    await withFixture(
      ({ businessPath }) => mutateJson(businessPath, (value) => {
        value.services[serviceId][field] = [];
      }),
      (result) => expectRejected(result, new RegExp(`services\\.${serviceId}\\.${field} must be a non-empty array`)),
    );
  }
}

for (const [pathParts, expectedPath] of [
  [["positioning", "fit"], "positioning.fit"],
  [["positioning", "notFit"], "positioning.notFit"],
  [["claimPolicy", "requiresCustomerEvidence"], "claimPolicy.requiresCustomerEvidence"],
]) {
  await withFixture(
    ({ businessPath }) => mutateJson(businessPath, (value) => {
      value[pathParts[0]][pathParts[1]] = [];
    }),
    (result) => expectRejected(result, new RegExp(`${expectedPath.replace(".", "\\.")} must be a non-empty array`)),
  );
}

await withFixture(
  ({ businessPath }) => writeFile(businessPath, "{not-json\n"),
  (result, { businessPath }) => {
    expectRejected(result, /malformed JSON/);
    assert.match(result.stderr, new RegExp(businessPath.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(result.stderr, /canonical source/);
  },
);

await withFixture(
  async ({ docsPath }) => {
    const file = path.join(docsPath, "poc.md");
    const text = await readFile(file, "utf8");
    await writeFile(file, text.replaceAll("two to three weeks", "three to four weeks").replaceAll("Two to three weeks", "Three to four weeks"));
  },
  (result) => expectRejected(result, /poc\.md: timeline must match two to three weeks/i),
);

await withFixture(
  async ({ docsPath }) => {
    const file = path.join(docsPath, "poc.md");
    const text = await readFile(file, "utf8");
    await writeFile(file, text.replace("**Timeline:** Two to three weeks", "**Timeline:** Three to four weeks"));
  },
  (result) => expectRejected(result, /poc\.md: Timeline field must match two to three weeks/i),
);

await withFixture(
  async ({ docsPath }) => {
    const file = path.join(docsPath, "assessment.md");
    const text = await readFile(file, "utf8");
    await writeFile(file, text.replaceAll("CNY 2,999", "CNY 3,999"));
  },
  (result) => expectRejected(result, /assessment\.md: conflicting price CNY 3,999/i),
);

await withFixture(
  async ({ docsPath }) => {
    const file = path.join(docsPath, "poc.md");
    const text = await readFile(file, "utf8");
    await writeFile(file, text.replaceAll("CNY 19,800", "CNY 18,800"));
  },
  (result) => expectRejected(result, /poc\.md: conflicting price CNY 18,800/i),
);

console.log(JSON.stringify({ status: "PASS", fixtures: 16 }));
