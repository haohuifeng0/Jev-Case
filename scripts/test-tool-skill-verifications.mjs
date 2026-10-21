#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const report = path.join(root, "scripts/report-tool-skill-verifications.mjs");
const datasetNames = [
  "cases.json",
  "projects.json",
  "catalog-source.json",
  "project-case-relations.json",
  "verifications.json",
  "scenarios.json",
];
const scenarioFile = path.join(root, "src/content/scenarios/tool-skill-selection.json");
const projectIds = [
  "https://github.com/godsboy/jev-agent-skill-router",
  "https://github.com/safzanpirani/pi-jev-skill-picker",
  "https://github.com/dicklesworthstone/skillranker",
  "https://github.com/parkavenue9639/jevloop",
  "https://github.com/kerpopule/hermes-jev-skills",
];

async function loadCommittedData() {
  const entries = await Promise.all(datasetNames.map(async (name) => [
    name,
    JSON.parse(await readFile(path.join(root, "src/data", name), "utf8")),
  ]));
  return Object.fromEntries(entries);
}

async function runFixture(mutate = () => {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "jev-tool-skill-"));
  const fixtureScenarioFile = path.join(directory, "tool-skill-selection.json");
  try {
    const datasets = await loadCommittedData();
    const scenario = JSON.parse(await readFile(scenarioFile, "utf8"));
    mutate(datasets, scenario);
    await Promise.all(datasetNames.map((name) => {
      const value = datasets[name];
      return writeFile(path.join(directory, name), typeof value === "string" ? value : `${JSON.stringify(value)}\n`);
    }));
    await writeFile(fixtureScenarioFile, `${JSON.stringify(scenario)}\n`);
    return spawnSync(process.execPath, ["--experimental-strip-types", report], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, DATA_DIR: directory, TOOL_SKILL_FILE: fixtureScenarioFile },
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

test("reports five tool-skill records within the twenty-record verification set", () => {
  const first = spawnSync(process.execPath, ["--experimental-strip-types", report], { cwd: root, encoding: "utf8" });
  const second = spawnSync(process.execPath, ["--experimental-strip-types", report], { cwd: root, encoding: "utf8" });

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);
  const output = JSON.parse(first.stdout);
  assert.equal(output.status, "PASS");
  assert.equal(output.reviewedAt, "2026-10-20");
  assert.equal(output.totalRecordCount, 20);
  assert.equal(output.recordCount, 5);
  assert.deepEqual(output.projectIds, projectIds);
  assert.deepEqual(output.statuses, { limited: 3, verified: 2, unverified: 0 });
  assert.equal(output.scenarioLinkedRecords, 5);
  assert.deepEqual(output.relatedCaseIds, []);
  assert.equal(output.liveCallsClaimed, 0);
});

test("rejects duplicate evidence URLs", async () => {
  const result = await runFixture((datasets) => {
    const record = datasets["verifications.json"].verifications.find((item) => item.projectId === projectIds[0]);
    record.checks.documentationDepth.evidence[0].url = record.checks.license.evidence[0].url;
  });
  expectFailure(result, /duplicate evidence URL/);
});

test("rejects verified status backed only by a workflow definition", async () => {
  const result = await runFixture((datasets) => {
    const record = datasets["verifications.json"].verifications.find((item) => item.projectId === projectIds[0]);
    const revision = record.checks.runnableCheck.evidence[0].revision;
    record.checks.runnableCheck.evidence = [{
      label: "Workflow definition only",
      url: `https://github.com/GodsBoy/jev-agent-skill-router/blob/${revision}/.github/workflows/checks.yml`,
      revision,
    }];
  });
  expectFailure(result, /runnableCheck.*commit checks evidence/);
});

test("rejects README-only direct-call evidence", async () => {
  const result = await runFixture((datasets) => {
    const record = datasets["verifications.json"].verifications.find((item) => item.projectId === projectIds[1]);
    const revision = record.checks.directJevCall.evidence[0].revision;
    record.checks.directJevCall.evidence[0].url =
      `https://github.com/safzanpirani/pi-jev-skill-picker/blob/${revision}/README.md`;
  });
  expectFailure(result, /direct-call pass must cite source rather than README evidence/);
});

test("rejects stale revisions and status claims that do not derive from evidence", async () => {
  const stale = await runFixture((datasets) => {
    const record = datasets["verifications.json"].verifications.find((item) => item.projectId === projectIds[4]);
    record.checks.directJevCall.evidence[0].revision = "0123456789abcdef0123456789abcdef01234567";
  });
  expectFailure(stale, /immutable GitHub.*matching revision/);

  const status = await runFixture((datasets) => {
    const record = datasets["verifications.json"].verifications.find((item) => item.projectId === projectIds[1]);
    record.status = "verified";
  });
  expectFailure(status, /must be limited based on check evidence/);
});

test("requires prominent SkillRanker non-standard license and provider-rider risk", async () => {
  const result = await runFixture((datasets) => {
    const record = datasets["verifications.json"].verifications.find((item) => item.projectId === projectIds[2]);
    record.reviewerNotes = "Mocked evidence is not live proof. No live Jev call was run or claimed. Remote code was not executed.";
  });
  expectFailure(result, /SkillRanker.*non-standard license.*OpenAI.*Anthropic.*adoption risk/i);
});

test("rejects scenario linkage drift and inferred X-case relations", async () => {
  const scenarioDrift = await runFixture((_datasets, scenario) => {
    [scenario.projectIds[0], scenario.projectIds[1]] = [scenario.projectIds[1], scenario.projectIds[0]];
  });
  expectFailure(scenarioDrift, /scenario project IDs must exactly match/);

  const inferredRelation = await runFixture((datasets) => {
    datasets["project-case-relations.json"].relations.push({
      projectId: projectIds[0],
      caseId: datasets["cases.json"].cases[0].id,
      type: "discussion",
      evidenceUrl: datasets["cases.json"].cases[0].canonicalUrl,
    });
  });
  expectFailure(inferredRelation, /Todo 15 projects must have no inferred X-case relations/);
});
