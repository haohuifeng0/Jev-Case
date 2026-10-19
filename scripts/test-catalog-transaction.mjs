#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { bindProcessInterrupts, replaceCatalogPair } from "./catalog-transaction.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function fixture() {
  const outputDirectory = await mkdtemp(path.join(tmpdir(), "jev-catalog-transaction-"));
  const priorProjects = Buffer.from("projects-before\n");
  const priorSource = Buffer.from("source-before\n");
  await writeFile(path.join(outputDirectory, "projects.json"), priorProjects);
  await writeFile(path.join(outputDirectory, "catalog-source.json"), priorSource);
  return { outputDirectory, priorProjects, priorSource };
}

async function assertPriorPair(current) {
  assert.equal(sha256(await readFile(path.join(current.outputDirectory, "projects.json"))), sha256(current.priorProjects));
  assert.equal(sha256(await readFile(path.join(current.outputDirectory, "catalog-source.json"))), sha256(current.priorSource));
  assert.deepEqual((await readdir(current.outputDirectory)).filter((name) => name.includes(".tmp-")), []);
}

test("rolls back both destinations when the second filesystem replacement fails", async () => {
  const current = await fixture();
  try {
    await assert.rejects(replaceCatalogPair({
      outputDirectory: current.outputDirectory,
      projectsBytes: Buffer.from("projects-after\n"),
      sourceBytes: Buffer.from("source-after\n"),
      async onStage(stage) {
        if (stage !== "projects-replaced") return;
        await rm(path.join(current.outputDirectory, "catalog-source.json"));
        await mkdir(path.join(current.outputDirectory, "catalog-source.json"));
      },
    }), /directory|EISDIR|ENOTDIR/i);
    await assertPriorPair(current);
  } finally {
    await rm(current.outputDirectory, { recursive: true, force: true });
  }
});

for (const [stage, interrupt] of [["staged", "SIGTERM"], ["projects-replaced", "SIGINT"], ["source-replaced", "SIGTERM"]]) {
  test(`${interrupt} at ${stage} restores the prior pair`, async () => {
    const current = await fixture();
    const controller = new AbortController();
    const unbind = bindProcessInterrupts(controller);
    try {
      await assert.rejects(replaceCatalogPair({
        outputDirectory: current.outputDirectory,
        projectsBytes: Buffer.from("projects-after\n"),
        sourceBytes: Buffer.from("source-after\n"),
        signal: controller.signal,
        async onStage(currentStage) {
          if (currentStage !== stage) return;
          const interrupted = new Promise((resolve) => controller.signal.addEventListener("abort", resolve, { once: true }));
          process.kill(process.pid, interrupt);
          await interrupted;
        },
      }), new RegExp(`interrupted by ${interrupt}`));
      await assertPriorPair(current);
    } finally {
      unbind();
      await rm(current.outputDirectory, { recursive: true, force: true });
    }
  });
}
