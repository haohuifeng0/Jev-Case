#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DataValidationError, parseDataBundle } from "../src/lib/data-loader.ts";
import { z } from "zod";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDirectory = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, "src/data");
const datasetNames = [
  "cases.json",
  "projects.json",
  "catalog-source.json",
  "project-case-relations.json",
  "verifications.json",
  "scenarios.json",
];

async function readDataset(name) {
  const file = path.join(dataDirectory, name);
  const text = await readFile(file, "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) throw new DataValidationError(name, "$", `malformed JSON: ${error.message}`);
    throw error;
  }
}

async function main() {
  const values = await Promise.all(datasetNames.map(readDataset));
  const raw = Object.fromEntries(datasetNames.map((name, index) => [name, values[index]]));
  const data = parseDataBundle(RawDataBundleSchema.parse(raw));
  console.log(JSON.stringify({
    status: "PASS",
    datasets: datasetNames.length,
    counts: {
      cases: data.cases.cases.length,
      aliases: data.cases.aliases.length,
      projects: data.projects.projects.length,
      relations: data.relations.relations.length,
      verifications: data.verifications.verifications.length,
      scenarios: data.scenarios.scenarios.length,
    },
  }));
}

const RawDataBundleSchema = z.strictObject({
  "cases.json": z.unknown(),
  "projects.json": z.unknown(),
  "catalog-source.json": z.unknown(),
  "project-case-relations.json": z.unknown(),
  "verifications.json": z.unknown(),
  "scenarios.json": z.unknown(),
});

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
