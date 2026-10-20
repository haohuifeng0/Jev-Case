import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CatalogSourceSchema } from "../src/lib/data-schemas.ts";
import { parseDataBundle } from "../src/lib/data-loader.ts";
import { getSafeRequestTarget } from "./request-target-guard.mjs";
import {
  getCatalogProvenance,
  getDiscoveryOptions,
  getProjectBySlug,
  getProjectView,
} from "../src/lib/project-query.ts";

async function readJson(name) {
  return JSON.parse(await readFile(new URL(`../src/data/${name}`, import.meta.url), "utf8"));
}

async function loadData() {
  return parseDataBundle({
    "cases.json": await readJson("cases.json"),
    "projects.json": await readJson("projects.json"),
    "catalog-source.json": await readJson("catalog-source.json"),
    "project-case-relations.json": await readJson("project-case-relations.json"),
    "verifications.json": await readJson("verifications.json"),
    "scenarios.json": await readJson("scenarios.json"),
  });
}

test("returns exactly 624 unique static project slugs", async () => {
  // Given: the checked-in, schema-validated catalog snapshot.
  const data = await loadData();

  // When: route slugs are collected for getStaticPaths.
  const slugs = data.projects.projects.map((project) => project.slug);

  // Then: every catalog project maps to one unique static route.
  assert.equal(slugs.length, 624);
  assert.equal(new Set(slugs).size, 624);
});

test("builds discovery options without empty tag values", async () => {
  // Given: projects with optional Agent and type tags.
  const data = await loadData();

  // When: discovery facets are derived.
  const options = getDiscoveryOptions(data.projects.projects);

  // Then: known facets are present and empty values are omitted.
  assert.ok(options.agents.includes("multi"));
  assert.ok(options.types.includes("plugin"));
  assert.ok(options.categories.some((category) => category.key === "agent-decisions"));
  assert.ok(!options.agents.includes(""));
});

test("resolves a related X case without inferring unrelated projects", async () => {
  // Given: one project with an explicit evidence-backed relation.
  const data = await loadData();
  const project = getProjectBySlug(data.projects.projects, "romanslack-jev-drone");
  assert.ok(project);

  // When: the project detail view is queried.
  const view = getProjectView(data, project);

  // Then: only the committed relation and no verification record are returned.
  assert.equal(view.relatedCases.length, 1);
  assert.equal(view.relatedCases[0]?.case.id, "2100335978229690683");
  assert.equal(view.verification, undefined);
});

test("exposes immutable source metadata from the pinned catalog", async () => {
  // Given: the committed published catalog source record.
  const data = await loadData();

  // When: display provenance is derived.
  const provenance = getCatalogProvenance(data.catalogSource);

  // Then: the exact commit and checksum remain visible rather than a floating branch.
  assert.equal(provenance.state, "published");
  assert.match(provenance.revision ?? "", /^[0-9a-f]{40}$/);
  assert.match(provenance.checksum ?? "", /^[0-9a-f]{64}$/);
});

test("does not present missing source metadata as published provenance", () => {
  // Given: a valid bootstrap source record without a published artifact.
  const source = CatalogSourceSchema.parse({ schemaVersion: 1, source: null });

  // When: display provenance is derived.
  const provenance = getCatalogProvenance(source);

  // Then: stale or absent metadata stays explicitly unavailable.
  assert.deepEqual(provenance, { state: "unavailable" });
});

test("keeps prompt-like catalog text on escaped Astro render paths", async () => {
  // Given: project cards and details render untrusted catalog fields.
  const sources = await Promise.all([
    readFile(new URL("../src/components/projects/ProjectCard.astro", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/projects/[slug].astro", import.meta.url), "utf8"),
  ]);

  // When: their rendering directives are inspected.
  const source = sources.join("\n");

  // Then: neither surface bypasses Astro's text escaping.
  assert.doesNotMatch(source, /set:html|is:raw/);
});

test("rejects malformed and prompt-like route lookups as unknown", async () => {
  // Given: untrusted strings that are not canonical catalog slugs.
  const data = await loadData();

  // When: the strings cross the route lookup boundary.
  const malformed = getProjectBySlug(data.projects.projects, "../projects");
  const promptLike = getProjectBySlug(data.projects.projects, "ignore-previous-instructions-script");

  // Then: neither string resolves to a project.
  assert.equal(malformed, undefined);
  assert.equal(promptLike, undefined);
});

test("accepts only safe raw paths before preview decoding", () => {
  // Given: canonical routes and malformed request targets.
  const malformed = [
    "/projects/%3Cscript%3Eignore%3C%2Fscript%3E",
    "/projects/%2e%2e%2fsecret",
    "/projects/%FF",
    "/projects/foo%2Fbar",
    "/projects/foo%5Cbar",
    "//projects/%FF",
    "/PROJECTS/%FF",
    "http://127.0.0.1:4321/projects/%FF",
    "/case/%",
    "/case/%GG",
    "/case/%2e%2e/secret",
    "/case/%3Cscript%3Ealert%3C/script%3E",
  ];

  // When: raw targets are parsed before Astro preview decoding.
  // Then: safe paths and queries normalize while unsafe path bytes fail closed.
  assert.equal(getSafeRequestTarget("/projects?agent=multi&q=%FF"), "/projects?agent=multi&q=%FF");
  assert.equal(getSafeRequestTarget("/case/2100356151468585346"), "/case/2100356151468585346");
  assert.equal(
    getSafeRequestTarget("http://127.0.0.1:4321/projects/romanslack-jev-drone?from=proxy"),
    "/projects/romanslack-jev-drone?from=proxy",
  );
  malformed.forEach((pathValue) => assert.equal(getSafeRequestTarget(pathValue), undefined));
});
