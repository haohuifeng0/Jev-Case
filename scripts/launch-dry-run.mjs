#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readdir, readFile, rename, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertCleanWorktree, resolveDeploymentConfig } from "./deployment-config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const output = path.resolve(process.env.LAUNCH_OUTPUT_DIR ?? path.join(root, "launch-artifacts"));
const temporaryOutput = `${output}.tmp-${process.pid}`;

export function runCommand(command, args, environment = process.env) {
  const timeout = Number(environment.LAUNCH_COMMAND_TIMEOUT_MS ?? "600000");
  if (!Number.isSafeInteger(timeout) || timeout < 1) throw new Error("LAUNCH_COMMAND_TIMEOUT_MS must be a positive integer");
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", env: environment, timeout, maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? files(target) : [target];
  }));
  return nested.flat().sort();
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function canonical(html) {
  return html.match(/<link rel="canonical" href="([^"]+)"/u)?.[1];
}

async function createManifest(config, asOf) {
  const artifactFiles = await files(dist);
  const fileRecords = await Promise.all(artifactFiles.map(async (file) => {
    const content = await readFile(file);
    return { path: path.relative(dist, file).replaceAll(path.sep, "/"), bytes: content.byteLength, sha256: sha256(content) };
  }));
  const htmlFiles = artifactFiles.filter((file) => file.endsWith(".html"));
  const html = await Promise.all(htmlFiles.map((file) => readFile(file, "utf8")));
  const canonicals = html.filter((content) => !/<meta name="robots" content="[^"]*noindex/u.test(content)).map(canonical);
  assert.equal(canonicals.every((value) => typeof value === "string"), true, "every indexable page must have a canonical URL");
  const sitemap = await readFile(path.join(dist, "sitemap.xml"), "utf8");
  const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]);
  assert.deepEqual(new Set(canonicals), new Set(sitemapUrls), "sitemap and canonical URL sets must be equal");
  assert.equal(canonicals.every((value) => value.startsWith(config.productionUrl)), true, "canonical URL uses the wrong deployment root");
  assert.equal(canonicals.some((value) => value.includes("/Jev-Case/Jev-Case/")), false, "canonical URL contains a doubled base path");
  const sourceCommit = runCommand("git", ["rev-parse", "HEAD"]);
  return { schemaVersion: 1, asOf, sourceCommit, siteUrl: config.siteUrl, basePath: config.basePath, productionUrl: config.productionUrl, routes: [...canonicals].sort(), sitemapUrls: [...sitemapUrls].sort(), files: fileRecords };
}

async function main() {
  const config = resolveDeploymentConfig(process.env, true);
  const asOf = process.env.LAUNCH_AS_OF;
  if (!asOf) throw new Error("LAUNCH_AS_OF is required for a deterministic launch dry run");
  if (process.env.LAUNCH_REQUIRE_CLEAN === "true") assertCleanWorktree(runCommand("git", ["status", "--porcelain"]));
  const buildEnvironment = { ...process.env, PUBLIC_SITE_URL: config.siteUrl, PUBLIC_BASE_PATH: config.basePath, PUBLIC_ASSESSMENT_FORM_URL: config.formUrl };
  for (const script of ["validate:business", "validate:data", "catalog:check", "check"]) runCommand("npm", ["run", script], buildEnvironment);
  await rm(dist, { recursive: true, force: true });
  runCommand("npm", ["run", "build"], buildEnvironment);
  runCommand("node", ["--test", "scripts/test-built-site.mjs"], { ...buildEnvironment, EXPECTED_SITE_URL: config.siteUrl, EXPECTED_BASE_PATH: config.basePath });
  await rm(temporaryOutput, { recursive: true, force: true });
  await mkdir(temporaryOutput, { recursive: true });
  runCommand("node", ["scripts/report-verification-expiry.mjs", "--as-of", asOf, "--output", path.join(temporaryOutput, "verification-expiry.json"), "--fail-on-expired"]);
  runCommand("node", ["scripts/check-catalog-refresh.mjs", "--as-of", asOf, "--output", path.join(temporaryOutput, "catalog-cadence.json")]);
  runCommand("node", ["scripts/generate-kpi-worksheet.mjs", "--output", path.join(temporaryOutput, "weekly-kpi.csv")]);
  const manifest = await createManifest(config, asOf);
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(path.join(temporaryOutput, "manifest.json"), serialized);
  await writeFile(path.join(temporaryOutput, "manifest.sha256"), `${sha256(serialized)}  manifest.json\n`);
  await rm(output, { recursive: true, force: true });
  await rename(temporaryOutput, output);
  console.log(JSON.stringify({ status: "PASS", routes: manifest.routes.length, files: manifest.files.length, manifestSha256: sha256(serialized), uploaded: false }));
}

export const cleanupTemporaryOutput = (directory) => rm(directory, { recursive: true, force: true });
const cleanup = () => cleanupTemporaryOutput(temporaryOutput);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => cleanup().finally(() => process.exit(1)));
  main().catch((error) => cleanup().finally(() => {
    console.error(`launch dry run failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }));
}
