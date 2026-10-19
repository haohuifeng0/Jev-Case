#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const importer = path.join(root, "scripts/import-awesome-jev.mjs");
const repository = "https://github.com/haohuifeng0/awesome-jev";
const remote = `${repository}.git`;
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const catalog = (name) => ({
  schemaVersion: 1,
  projects: [{
    id: `https://github.com/example/${name}`,
    slug: `example-${name}`,
    name,
    url: `https://github.com/example/${name}`,
    category: { key: "agent-decisions", title: "Agent Decisions" },
    summary: `${name} summary`,
    tags: {},
    source: { file: "categories/agent-decisions.md", line: 1 },
    github: { owner: "example", repo: name },
  }],
});

function run(args) {
  return spawnSync(process.execPath, ["--experimental-strip-types", importer, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

function git(repositoryPath, args) {
  const result = spawnSync("git", ["-C", repositoryPath, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function upstreamFixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "jev-upstream-"));
  const output = path.join(directory, "output");
  await mkdir(output);
  git(directory, ["init", "-q"]);
  git(directory, ["remote", "add", "origin", remote]);
  await writeFile(path.join(directory, "catalog.json"), serialize(catalog("published")));
  git(directory, ["add", "catalog.json"]);
  git(directory, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "catalog"]);
  return { directory, output, commit: git(directory, ["rev-parse", "HEAD"]) };
}

test("rejects a nonexistent immutable commit during finalization without changing metadata", async () => {
  const current = await upstreamFixture();
  try {
    const bytes = await readFile(path.join(current.directory, "catalog.json"));
    await writeFile(path.join(current.output, "projects.json"), bytes);
    const source = { schemaVersion: 1, source: { state: "working-tree", repository, baseCommit: current.commit, sha256: sha256(bytes) } };
    await writeFile(path.join(current.output, "catalog-source.json"), serialize(source));
    const before = await readFile(path.join(current.output, "catalog-source.json"));

    const result = run(["--finalize", "--upstream-repo", current.directory, "--commit", "f".repeat(40), "--output-dir", current.output]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /commit.*does not exist/i);
    assert.deepEqual(await readFile(path.join(current.output, "catalog-source.json")), before);
  } finally {
    await rm(current.directory, { recursive: true, force: true });
  }
});

test("catalog check rejects published provenance whose commit artifact differs", async () => {
  const current = await upstreamFixture();
  try {
    const bytes = Buffer.from(serialize(catalog("snapshot")));
    await writeFile(path.join(current.output, "projects.json"), bytes);
    const source = {
      schemaVersion: 1,
      source: {
        state: "published",
        repository,
        commit: current.commit,
        sha256: sha256(bytes),
        rawUrl: `https://raw.githubusercontent.com/haohuifeng0/awesome-jev/${current.commit}/catalog.json`,
      },
    };
    await writeFile(path.join(current.output, "catalog-source.json"), serialize(source));

    const result = run(["--check", "--upstream-repo", current.directory, "--output-dir", current.output]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /provenance mismatch/i);
  } finally {
    await rm(current.directory, { recursive: true, force: true });
  }
});

test("finalizes working-tree metadata from an immutable catalog commit", async () => {
  const current = await upstreamFixture();
  try {
    const bytes = await readFile(path.join(current.directory, "catalog.json"));
    await writeFile(path.join(current.output, "projects.json"), bytes);
    await writeFile(path.join(current.output, "catalog-source.json"), serialize({
      schemaVersion: 1,
      source: { state: "working-tree", repository, baseCommit: current.commit, sha256: sha256(bytes) },
    }));

    const result = run(["--finalize", "--upstream-repo", current.directory, "--commit", current.commit, "--output-dir", current.output]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /"status":"FINALIZED"/);
    assert.deepEqual(JSON.parse(await readFile(path.join(current.output, "catalog-source.json"))), {
      schemaVersion: 1,
      source: {
        state: "published",
        repository,
        commit: current.commit,
        sha256: sha256(bytes),
        rawUrl: `https://raw.githubusercontent.com/haohuifeng0/awesome-jev/${current.commit}/catalog.json`,
      },
    });
  } finally {
    await rm(current.directory, { recursive: true, force: true });
  }
});

test("catalog check rejects a local upstream with the wrong origin", async () => {
  const current = await upstreamFixture();
  try {
    const bytes = await readFile(path.join(current.directory, "catalog.json"));
    await writeFile(path.join(current.output, "projects.json"), bytes);
    await writeFile(path.join(current.output, "catalog-source.json"), serialize({
      schemaVersion: 1,
      source: {
        state: "published",
        repository,
        commit: current.commit,
        sha256: sha256(bytes),
        rawUrl: `https://raw.githubusercontent.com/haohuifeng0/awesome-jev/${current.commit}/catalog.json`,
      },
    }));
    git(current.directory, ["remote", "set-url", "origin", "https://github.com/yibie/awesome-jev.git"]);

    const result = run(["--check", "--upstream-repo", current.directory, "--output-dir", current.output]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /upstream remote mismatch/i);
  } finally {
    await rm(current.directory, { recursive: true, force: true });
  }
});
