#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { downloadCatalog } from "./catalog-download.mjs";
import { catalogRawUrl, catalogRemote, catalogRepository } from "./catalog-source-config.mjs";
import { bindProcessInterrupts, replaceCatalogPair } from "./catalog-transaction.mjs";
import { CatalogSourceSchema, ProjectCatalogSchema } from "../src/lib/data-schemas.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const commitPattern = /^[0-9a-f]{40}$/;
const checksumPattern = /^[0-9a-f]{64}$/;

class ImportError extends Error {
  constructor(message) {
    super(message);
    this.name = "ImportError";
  }
}

function parseArguments(argv) {
  const options = { check: false, finalize: false, timeoutMs: 15_000 };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check" || argument === "--finalize") {
      options[argument.slice(2)] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new ImportError(`${argument} requires a value`);
    if (argument === "--input") options.input = value;
    else if (argument === "--url") options.url = value;
    else if (argument === "--commit") options.commit = value;
    else if (argument === "--base-commit") options.baseCommit = value;
    else if (argument === "--sha256") options.checksum = value;
    else if (argument === "--output-dir") options.outputDirectory = value;
    else if (argument === "--upstream-repo") options.upstreamRepository = value;
    else if (argument === "--timeout-ms") {
      options.timeoutMs = Number(value);
      if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1) {
        throw new ImportError("--timeout-ms must be a positive integer");
      }
    } else throw new ImportError(`unknown option ${argument}`);
    index += 1;
  }
  return options;
}

function parseJson(bytes, dataset) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) throw new ImportError(`${dataset}: malformed JSON: ${error.message}`);
    throw error;
  }
}

