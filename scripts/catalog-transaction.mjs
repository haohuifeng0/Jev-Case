import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export function bindProcessInterrupts(controller) {
  const handlers = new Map(["SIGINT", "SIGTERM"].map((name) => [
    name,
    () => controller.abort(new Error(`interrupted by ${name}`)),
  ]));
  handlers.forEach((handler, name) => process.once(name, handler));
  return () => handlers.forEach((handler, name) => process.removeListener(name, handler));
}

async function readPrior(file) {
  try {
    return { exists: true, bytes: await readFile(file) };
  } catch (error) {
    if (error instanceof Error && error.code === "ENOENT") return { exists: false, bytes: null };
    throw error;
  }
}

async function restore(file, prior, temporary) {
  await rm(file, { recursive: true, force: true });
  if (!prior.exists) return;
  await writeFile(temporary, prior.bytes, { flag: "wx" });
  await rename(temporary, file);
}

export async function replaceCatalogPair({
  outputDirectory,
  projectsBytes,
  sourceBytes,
  signal,
  onStage = async () => {},
}) {
  await mkdir(outputDirectory, { recursive: true });
  const projectsPath = path.join(outputDirectory, "projects.json");
  const sourcePath = path.join(outputDirectory, "catalog-source.json");
  const suffix = `.tmp-${process.pid}-${randomUUID()}`;
  const projectsTemp = `${projectsPath}${suffix}`;
  const sourceTemp = `${sourcePath}${suffix}`;
  const projectsRestore = `${projectsPath}${suffix}-restore`;
  const sourceRestore = `${sourcePath}${suffix}-restore`;
  const [priorProjects, priorSource] = await Promise.all([
    readPrior(projectsPath),
    readPrior(sourcePath),
  ]);
  let projectsReplaced = false;
  let sourceReplaced = false;
  try {
    signal?.throwIfAborted();
    await Promise.all([
      writeFile(projectsTemp, projectsBytes, { flag: "wx", signal }),
      writeFile(sourceTemp, sourceBytes, { flag: "wx", signal }),
    ]);
    await onStage("staged");
    signal?.throwIfAborted();
    await rename(projectsTemp, projectsPath);
    projectsReplaced = true;
    await onStage("projects-replaced");
    signal?.throwIfAborted();
    await rename(sourceTemp, sourcePath);
    sourceReplaced = true;
    await onStage("source-replaced");
    signal?.throwIfAborted();
  } catch (error) {
    try {
      if (projectsReplaced || sourceReplaced) {
        await restore(sourcePath, priorSource, sourceRestore);
        await restore(projectsPath, priorProjects, projectsRestore);
      }
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], "catalog pair update and rollback both failed");
    }
    throw error;
  } finally {
    await Promise.all([
      rm(projectsTemp, { force: true }),
      rm(sourceTemp, { force: true }),
      rm(projectsRestore, { force: true }),
      rm(sourceRestore, { force: true }),
    ]);
  }
}
