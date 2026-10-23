#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const headers = [
  "week",
  "accounts_researched",
  "qualified_leads",
  "qualified_interviews",
  "outbound_attempts",
  "assessment_calls",
  "paid_assessments",
  "paid_pocs",
  "delivery_days_committed",
  "decision_note",
];

export function createKpiWorksheet() {
  const rows = Array.from({ length: 12 }, (_, index) => [index + 1, 0, 0, 0, 0, 0, 0, 0, 0, "SYNTHETIC_PRIVATE_WORKSHEET_ROW"]);
  return `${[headers, ...rows].map((row) => row.join(",")).join("\n")}\n`;
}

async function main() {
  const outputIndex = process.argv.indexOf("--output");
  const output = outputIndex === -1 ? undefined : process.argv[outputIndex + 1];
  const worksheet = createKpiWorksheet();
  if (output) await writeFile(path.resolve(output), worksheet);
  else process.stdout.write(worksheet);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`KPI worksheet generation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