function parseSchema(schema, value, dataset) {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue?.path.length ? issue.path.join(".") : "$";
  throw new ImportError(`${dataset}: ${field}: ${issue?.message ?? "invalid data"}`);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readPair(outputDirectory) {
  const projectsPath = path.join(outputDirectory, "projects.json");
  const sourcePath = path.join(outputDirectory, "catalog-source.json");
  const [projectsBytes, sourceBytes] = await Promise.all([readFile(projectsPath), readFile(sourcePath)]);
  const projects = parseSchema(ProjectCatalogSchema, parseJson(projectsBytes, "projects.json"), "projects.json");
  const sourceDocument = parseSchema(CatalogSourceSchema, parseJson(sourceBytes, "catalog-source.json"), "catalog-source.json");
  if (sourceDocument.source === null) throw new ImportError("catalog-source.json: source: catalog is not pinned");
  const actual = digest(projectsBytes);
  if (actual !== sourceDocument.source.sha256) {
    throw new ImportError(`projects.json checksum mismatch: expected ${sourceDocument.source.sha256}, received ${actual}`);
  }
  return { projectsBytes, projects, sourceDocument };
}

function git(upstreamRepository, args) {
  const result = spawnSync("git", ["-C", path.resolve(upstreamRepository), ...args], { encoding: null, maxBuffer: 16 * 1024 * 1024 });
  return result;
}

function committedArtifact(upstreamRepository, commit) {
  const exists = git(upstreamRepository, ["cat-file", "-e", `${commit}^{commit}`]);
  if (exists.status !== 0) throw new ImportError(`commit ${commit} does not exist in supplied upstream repository`);
  const artifact = git(upstreamRepository, ["show", `${commit}:catalog.json`]);
  if (artifact.status !== 0) throw new ImportError(`commit ${commit} does not contain catalog.json`);
  return artifact.stdout;
}

function verifyUpstreamRemote(upstreamRepository) {
  const remote = git(upstreamRepository, ["remote", "get-url", "origin"]);
  const actual = remote.status === 0 ? remote.stdout.toString("utf8").trim() : "";
  if (actual !== catalogRemote) {
    throw new ImportError(`upstream remote mismatch: expected ${catalogRemote}, received ${actual || "none"}`);
  }
}

async function verifyProvenance(source, upstreamRepository, projectsBytes) {
  if (source.repository !== catalogRepository) {
    throw new ImportError(`catalog-source.json: source.repository: expected ${catalogRepository}`);
  }
  if (upstreamRepository !== undefined) verifyUpstreamRemote(upstreamRepository);
  if (source.state === "published") {
    if (source.rawUrl !== catalogRawUrl(source.commit)) throw new ImportError("published provenance has an unexpected raw URL");
    if (upstreamRepository === undefined) return;
    if (digest(committedArtifact(upstreamRepository, source.commit)) !== digest(projectsBytes)) {
      throw new ImportError("published provenance mismatch: commit artifact differs from projects.json");
    }
    return;
  }
  if (upstreamRepository === undefined) return;
  const head = git(upstreamRepository, ["rev-parse", "HEAD"]);
  if (head.status !== 0 || head.stdout.toString("utf8").trim() !== source.baseCommit) {
    throw new ImportError("working-tree provenance mismatch: base commit differs from upstream HEAD");
  }
  const upstreamBytes = await readFile(path.join(path.resolve(upstreamRepository), "catalog.json"));
  if (digest(upstreamBytes) !== digest(projectsBytes)) {
    throw new ImportError("working-tree provenance mismatch: local catalog differs from projects.json");
  }
  const status = git(upstreamRepository, ["status", "--porcelain", "--", "catalog.json"]);
  if (status.status !== 0 || status.stdout.toString("utf8").trim() === "") {
    throw new ImportError("working-tree provenance mismatch: catalog.json is not an unpublished working-tree artifact");
  }
}

async function checkCommitted(options, outputDirectory) {
  const pair = await readPair(outputDirectory);
  await verifyProvenance(pair.sourceDocument.source, options.upstreamRepository, pair.projectsBytes);
  const source = pair.sourceDocument.source;
  console.log(JSON.stringify({
    status: source.state === "published" ? "CURRENT" : "UNPUBLISHED",
    projects: pair.projects.projects.length,
    commit: source.state === "published" ? source.commit : source.baseCommit,
    sha256: source.sha256,
  }));
}

async function importCatalog(options, outputDirectory, signal) {
  if (!checksumPattern.test(options.checksum ?? "")) throw new ImportError("--sha256 must be exactly 64 lowercase hexadecimal characters");
  if ((options.input === undefined) === (options.url === undefined)) {
    throw new ImportError("provide exactly one of --input or --url");
  }
  const isPublished = options.url !== undefined;
  const reference = isPublished ? options.commit : options.baseCommit;
  const optionName = isPublished ? "--commit" : "--base-commit";
  if (!commitPattern.test(reference ?? "")) throw new ImportError(`${optionName} must be exactly 40 lowercase hexadecimal characters`);
  if (isPublished && options.url !== catalogRawUrl(reference)) {
    throw new ImportError(`--url must be the exact raw GitHub commit URL ${catalogRawUrl(reference)}`);
  }
  const bytes = options.input === undefined
    ? await downloadCatalog({ url: options.url, timeoutMs: options.timeoutMs, signal })
    : await readFile(path.resolve(options.input), { signal });
  const actual = digest(bytes);
  if (actual !== options.checksum) throw new ImportError(`catalog checksum mismatch: expected ${options.checksum}, received ${actual}`);
  const catalog = parseSchema(ProjectCatalogSchema, parseJson(bytes, "catalog.json"), "catalog.json");
  const projectsBytes = bytes;
  const source = isPublished
    ? { schemaVersion: 1, source: { state: "published", repository: catalogRepository, commit: reference, sha256: actual, rawUrl: catalogRawUrl(reference) } }
    : { schemaVersion: 1, source: { state: "working-tree", repository: catalogRepository, baseCommit: reference, sha256: actual } };
  const sourceDocument = parseSchema(CatalogSourceSchema, source, "catalog-source.json");
  if (options.upstreamRepository !== undefined) await verifyProvenance(sourceDocument.source, options.upstreamRepository, projectsBytes);
  await replaceCatalogPair({ outputDirectory, projectsBytes, sourceBytes: Buffer.from(`${JSON.stringify(sourceDocument, null, 2)}\n`), signal });
  console.log(JSON.stringify({ status: "IMPORTED", provenance: sourceDocument.source.state, projects: catalog.projects.length, commit: reference, sha256: actual }));
}

async function finalizeCatalog(options, outputDirectory, signal) {
  if (!commitPattern.test(options.commit ?? "")) throw new ImportError("--commit must be exactly 40 lowercase hexadecimal characters");
  if (options.upstreamRepository === undefined) throw new ImportError("--finalize requires --upstream-repo");
  const pair = await readPair(outputDirectory);
  verifyUpstreamRemote(options.upstreamRepository);
  const artifact = committedArtifact(options.upstreamRepository, options.commit);
  if (digest(artifact) !== digest(pair.projectsBytes)) {
    throw new ImportError("published provenance mismatch: commit artifact differs from projects.json");
  }
  const document = parseSchema(CatalogSourceSchema, {
    schemaVersion: 1,
    source: {
      state: "published",
      repository: catalogRepository,
      commit: options.commit,
      sha256: digest(pair.projectsBytes),
      rawUrl: catalogRawUrl(options.commit),
    },
  }, "catalog-source.json");
  await replaceCatalogPair({
    outputDirectory,
    projectsBytes: pair.projectsBytes,
    sourceBytes: Buffer.from(`${JSON.stringify(document, null, 2)}\n`),
    signal,
  });
  console.log(JSON.stringify({ status: "FINALIZED", projects: pair.projects.projects.length, commit: options.commit, sha256: document.source.sha256 }));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const outputDirectory = path.resolve(options.outputDirectory ?? path.join(root, "src/data"));
  if (options.check && options.finalize) throw new ImportError("choose exactly one mode");
  const controller = new AbortController();
  const unbindInterrupts = bindProcessInterrupts(controller);
  try {
    if (options.check) {
      if (options.input !== undefined || options.url !== undefined || options.commit !== undefined || options.baseCommit !== undefined || options.checksum !== undefined) {
        throw new ImportError("--check is offline and does not accept input, URL, commit, base commit, or checksum options");
      }
      await checkCommitted(options, outputDirectory);
      return;
    }
    if (options.finalize) {
      await finalizeCatalog(options, outputDirectory, controller.signal);
      return;
    }
    await importCatalog(options, outputDirectory, controller.signal);
  } finally {
    unbindInterrupts();
  }
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
