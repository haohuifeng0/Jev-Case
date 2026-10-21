#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validator = path.join(root, "scripts/validate-data.mjs");
const revision = "0123456789abcdef0123456789abcdef01234567";
const immutableEvidence = (label) => ({
  label,
  revision,
  url: `https://github.com/example/project/blob/${revision}/verification.txt`,
});
const runnableEvidence = (label) => ({
  label,
  revision,
  url: `https://github.com/example/project/commit/${revision}/checks`,
});

const caseItem = {
  id: "case-1",
  canonicalUrl: "https://x.com/example/status/1",
  author: { name: "Example", screenName: "example", verified: false },
  createdAt: "2026-01-02T03:04:05.000Z",
  text: "Example case",
  lang: "en",
  metrics: { views: 1, likes: 0, bookmarks: 0, reposts: 0, replies: 0, quotes: 0 },
  media: [],
  quoted: null,
  links: [],
  articles: [],
  references: [],
  hashtags: [],
  mentions: [],
  mediaStatus: "ready",
  curatedAt: "2026-01-02T03:04:05.000Z",
};

const validDatasets = () => ({
  "cases.json": {
    schemaVersion: 1,
    generatedAt: "2026-01-02T03:04:05.000Z",
    aliases: [{ id: "case-alias", canonicalCaseId: "case-1" }],
    cases: [caseItem],
  },
  "projects.json": {
    schemaVersion: 1,
    projects: [{
      id: "https://github.com/example/project",
      slug: "example-project",
      name: "Example Project",
      url: "https://github.com/example/project",
      category: { key: "agent-decisions", title: "Agent Decisions" },
      summary: "Example summary",
      tags: { agent: "multi" },
      source: { file: "categories/agent-decisions.md", line: 1 },
      github: { owner: "example", repo: "project" },
    }],
  },
  "catalog-source.json": { schemaVersion: 1, source: null },
  "project-case-relations.json": {
    schemaVersion: 1,
    relations: [{
      projectId: "https://github.com/example/project",
      caseId: "case-1",
      type: "demo",
      evidenceUrl: "https://x.com/example/status/1",
    }],
  },
  "verifications.json": {
    schemaVersion: 1,
    verifications: [{
      projectId: "https://github.com/example/project",
      sourceAvailability: "public-source",
      revision,
      status: "verified",
      reviewedAt: "2026-01-02",
      checks: {
        directJevCall: { outcome: "pass", evidence: [immutableEvidence("Direct Jev call")] },
        runnableCheck: { outcome: "pass", evidence: [runnableEvidence("Runnable check")] },
        publicDemo: { outcome: "not-found", evidence: [] },
        license: { result: "found", evidence: [immutableEvidence("License")] },
        documentationDepth: { result: "substantial", evidence: [immutableEvidence("Documentation")] },
        maintenanceSignal: { result: "active", evidence: [immutableEvidence("Maintenance")] },
      },
      reviewerNotes: "Fixture review notes.",
    }],
  },
  "scenarios.json": {
    schemaVersion: 1,
    scenarios: [{
      id: "model-routing",
      slug: "model-routing",
      title: "Model routing",
      projectIds: ["https://github.com/example/project"],
      caseIds: ["case-1"],
    }],
  },
});

