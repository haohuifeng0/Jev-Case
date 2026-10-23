#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function day(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value ?? "")) throw new Error(`${label} must use YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`${label} is invalid`);
  return parsed;
}

export async function createCatalogCadenceReport({ statePath, sourcePath, asOf }) {
  const state = JSON.parse(await readFile(statePath, "utf8"));
  const catalog = JSON.parse(await readFile(sourcePath, "utf8"));
  if (state.schemaVersion !== 1 || !Number.isInteger(state.cadenceDays) || state.cadenceDays < 1) throw new Error(`${statePath}: invalid cadence state`);
  if (catalog.schemaVersion !== 1 || catalog.source?.state !== "published") throw new Error(`${sourcePath}: catalog source must be published`);
  const ageDays = Math.floor((day(asOf, "as-of date").valueOf() - day(state.reviewedAt, "reviewedAt").valueOf()) / 86_400_000);
  if (ageDays < 0) throw new Error("catalog reviewedAt is after the report date");
  if (state.sourceCommit !== catalog.source.commit) throw new Error("catalog refresh state has a stale source commit");
  if (state.sourceSha256 !== catalog.source.sha256) throw new Error("catalog refresh state has a stale source checksum");
  if (ageDays > state.cadenceDays) throw new Error(`catalog refresh is stale: ${ageDays} days exceeds ${state.cadenceDays} days`);
  return { schemaVersion: 1, status: "PASS", asOf, reviewedAt: state.reviewedAt, ageDays, cadenceDays: state.cadenceDays, sourceCommit: state.sourceCommit, sourceSha256: state.sourceSha256 };
}

async function main() {
  const statePath = path.resolve(option("--state") ?? path.join(root, "docs/launch/catalog-refresh.json"));
  const sourcePath = path.resolve(option("--source") ?? path.join(root, "src/data/catalog-source.json"));
  const asOf = option("--as-of") ?? process.env.LAUNCH_AS_OF ?? new Date().toISOString().slice(0, 10);
  const output = option("--output");
  const report = await createCatalogCadenceReport({ statePath, sourcePath, asOf });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (output) await writeFile(path.resolve(output), serialized);
  process.stdout.write(serialized);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`catalog cadence check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
