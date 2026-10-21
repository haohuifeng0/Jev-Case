#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DataValidationError, parseDataBundle } from "../src/lib/data-loader.ts";
import { deriveVerificationStatus } from "../src/lib/verification-rules.ts";
import { ScenarioContentSchema } from "../src/lib/scenario-schema.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDirectory = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, "src/data");
const scenarioFile = process.env.TOOL_SKILL_FILE
  ? path.resolve(process.env.TOOL_SKILL_FILE)
  : path.join(root, "src/content/scenarios/tool-skill-selection.json");
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
  ["https://github.com/godsboy/jev-agent-skill-router", ["verified", "e481a06ca37245cb579693d03e71d1c7282334db"]],
  ["https://github.com/safzanpirani/pi-jev-skill-picker", ["limited", "510042246789e2171f393506f0c84d70eac24c0a"]],
  ["https://github.com/dicklesworthstone/skillranker", ["limited", "ffff0c61652176fe0927e51c4981baa528e23486"]],
  ["https://github.com/parkavenue9639/jevloop", ["limited", "61e79949f36f2851d3c9de56ebda317913ec15ed"]],
  ["https://github.com/kerpopule/hermes-jev-skills", ["verified", "7b56de6627557e8bebb22f1538d75b37555a5623"]],
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
  throw new DataValidationError("tool-skill-verifications", "$", detail);
}

async function main() {
  const values = await Promise.all(datasetNames.map((name) => readJson(path.join(dataDirectory, name), name)));
  const raw = Object.fromEntries(datasetNames.map((name, index) => [name, values[index]]));
  const data = parseDataBundle(raw);
  const scenario = ScenarioContentSchema.parse(await readJson(scenarioFile, "tool-skill-selection.json"));
  const allRecords = data.verifications.verifications;
  const records = allRecords.filter((record) => expected.has(record.projectId));

  if (allRecords.length !== 20) fail(`expected exactly 20 total records, found ${allRecords.length}`);
  if (records.length !== expected.size) fail(`expected exactly ${expected.size} tool-skill records, found ${records.length}`);
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
    if (record.status !== expectedStatus || deriveVerificationStatus(record.checks) !== expectedStatus) {
      fail(`${record.projectId}: status must derive to ${expectedStatus}`);
    }
    if (!/stub|fake|mock|self-produced|self-reported/i.test(record.reviewerNotes)
      || !/No live Jev call was run or claimed/i.test(record.reviewerNotes)
      || !/Remote code was not executed/i.test(record.reviewerNotes)) {
      fail(`${record.projectId}: notes must disclose non-live evidence and remote non-execution`);
    }
    if (record.checks.directJevCall.evidence.some((item) => /README\.md/i.test(item.url))) {
      fail(`${record.projectId}: direct-call pass must cite source rather than README evidence`);
    }
    const evidence = Object.values(record.checks).flatMap((check) => check.evidence);
    if (evidence.some((item) => item.revision !== expectedRevision)) {
      fail(`${record.projectId}: all evidence must use revision ${expectedRevision}`);
    }
  }

  const skillRanker = records.find((record) => record.projectId === "https://github.com/dicklesworthstone/skillranker");
  if (skillRanker === undefined
    || !/non-standard license/i.test(skillRanker.reviewerNotes)
    || !/OpenAI\/Anthropic rider/i.test(skillRanker.reviewerNotes)
    || !/adoption risk/i.test(skillRanker.reviewerNotes)) {
    fail("SkillRanker must prominently disclose non-standard license, OpenAI/Anthropic rider, and adoption risk");
  }

  const recordIds = records.map((record) => record.projectId);
  if (scenario.slug !== "tool-skill-selection" || scenario.projectIds.some((id, index) => recordIds[index] !== id)) {
    fail("scenario project IDs must exactly match the five verification records in order");
  }
  const projectIds = new Set(recordIds);
  const relatedCaseIds = [...new Set(data.relations.relations
    .filter((relation) => projectIds.has(relation.projectId))
    .map((relation) => relation.caseId))].sort();
  if (relatedCaseIds.length !== 0) fail("Todo 15 projects must have no inferred X-case relations");
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
