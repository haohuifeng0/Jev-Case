#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DataValidationError, parseDataBundle } from "../src/lib/data-loader.ts";
import { getCasesForProject, getProjectsForCase } from "../src/lib/project-case-relations.ts";

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
const relationTypes = ["announcement", "demo", "discussion", "benchmark", "derivative"];

async function readDataset(name) {
  const text = await readFile(path.join(dataDirectory, name), "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new DataValidationError(name, "$", `malformed JSON: ${error.message}`);
    }
    throw error;
  }
}

function parseQuery(args) {
  if (args.length === 0) return null;
  if (args.length !== 2 || (args[0] !== "--project" && args[0] !== "--case")) {
    throw new DataValidationError("arguments", "$", "use --project <project-id> or --case <case-id>");
  }
  return { kind: args[0] === "--project" ? "project" : "case", id: args[1] };
}

async function main() {
  const values = await Promise.all(datasetNames.map(readDataset));
  const raw = Object.fromEntries(datasetNames.map((name, index) => [name, values[index]]));
  const data = parseDataBundle(raw);
  const byType = Object.fromEntries(relationTypes.map((type) => [
    type,
    data.relations.relations.filter((relation) => relation.type === type).length,
  ]));
  const query = parseQuery(process.argv.slice(2));
  const queryResult = query === null ? null : query.kind === "project"
    ? {
        kind: query.kind,
        id: query.id,
        caseIds: getCasesForProject(data.relations, data.cases, query.id).map((entry) => entry.case.id),
      }
    : {
        kind: query.kind,
        id: query.id,
        projectIds: getProjectsForCase(data.relations, data.projects, query.id).map((entry) => entry.project.id),
      };

  console.log(JSON.stringify({
    status: "PASS",
    relationCount: data.relations.relations.length,
    byType,
    confirmedOverlaps: data.relations.relations.map((relation) => relation.projectId),
    query: queryResult,
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
