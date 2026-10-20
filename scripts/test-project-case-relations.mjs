#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { RelationsSchema } from "../src/lib/data-schemas.ts";
import { parseDataBundle } from "../src/lib/data-loader.ts";
import { getCasesForProject, getProjectsForCase } from "../src/lib/project-case-relations.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const report = path.join(root, "scripts/report-project-case-relations.mjs");
const datasetNames = [
  "cases.json",
  "projects.json",
  "catalog-source.json",
  "project-case-relations.json",
  "verifications.json",
  "scenarios.json",
];
const droneProjectId = "https://github.com/romanslack/jev-drone";
const droneCaseId = "2100335978229690683";
const compactionProjectId = "https://github.com/tamaratran/fast-jev-compaction";
const compactionCaseId = "2100913118528393596";

const relation = {
  projectId: "https://github.com/example/project",
  caseId: "case-1",
  type: "demo",
  evidenceUrl: "https://x.com/example/status/1",
};

async function loadCommittedData() {
  const entries = await Promise.all(datasetNames.map(async (name) => {
    const text = await readFile(path.join(root, "src/data", name), "utf8");
    return [name, JSON.parse(text)];
  }));
  return Object.fromEntries(entries);
}

async function runReportFixture(mutate) {
  const directory = await mkdtemp(path.join(tmpdir(), "jev-relations-"));
  try {
    const datasets = await loadCommittedData();
    mutate(datasets);
    await Promise.all(datasetNames.map((name) => {
      const value = datasets[name];
      return writeFile(path.join(directory, name), typeof value === "string" ? value : `${JSON.stringify(value)}\n`);
    }));
    return spawnSync(process.execPath, ["--experimental-strip-types", report], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, DATA_DIR: directory },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function expectReportFailure(result, pattern) {
  assert.notEqual(result.status, 0, `fixture unexpectedly passed: ${result.stdout}`);
  assert.match(`${result.stdout}\n${result.stderr}`, pattern);
  assert.doesNotMatch(result.stdout, /"status":"PASS"/);
}

test("rejects duplicate project, case, and type triples", () => {
  const result = RelationsSchema.safeParse({
    schemaVersion: 1,
    relations: [
      relation,
      { ...relation, evidenceUrl: "https://x.com/example/status/2" },
    ],
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.deepEqual(result.error.issues[0]?.path, ["relations", 1]);
    assert.match(result.error.issues[0]?.message ?? "", /duplicate relation triple/);
  }
});

test("resolves committed relations from project to case in stable order", async () => {
  const data = parseDataBundle(await loadCommittedData());

  assert.deepEqual(
    getCasesForProject(data.relations, data.cases, droneProjectId).map((entry) => entry.case.id),
    [droneCaseId],
  );
  assert.deepEqual(
    getCasesForProject(data.relations, data.cases, compactionProjectId).map((entry) => entry.case.id),
    [compactionCaseId],
  );
});

test("resolves committed relations from case to project in stable order", async () => {
  const data = parseDataBundle(await loadCommittedData());

  assert.deepEqual(
    getProjectsForCase(data.relations, data.projects, droneCaseId).map((entry) => entry.project.id),
    [droneProjectId],
  );
  assert.deepEqual(
    getProjectsForCase(data.relations, data.projects, compactionCaseId).map((entry) => entry.project.id),
    [compactionProjectId],
  );
});

test("returns empty lookup results when no relation matches", async () => {
  const data = parseDataBundle(await loadCommittedData());

  assert.deepEqual(getCasesForProject(data.relations, data.cases, "https://github.com/missing/project"), []);
  assert.deepEqual(getProjectsForCase(data.relations, data.projects, "missing-case"), []);
});

test("report prints deterministic counts and both confirmed overlaps", () => {
  const first = spawnSync(process.execPath, ["--experimental-strip-types", report], { cwd: root, encoding: "utf8" });
  const second = spawnSync(process.execPath, ["--experimental-strip-types", report], { cwd: root, encoding: "utf8" });

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);
  const output = JSON.parse(first.stdout);
  assert.equal(output.relationCount, 2);
  assert.deepEqual(output.byType, { announcement: 0, demo: 2, discussion: 0, benchmark: 0, derivative: 0 });
  assert.deepEqual(output.confirmedOverlaps, [droneProjectId, compactionProjectId]);
});

test("report queries both directions", () => {
  const byProject = spawnSync(
    process.execPath,
    ["--experimental-strip-types", report, "--project", droneProjectId],
    { cwd: root, encoding: "utf8" },
  );
  const byCase = spawnSync(
    process.execPath,
    ["--experimental-strip-types", report, "--case", compactionCaseId],
    { cwd: root, encoding: "utf8" },
  );

  assert.deepEqual(JSON.parse(byProject.stdout).query.caseIds, [droneCaseId]);
  assert.deepEqual(JSON.parse(byCase.stdout).query.projectIds, [compactionProjectId]);
});

test("report rejects dangling and stale project IDs without misleading PASS output", async () => {
  const dangling = await runReportFixture((datasets) => {
    datasets["project-case-relations.json"].relations[0].projectId = "https://github.com/missing/project";
  });
  expectReportFailure(dangling, /unknown project ID https:\/\/github\.com\/missing\/project/);

  const stale = await runReportFixture((datasets) => {
    datasets["projects.json"].projects = datasets["projects.json"].projects.filter(
      (project) => project.id !== droneProjectId,
    );
  });
  expectReportFailure(stale, new RegExp(`unknown project ID ${droneProjectId}`));
});

test("report rejects dangling and stale case IDs without misleading PASS output", async () => {
  const dangling = await runReportFixture((datasets) => {
    datasets["project-case-relations.json"].relations[0].caseId = "missing-case";
  });
  expectReportFailure(dangling, /unknown case ID missing-case/);

  const stale = await runReportFixture((datasets) => {
    datasets["cases.json"].cases = datasets["cases.json"].cases.filter((item) => item.id !== droneCaseId);
  });
  expectReportFailure(stale, new RegExp(`unknown case ID ${droneCaseId}`));
});

test("report rejects duplicate triples, non-HTTPS evidence, and unsupported types", async () => {
  const duplicate = await runReportFixture((datasets) => {
    datasets["project-case-relations.json"].relations.push({
      ...datasets["project-case-relations.json"].relations[0],
      evidenceUrl: "https://x.com/example/status/2",
    });
  });
  expectReportFailure(duplicate, /duplicate relation triple/);

  const insecure = await runReportFixture((datasets) => {
    datasets["project-case-relations.json"].relations[0].evidenceUrl = "http://x.com/example/status/1";
  });
  expectReportFailure(insecure, /relations\.0\.evidenceUrl/);

  const unsupported = await runReportFixture((datasets) => {
    datasets["project-case-relations.json"].relations[0].type = "reference";
  });
  expectReportFailure(unsupported, /relations\.0\.type/);
});

test("report rejects malformed relation JSON without misleading PASS output", async () => {
  const result = await runReportFixture((datasets) => {
    datasets["project-case-relations.json"] = "{not-json\n";
  });

  expectReportFailure(result, /project-case-relations\.json: malformed JSON/);
});
