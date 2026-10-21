#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DataValidationError, parseDataBundle } from "../src/lib/data-loader.ts";
import { deriveVerificationStatus } from "../src/lib/verification-rules.ts";
import { ScenarioContentSchema } from "../src/lib/scenario-schema.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDirectory = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, "src/data");
const scenarioFile = process.env.OUTPUT_VERIFICATION_FILE
  ? path.resolve(process.env.OUTPUT_VERIFICATION_FILE)
  : path.join(root, "src/content/scenarios/output-verification.json");
const datasetNames = [
  "cases.json",
  "projects.json",
  "catalog-source.json",
  "project-case-relations.json",
  "verifications.json",
  "scenarios.json",
];
const reviewedAt = "2026-10-21";
const expected = new Map([
  ["https://github.com/different-ai/openwork", ["limited", "df9ef2cc33e46b0f9006c51c3c8bf09720921ba5"]],
  ["https://github.com/thruwire/foreman", ["verified", "c3142ef636617f32f772140125aa310d81ceece9"]],
  ["https://github.com/tech-byte-frontier/jevgate", ["verified", "f061e8b9d9fc38eb167676257283ce0943b440fc"]],
  ["https://blink.review", ["unverified", null]],
  ["https://github.com/egma-ai/jev-code-reviewer", ["verified", "5bc56f2e8116af8888f98e4c0f1002956011f204"]],
]);
const requiredClaims = new Map([
  ["https://github.com/different-ai/openwork", /closed-set verification-plan compiler.*deterministic replay.*does not independently judge actual application output.*not an automatic merge or completion gate/i],
  ["https://github.com/thruwire/foreman", /supervises completion signals.*not proof that an output is correct.*does not require human sign-off/i],
  ["https://github.com/tech-byte-frontier/jevgate", /code-review gate.*not equivalent to human review or a correctness guarantee/i],
  ["https://blink.review", /hosted CLI in public beta.*No official immutable public source repository, Git revision, or public source license.*unrelated ellipsis-dev\/blink.*binary checksum is not fabricated as a commit/i],
  ["https://github.com/egma-ai/jev-code-reviewer", /prioritizes code-review attention.*does not prove code correctness, business acceptance, or task completion/i],
]);

async function readJson(file, dataset) {
  const text = await readFile(file, "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) throw new DataValidationError(dataset, "$", `malformed JSON: ${error.message}`);
    throw error;
  }
}

function fail(detail) {
  throw new DataValidationError("output-verifications", "$", detail);
}

async function main() {
  const values = await Promise.all(datasetNames.map((name) => readJson(path.join(dataDirectory, name), name)));
  const raw = Object.fromEntries(datasetNames.map((name, index) => [name, values[index]]));
  const data = parseDataBundle(raw);
  const scenario = ScenarioContentSchema.parse(await readJson(scenarioFile, "output-verification.json"));
  const allRecords = data.verifications.verifications;
  const records = allRecords.filter((record) => expected.has(record.projectId));

  if (allRecords.length !== 20) fail(`expected exactly 20 total records, found ${allRecords.length}`);
  if (records.length !== expected.size) fail(`expected exactly ${expected.size} output-verification records, found ${records.length}`);
  const urls = new Set();
  for (const record of allRecords) {
    for (const item of Object.values(record.checks).flatMap((check) => check.evidence)) {
      if (urls.has(item.url)) fail(`duplicate evidence URL ${item.url}`);
      urls.add(item.url);
    }
  }

  for (const record of records) {
    const expectation = expected.get(record.projectId);
    if (expectation === undefined) fail(`unexpected project ${record.projectId}`);
    const [expectedStatus, expectedRevision] = expectation;
    if (record.reviewedAt !== reviewedAt) fail(`${record.projectId}: reviewedAt must be ${reviewedAt}`);
    if (record.status !== expectedStatus || record.revision !== expectedRevision) {
      fail(`${record.projectId}: expected ${expectedStatus} at revision ${expectedRevision}`);
    }
    if (record.sourceAvailability === "public-source" && deriveVerificationStatus(record.checks) !== expectedStatus) {
      fail(`${record.projectId}: status must derive to ${expectedStatus}`);
    }
    const claim = requiredClaims.get(record.projectId);
    if (claim === undefined || !claim.test(record.reviewerNotes)) fail(`${record.projectId}: missing required scope limitation`);
    if (!/No live Jev call was run or claimed/i.test(record.reviewerNotes)
      || !/Remote code was not executed/i.test(record.reviewerNotes)) {
      fail(`${record.projectId}: notes must make no live-call claim and disclose remote non-execution`);
    }
  }

  const blink = records.find((record) => record.projectId === "https://blink.review");
  if (blink === undefined || blink.sourceAvailability !== "no-public-source" || blink.revision !== null
    || Object.values(blink.checks).some((check) => check.evidence.length !== 0)) {
    fail("Blink must use the no-public-source path with null revision and zero immutable evidence");
  }
  if (data.projects.projects.some((project) => /ellipsis-dev\/blink/i.test(project.id))) {
    fail("Blink source resolution must not substitute ellipsis-dev/blink");
  }
  for (const record of records.filter((item) => item.sourceAvailability === "public-source")) {
    if (record.checks.directJevCall.evidence.some((item) => /README\.md/i.test(item.url))) {
      fail(`${record.projectId}: direct-call pass must cite source rather than README evidence`);
    }
  }

  const recordIds = records.map((record) => record.projectId);
  if (scenario.slug !== "output-verification" || scenario.projectIds.some((id, index) => recordIds[index] !== id)) {
    fail("scenario project IDs must exactly match the five output-verification records in order");
  }
  if (!/三项已验证、一项有限验证和一项未验证/.test(scenario.verificationCaveat)
    || !/闭源公开测试版/.test(scenario.verificationCaveat)
    || !/未执行远程代码/.test(scenario.verificationCaveat)) {
    fail("scenario caveat must disclose statuses, Blink's closed-source public beta, and remote non-execution");
  }
  const projectIds = new Set(recordIds);
  const relatedCaseIds = [...new Set(data.relations.relations
    .filter((relation) => projectIds.has(relation.projectId))
    .map((relation) => relation.caseId))].sort();
  if (relatedCaseIds.length !== 0) fail("output-verification projects must have no inferred X-case relations");
  const statuses = { limited: 0, verified: 0, unverified: 0 };
  records.forEach((record) => { statuses[record.status] += 1; });

  console.log(JSON.stringify({
    status: "PASS",
    reviewedAt,
    totalRecordCount: allRecords.length,
    recordCount: records.length,
    projectIds: recordIds,
    statuses,
    evidenceUrlCount: urls.size,
    scenarioLinkedRecords: scenario.projectIds.length,
    relatedCaseIds,
    liveCallsClaimed: 0,
  }));
}

try {
  await main();
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
