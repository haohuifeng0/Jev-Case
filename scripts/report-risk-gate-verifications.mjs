#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DataValidationError, parseDataBundle } from "../src/lib/data-loader.ts";
import { deriveVerificationStatus } from "../src/lib/verification-rules.ts";
import { ScenarioContentSchema } from "../src/lib/scenario-schema.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDirectory = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, "src/data");
const scenarioFile = process.env.RISK_GATES_FILE
  ? path.resolve(process.env.RISK_GATES_FILE)
  : path.join(root, "src/content/scenarios/risk-gates.json");
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
  ["https://github.com/y0usaf/pi-jev", ["limited", "cbbc35dacee9337e575f7de913ef2757ad64a198"]],
  ["https://github.com/leepokai/jev-guard", ["limited", "cda06c49ceaac207904142ec92bfab793bbd18b1"]],
  ["https://github.com/veridicaltech/edward", ["limited", "af5471e2d62d30887ca309e2d76d1ac527317c61"]],
  ["https://github.com/qkal/canny", ["verified", "f2c5e53779445d60dc4a09d2dbced2308fccb820"]],
  ["https://github.com/ckorhonen/jev-lint", ["limited", "a89a6d9d8d2e75fac456bf6a7aab1f4068689124"]],
]);
const requiredCaveats = new Map([
  ["https://github.com/y0usaf/pi-jev", [/shadow.*fail open.*not a permission or security boundary/i, "pi-jev notes must include shadow, fail-open, and not a permission or security boundary"]],
  ["https://github.com/leepokai/jev-guard", [/default is fail-open.*post-result scanning remains fail-open.*not a sandbox or security boundary/i, "jev-guard notes must include both fail-open paths and reject sandbox or security-boundary claims"]],
  ["https://github.com/veridicaltech/edward", [/human approval path is narrower.*not a universal pre-action, fail-closed, or human-approval gate.*not a permission or security boundary/i, "Edward notes must limit human approval and reject universal fail-closed or security-boundary claims"]],
  ["https://github.com/qkal/canny", [/VERIFIED UNDER THIS RUBRIC ONLY.*mutable local JSON, not immutable evidence.*fail open.*not a sandbox, permission control, or security boundary/i, "Canny notes must state mutable local JSON, not immutable evidence, fail-open behavior, and not a security boundary"]],
  ["https://github.com/ckorhonen/jev-lint", [/fail-open paths.*two-denial bypass.*not a mandatory security, compliance, permission, or edit-enforcement boundary/i, "jev-lint notes must include fail-open and bypass behavior and reject enforcement-boundary claims"]],
]);
const requiredEvidencePaths = new Map([
  ["https://github.com/y0usaf/pi-jev", ["/src/client.ts", "/src/gate.ts", "/src/index.ts"]],
  ["https://github.com/leepokai/jev-guard", ["/src/jev.js", "/src/guard.js", "/SECURITY.md", "/src/opencode.js"]],
  ["https://github.com/veridicaltech/edward", ["/edward/backends.py", "/edward/engine.py", "/edward/approval.py", "/edward/cli.py"]],
  ["https://github.com/qkal/canny", ["/src/jev.ts", "/src/hook.ts", "/src/cli.ts", "/README.md"]],
  ["https://github.com/ckorhonen/jev-lint", ["/src/lint.ts", "/src/jev.ts", "/src/hook.ts", "/src/checks.ts"]],
]);
const scenarioCaveat = /四项为有限验证.*Canny.*\/commit\/<sha>\/checks.*本地 JSON 账本不是不可变证据或证明.*不是沙箱、权限控制或安全边界/;

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
  throw new DataValidationError("risk-gate-verifications", "$", detail);
}

async function main() {
  const values = await Promise.all(datasetNames.map((name) => readJson(path.join(dataDirectory, name), name)));
  const raw = Object.fromEntries(datasetNames.map((name, index) => [name, values[index]]));
  const data = parseDataBundle(raw);
  const scenario = ScenarioContentSchema.parse(await readJson(scenarioFile, "risk-gates.json"));
  const allRecords = data.verifications.verifications;
  const records = allRecords.filter((record) => expected.has(record.projectId));

  if (allRecords.length !== 20) fail(`expected exactly 20 total records, found ${allRecords.length}`);
  if (records.length !== expected.size) fail(`expected exactly ${expected.size} risk-gate records, found ${records.length}`);
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
    const caveat = requiredCaveats.get(record.projectId);
    if (caveat === undefined || !caveat[0].test(record.reviewerNotes)) {
      fail(caveat?.[1] ?? `${record.projectId}: missing fail-behavior caveat requirements`);
    }
    if (!/No live Jev call was run or claimed/i.test(record.reviewerNotes)
      || !/Remote code was not executed/i.test(record.reviewerNotes)) {
      fail(`${record.projectId}: notes must make no live-call claim and disclose remote non-execution`);
    }
    if (record.checks.directJevCall.evidence.some((item) => /README\.md/i.test(item.url))) {
      fail(`${record.projectId}: direct-call pass must cite source rather than README evidence`);
    }
    const evidence = Object.values(record.checks).flatMap((check) => check.evidence);
    if (evidence.some((item) => item.revision !== expectedRevision)) {
      fail(`${record.projectId}: all evidence must use revision ${expectedRevision}`);
    }
    const requiredPaths = requiredEvidencePaths.get(record.projectId) ?? [];
    for (const requiredPath of requiredPaths) {
      if (!evidence.some((item) => new URL(item.url).pathname.endsWith(requiredPath))) {
        fail(`${record.projectId}: caveat requires immutable evidence from ${requiredPath}`);
      }
    }
  }

  const recordIds = records.map((record) => record.projectId);
  if (scenario.slug !== "risk-gates" || scenario.projectIds.some((id, index) => recordIds[index] !== id)) {
    fail("scenario project IDs must exactly match the five verification records in order");
  }
  if (!scenarioCaveat.test(scenario.verificationCaveat)) {
    fail("scenario caveat must state four limited records and Canny's checks-only rubric, mutable ledger, and security-boundary limits");
  }
  const projectIds = new Set(recordIds);
  const relatedCaseIds = [...new Set(data.relations.relations
    .filter((relation) => projectIds.has(relation.projectId))
    .map((relation) => relation.caseId))].sort();
  if (relatedCaseIds.length !== 0) fail("risk-gate projects must have no inferred X-case relations");
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
