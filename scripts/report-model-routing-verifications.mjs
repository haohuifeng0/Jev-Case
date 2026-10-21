#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DataValidationError, parseDataBundle } from "../src/lib/data-loader.ts";
import { deriveVerificationStatus } from "../src/lib/verification-rules.ts";
import { ScenarioContentSchema } from "../src/lib/scenario-schema.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDirectory = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, "src/data");
const modelRoutingFile = process.env.MODEL_ROUTING_FILE
  ? path.resolve(process.env.MODEL_ROUTING_FILE)
  : path.join(root, "src/content/scenarios/model-routing.json");
const datasetNames = [
  "cases.json",
  "projects.json",
  "catalog-source.json",
  "project-case-relations.json",
  "verifications.json",
  "scenarios.json",
];
const reviewedAt = "2026-10-20";
const expected = new Map([
  ["https://github.com/gargpratyush/jev-router", ["limited", "38da6b84ea01241bfc41fbddc0928d0f40a703f0"]],
  ["https://github.com/minilv/jev-auto-router", ["limited", "ff76b00fb18d0d64016a6a5d8f162875569a7894"]],
  ["https://github.com/protocol-lattice/harness-router", ["limited", "dedc72cbfa6aad73441934bc41fc6a75027f4101"]],
  ["https://github.com/ruban-24/switchboard", ["verified", "b9239e89625189474fca2a730cdb193c163d1a43"]],
  ["https://github.com/ruivalim/decision-router", ["limited", "0111cac6e4f1fa478d1d7476db5d80aceb2f790d"]],
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
  throw new DataValidationError("model-routing-verifications", "$", detail);
}

async function main() {
  const values = await Promise.all(datasetNames.map((name) => readJson(path.join(dataDirectory, name), name)));
  const raw = Object.fromEntries(datasetNames.map((name, index) => [name, values[index]]));
  const data = parseDataBundle(raw);
  const scenario = ScenarioContentSchema.parse(await readJson(modelRoutingFile, "model-routing.json"));
  const allRecords = data.verifications.verifications;
  const records = allRecords.filter((record) => expected.has(record.projectId));

  if (allRecords.length !== 20) fail(`expected exactly 20 total records, found ${allRecords.length}`);
  if (records.length !== expected.size) fail(`expected exactly ${expected.size} records, found ${records.length}`);
  const urls = new Set();
  for (const record of records) {
    const expectation = expected.get(record.projectId);
    if (expectation === undefined) fail(`unexpected project ${record.projectId}`);
    const [expectedStatus, expectedRevision] = expectation;
    if (record.reviewedAt !== reviewedAt) fail(`${record.projectId}: reviewedAt must be ${reviewedAt}`);
    if (record.status !== expectedStatus || deriveVerificationStatus(record.checks) !== expectedStatus) {
      fail(`${record.projectId}: status must derive to ${expectedStatus}`);
    }
    if (!/mock|synthetic|stub|fake/i.test(record.reviewerNotes) || !/no live Jev call was run or claimed/i.test(record.reviewerNotes)) {
      fail(`${record.projectId}: notes must disclose mocked or synthetic evidence and make no live-call claim`);
    }
    const evidence = Object.values(record.checks).flatMap((check) => check.evidence);
    if (evidence.some((item) => item.revision !== expectedRevision)) {
      fail(`${record.projectId}: all evidence must use revision ${expectedRevision}`);
    }
    for (const item of evidence) {
      if (urls.has(item.url)) fail(`duplicate evidence URL ${item.url}`);
      urls.add(item.url);
    }
  }

  const recordIds = records.map((record) => record.projectId);
  if (scenario.slug !== "model-routing" || scenario.projectIds.some((id, index) => recordIds[index] !== id)) {
    fail("scenario project IDs must exactly match the five verification records in order");
  }
  const projectIds = new Set(recordIds);
  const relatedCaseIds = [...new Set(data.relations.relations
    .filter((relation) => projectIds.has(relation.projectId))
    .map((relation) => relation.caseId))].sort();
  const statuses = { limited: 0, verified: 0, unverified: 0 };
  records.forEach((record) => { statuses[record.status] += 1; });

  console.log(JSON.stringify({
    status: "PASS",
    reviewedAt,
    recordCount: records.length,
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
