#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const importer = path.join(root, "scripts/import-awesome-jev.mjs");
const commit = "d45c6cbbdc8c929e95f89011ef1868cd1d14877a";
const repository = "https://github.com/haohuifeng0/awesome-jev";

const catalog = {
  schemaVersion: 1,
  projects: [{
    id: "https://github.com/example/project",
    slug: "example-project",
    name: "Example Project",
    url: "https://github.com/example/project",
    category: { key: "agent-decisions", title: "Agent Decisions" },
    summary: "Example summary",
    tags: { agent: "multi", type: "plugin" },
    source: { file: "categories/agent-decisions.md", line: 1 },
    github: { owner: "example", repo: "project" },
  }],
};

const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "jev-catalog-import-"));
  const input = path.join(directory, "catalog.json");
  const output = path.join(directory, "output");
  const bytes = serialize(catalog);
  await writeFile(input, bytes);
  return { directory, input, output, bytes, checksum: sha256(bytes) };
}

function run(args) {
  return spawnSync(process.execPath, ["--experimental-strip-types", importer, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

function expectFailure(result, pattern) {
  assert.notEqual(result.status, 0, `command unexpectedly passed: ${result.stdout}`);
  assert.match(`${result.stdout}\n${result.stderr}`, pattern);
  assert.doesNotMatch(result.stdout, /"status":"IMPORTED"/);
}

test("imports a local pinned catalog with byte-identical repeated output", async () => {
  const current = await fixture();
  try {
    const args = ["--input", current.input, "--base-commit", commit, "--sha256", current.checksum, "--output-dir", current.output];

    const first = run(args);
    assert.equal(first.status, 0, first.stderr);
    const firstProjects = await readFile(path.join(current.output, "projects.json"));
    const firstSource = await readFile(path.join(current.output, "catalog-source.json"));

    const second = run(args);
    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(await readFile(path.join(current.output, "projects.json")), firstProjects);
    assert.deepEqual(await readFile(path.join(current.output, "catalog-source.json")), firstSource);
    assert.deepEqual(JSON.parse(firstSource), {
      schemaVersion: 1,
      source: { state: "working-tree", repository, baseCommit: commit, sha256: current.checksum },
    });
  } finally {
    await rm(current.directory, { recursive: true, force: true });
  }
});

test("rejects a checksum mismatch without changing either output", async () => {
  const current = await fixture();
  try {
    await writeFile(path.join(current.directory, "projects.json"), "projects-before\n");
    await writeFile(path.join(current.directory, "catalog-source.json"), "source-before\n");

    const result = run(["--input", current.input, "--base-commit", commit, "--sha256", "0".repeat(64), "--output-dir", current.directory]);

    expectFailure(result, /checksum mismatch/i);
    assert.equal(await readFile(path.join(current.directory, "projects.json"), "utf8"), "projects-before\n");
    assert.equal(await readFile(path.join(current.directory, "catalog-source.json"), "utf8"), "source-before\n");
    assert.deepEqual((await readdir(current.directory)).filter((name) => name.includes(".tmp-")), []);
  } finally {
    await rm(current.directory, { recursive: true, force: true });
  }
});

test("rejects an unsupported catalog schema without creating output", async () => {
  const current = await fixture();
  try {
    const bytes = serialize({ ...catalog, schemaVersion: 2 });
    await writeFile(current.input, bytes);

    const result = run(["--input", current.input, "--base-commit", commit, "--sha256", sha256(bytes), "--output-dir", current.output]);

    expectFailure(result, /schemaVersion/);
    await assert.rejects(readFile(path.join(current.output, "projects.json")), { code: "ENOENT" });
  } finally {
    await rm(current.directory, { recursive: true, force: true });
  }
});

test("does not partially overwrite when a destination cannot be replaced", async () => {
  const current = await fixture();
  try {
    await mkdir(current.output);
    await writeFile(path.join(current.output, "projects.json"), "projects-before\n");
    await mkdir(path.join(current.output, "catalog-source.json"));

    const result = run(["--input", current.input, "--base-commit", commit, "--sha256", current.checksum, "--output-dir", current.output]);

    expectFailure(result, /directory|regular file|EISDIR|ENOTDIR/i);
    assert.equal(await readFile(path.join(current.output, "projects.json"), "utf8"), "projects-before\n");
    assert.deepEqual((await readdir(current.output)).filter((name) => name.includes(".tmp-")), []);
  } finally {
    await rm(current.directory, { recursive: true, force: true });
  }
});

test("rejects malformed JSON without creating output", async () => {
  const current = await fixture();
  try {
    const bytes = "{not-json\n";
    await writeFile(current.input, bytes);

    const result = run(["--input", current.input, "--base-commit", commit, "--sha256", sha256(bytes), "--output-dir", current.output]);

    expectFailure(result, /malformed JSON/i);
    await assert.rejects(readFile(path.join(current.output, "projects.json")), { code: "ENOENT" });
  } finally {
    await rm(current.directory, { recursive: true, force: true });
  }
});

test("rejects branch refs and non-GitHub raw URLs", async () => {
  const branch = run(["--input", "catalog.json", "--base-commit", "main", "--sha256", "0".repeat(64)]);
  expectFailure(branch, /base-commit.*40 lowercase hexadecimal/i);

  const invalidHost = run([
    "--url", `https://example.com/haohuifeng0/awesome-jev/${commit}/catalog.json`,
    "--commit", commit,
    "--sha256", "0".repeat(64),
  ]);
  expectFailure(invalidHost, /exact raw GitHub commit URL/i);
});

test("offline check detects stale bytes and accepts the pinned pair", async () => {
  const current = await fixture();
  try {
    const imported = run(["--input", current.input, "--base-commit", commit, "--sha256", current.checksum, "--output-dir", current.output]);
    assert.equal(imported.status, 0, imported.stderr);

    const clean = run(["--check", "--output-dir", current.output]);
    assert.equal(clean.status, 0, clean.stderr);
    assert.match(clean.stdout, /"status":"UNPUBLISHED"/);

    await writeFile(path.join(current.output, "projects.json"), `${serialize(catalog)} `);
    const stale = run(["--check", "--output-dir", current.output]);
    expectFailure(stale, /checksum mismatch/i);
  } finally {
    await rm(current.directory, { recursive: true, force: true });
  }
});
