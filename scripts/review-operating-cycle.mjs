#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const expectedHeaders = [
  "week", "accounts_researched", "qualified_leads", "qualified_interviews", "outbound_attempts",
  "assessment_calls", "paid_assessments", "paid_pocs", "delivery_days_committed", "decision_note",
];

function parseWorksheet(csv) {
  const lines = csv.trim().split(/\r?\n/u);
  const headers = lines[0]?.split(",");
  if (JSON.stringify(headers) !== JSON.stringify(expectedHeaders)) throw new Error("KPI worksheet headers do not match the canonical template");
  if (lines.length !== 13) throw new Error("KPI worksheet must contain exactly 12 weekly rows");
  return lines.slice(1).map((line, index) => {
    const cells = line.split(",");
    if (cells.length !== expectedHeaders.length) throw new Error(`week ${index + 1} has the wrong column count`);
    const values = cells.slice(0, 9).map(Number);
    if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error(`week ${index + 1} contains an invalid non-negative integer`);
    if (values[0] !== index + 1) throw new Error(`week sequence is invalid at row ${index + 1}`);
    return values;
  });
}

export function reviewOperatingCycle(csv, reviewWeek) {
  if (reviewWeek !== 8 && reviewWeek !== 12) throw new Error("review week must be 8 or 12");
  const rows = parseWorksheet(csv).slice(0, reviewWeek);
  const totals = rows.reduce((sum, row) => sum.map((value, index) => value + (index === 0 ? 0 : row[index])), Array(9).fill(0));
  if (reviewWeek === 8 && totals[3] === 0) {
    return { reviewWeek, decision: "STOP_FEATURE_DEVELOPMENT", reason: "Qualified interviews are zero at the end of week 8.", totals };
  }
  if (reviewWeek === 8) return { reviewWeek, decision: "CONTINUE_WITH_REVIEW", reason: "Qualified interviews require human quality and capacity review.", totals };
  return { reviewWeek, decision: "WEEK_12_REVIEW_REQUIRED", reason: "Compare actuals with targets and choose continue, narrow, revise, pause, or stop.", totals };
}

async function main() {
  const inputIndex = process.argv.indexOf("--input");
  const weekIndex = process.argv.indexOf("--week");
  if (inputIndex === -1 || weekIndex === -1) throw new Error("usage: review-operating-cycle.mjs --input <weekly-kpi.csv> --week <8|12>");
  const csv = await readFile(path.resolve(process.argv[inputIndex + 1]), "utf8");
  const result = reviewOperatingCycle(csv, Number(process.argv[weekIndex + 1]));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`operating cycle review failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