async function runFixture(mutate) {
  const directory = await mkdtemp(path.join(tmpdir(), "jev-data-"));
  try {
    const datasets = validDatasets();
    mutate(datasets);
    await Promise.all(Object.entries(datasets).map(([name, value]) =>
      writeFile(path.join(directory, name), typeof value === "string" ? value : `${JSON.stringify(value)}\n`),
    ));
    return spawnSync(process.execPath, ["--experimental-strip-types", validator], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, DATA_DIR: directory },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function expectFailure(result, pattern) {
  assert.notEqual(result.status, 0, `fixture unexpectedly passed: ${result.stdout}`);
  assert.match(`${result.stdout}\n${result.stderr}`, pattern);
  assert.doesNotMatch(result.stdout, /"status":"PASS"/);
}

test("rejects duplicate case IDs with a dataset path", async () => {
  const result = await runFixture((datasets) => datasets["cases.json"].cases.push(caseItem));
  expectFailure(result, /cases\.json: cases\.1\.id: duplicate ID case-1/);
});

test("rejects an alias whose canonical case is missing", async () => {
  const result = await runFixture((datasets) => {
    datasets["cases.json"].aliases[0].canonicalCaseId = "missing-case";
  });
  expectFailure(result, /cases\.json: aliases\.0\.canonicalCaseId: unknown case ID missing-case/);
});

test("rejects unsafe external URLs", async () => {
  const result = await runFixture((datasets) => {
    datasets["project-case-relations.json"].relations[0].evidenceUrl = "javascript:alert(1)";
  });
  expectFailure(result, /project-case-relations\.json: relations\.0\.evidenceUrl/);
});

test("rejects unknown schema versions", async () => {
  const result = await runFixture((datasets) => {
    datasets["projects.json"].schemaVersion = 2;
  });
  expectFailure(result, /projects\.json: schemaVersion/);
});

test("rejects duplicate scenario slugs", async () => {
  const result = await runFixture((datasets) => {
    datasets["scenarios.json"].scenarios.push({
      ...datasets["scenarios.json"].scenarios[0],
      id: "another-scenario",
    });
  });
  expectFailure(result, /scenarios\.json: scenarios\.1\.slug: duplicate slug model-routing/);
});

test("rejects dangling project relations", async () => {
  const result = await runFixture((datasets) => {
    datasets["project-case-relations.json"].relations[0].projectId = "https://github.com/missing/project";
  });
  expectFailure(result, /project-case-relations\.json: relations\.0\.projectId: unknown project ID/);
});

test("rejects unsupported verification statuses", async () => {
  const result = await runFixture((datasets) => {
    datasets["verifications.json"].verifications[0].status = "approved";
  });
  expectFailure(result, /verifications\.json: verifications\.0\.status/);
});

test("rejects verified status without direct-call and runnable evidence", async () => {
  const result = await runFixture((datasets) => {
    datasets["verifications.json"].verifications[0].checks.directJevCall = {
      outcome: "not-found",
      evidence: [],
    };
    datasets["verifications.json"].verifications[0].checks.runnableCheck = {
      outcome: "not-found",
      evidence: [],
    };
  });
  expectFailure(result, /verifications\.json: verifications\.0\.status: must be unverified/);
});

test("rejects a declared status that conflicts with derived evidence", async () => {
  const result = await runFixture((datasets) => {
    datasets["verifications.json"].verifications[0].status = "limited";
  });
  expectFailure(result, /verifications\.json: verifications\.0\.status: must be verified/);
});

test("rejects mutable HTTP verification evidence", async () => {
  const result = await runFixture((datasets) => {
    datasets["verifications.json"].verifications[0].checks.directJevCall.evidence[0].url =
      `http://github.com/example/project/blob/${revision}/verification.txt`;
  });
  expectFailure(result, /verifications\.json: verifications\.0\.checks\.directJevCall\.evidence\.0\.url/);
});

test("rejects HTTPS evidence that is not bound to its revision", async () => {
  const result = await runFixture((datasets) => {
    datasets["verifications.json"].verifications[0].checks.directJevCall.evidence[0].url =
      "https://github.com/example/project/blob/main/verification.txt";
  });
  expectFailure(result, /must use an immutable GitHub blob, tree, commit, or raw URL matching revision/);
});

test("rejects invalid ISO review dates", async () => {
  const result = await runFixture((datasets) => {
    datasets["verifications.json"].verifications[0].reviewedAt = "02\/01\/2026";
  });
  expectFailure(result, /verifications\.json: verifications\.0\.reviewedAt/);
});

test("accepts a stale record without rewriting its dated status", async () => {
  const result = await runFixture((datasets) => {
    datasets["verifications.json"].verifications[0].reviewedAt = "2025-01-01";
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"status":"PASS"/);
});

test("rejects malformed JSON without printing success", async () => {
  const result = await runFixture((datasets) => {
    datasets["scenarios.json"] = "{not-json\n";
  });
  expectFailure(result, /scenarios\.json: malformed JSON/);
});
