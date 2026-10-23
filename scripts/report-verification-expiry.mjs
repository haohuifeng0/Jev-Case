#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function parseDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value ?? "")) throw new Error(`${label} must use YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new Error(`${label} is not a real calendar date`);
  return date;
}

export async function createVerificationExpiryReport({ inputPath, asOf }) {
  const data = JSON.parse(await readFile(inputPath, "utf8"));
  if (data.schemaVersion !== 1 || !Array.isArray(data.verifications)) throw new Error(`${inputPath}: unsupported verification dataset`);
  const asOfDate = parseDate(asOf, "as-of date");
  const records = data.verifications.map((record) => {
    const reviewedAt = parseDate(record.reviewedAt, `${record.projectId}.reviewedAt`);
    const ageDays = Math.floor((asOfDate.valueOf() - reviewedAt.valueOf()) / 86_400_000);
    if (ageDays < 0) throw new Error(`${record.projectId}.reviewedAt is after the report date`);
    return { projectId: record.projectId, reviewedAt: record.reviewedAt, ageDays, expired: ageDays > 90 };
  });
  return {
    schemaVersion: 1,
    asOf,
    expiryDays: 90,
    total: records.length,
    expired: records.filter((record) => record.expired).length,
    records,
  };
}

export function assertNoExpiredRecords(report) {
  if (report.expired > 0) throw new Error(`${report.expired} verification record(s) exceed the 90-day review window`);
}

async function main() {
  const inputPath = path.resolve(option("--input") ?? path.join(root, "src/data/verifications.json"));
  const asOf = option("--as-of") ?? process.env.LAUNCH_AS_OF ?? new Date().toISOString().slice(0, 10);
  const output = option("--output");
  const report = await createVerificationExpiryReport({ inputPath, asOf });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (output) await writeFile(path.resolve(output), serialized);
  process.stdout.write(serialized);
  if (process.argv.includes("--fail-on-expired")) assertNoExpiredRecords(report);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`verification expiry report failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
