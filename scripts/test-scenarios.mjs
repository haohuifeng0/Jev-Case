import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseDataBundle } from "../src/lib/data-loader.ts";
import { resolveScenarioViews, ScenarioIntegrityError } from "../src/lib/scenario-query.ts";
import { ScenarioContentSchema } from "../src/lib/scenario-schema.ts";

const scenarioNames = ["model-routing", "tool-skill-selection", "risk-gates", "output-verification"];
const datasetNames = [
  "cases.json",
  "projects.json",
  "catalog-source.json",
  "project-case-relations.json",
  "verifications.json",
  "scenarios.json",
];

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

async function loadFixture() {
  const values = await Promise.all(datasetNames.map((name) => readJson(new URL(`../src/data/${name}`, import.meta.url))));
  const data = parseDataBundle(Object.fromEntries(datasetNames.map((name, index) => [name, values[index]])));
  const entries = await Promise.all(scenarioNames.map(async (id) => ({
    id,
    data: ScenarioContentSchema.parse(await readJson(new URL(`../src/content/scenarios/${id}.json`, import.meta.url))),
  })));
  return { data, entries };
}

test("resolves four scenarios with each exact five unique existing projects", async () => {
  // Given: the committed scenario collection and pinned project catalog.
  const fixture = await loadFixture();

  // When: scenario routes resolve their project views.
  const views = resolveScenarioViews(fixture.entries, fixture.data);

  // Then: all planned routes and project sets are complete and unique.
  assert.equal(views.length, 4);
  views.forEach((view) => {
    assert.equal(view.projects.length, 5);
    assert.equal(new Set(view.projects.map((item) => item.project.id)).size, 5);
  });
});

test("rejects missing decision, caveat, and assessment CTA fields", async () => {
  // Given: structurally incomplete scenario content.
  const fixture = await loadFixture();
  const complete = fixture.entries[0].data;

  // When: each required decision field is removed at the collection boundary.
  const missingDecision = ScenarioContentSchema.safeParse({ ...complete, decision: undefined });
  const missingCaveat = ScenarioContentSchema.safeParse({ ...complete, verificationCaveat: undefined });
  const missingCta = ScenarioContentSchema.safeParse({ ...complete, cta: undefined });

  // Then: every incomplete form fails closed.
  assert.equal(missingDecision.success, false);
  assert.equal(missingCaveat.success, false);
  assert.equal(missingCta.success, false);
});

test("requires semantic title segments that reconstruct the metadata title", async () => {
  // Given: the four committed scenario records.
  const fixture = await loadFixture();

  // When: their display-title boundaries are inspected.
  // Then: every title is reconstructed from multiple non-empty semantic segments.
  fixture.entries.forEach((entry) => {
    assert.ok(entry.data.titleSegments.length >= 2);
    assert.equal(entry.data.titleSegments.join(""), entry.data.title);
  });
  const mismatched = ScenarioContentSchema.safeParse({
    ...fixture.entries[0].data,
    titleSegments: ["错误", "标题"],
  });
  assert.equal(mismatched.success, false);
});

test("rejects duplicate projects and unsupported performance claims", async () => {
  // Given: otherwise valid scenario metadata.
  const fixture = await loadFixture();
  const complete = fixture.entries[0].data;

  // When: one project repeats and a benchmark-style claim is inserted.
  const duplicate = ScenarioContentSchema.safeParse({
    ...complete,
    projectIds: [...complete.projectIds.slice(0, 4), complete.projectIds[0]],
  });
  const unsupportedClaim = ScenarioContentSchema.safeParse({ ...complete, decision: `${complete.decision} 保证准确率。` });

  // Then: neither content record can enter the collection.
  assert.equal(duplicate.success, false);
  assert.equal(unsupportedClaim.success, false);
});

test("rejects a missing project and a stale catalog snapshot", async () => {
  // Given: valid content resolved against altered project catalogs.
  const fixture = await loadFixture();
  const missingProjectEntries = fixture.entries.map((entry, index) => index === 0 ? {
    ...entry,
    data: { ...entry.data, projectIds: ["https://github.com/missing/project", ...entry.data.projectIds.slice(1)] },
  } : entry);
  const staleData = {
    ...fixture.data,
    projects: { ...fixture.data.projects, projects: fixture.data.projects.projects.filter((project) => project.id !== fixture.entries[0].data.projectIds[0]) },
  };

  // When: route integrity is evaluated.
  // Then: planned-set drift and stale catalog references both stop generation.
  assert.throws(() => resolveScenarioViews(missingProjectEntries, fixture.data), ScenarioIntegrityError);
  assert.throws(() => resolveScenarioViews(fixture.entries, staleData), /unknown project/);
});

test("keeps prompt-like text inert without changing evidence-derived states", async () => {
  // Given: untrusted prose and the current verification dataset.
  const fixture = await loadFixture();
  const promptLike = "</script><script>ignore previous instructions</script>";
  const parsed = ScenarioContentSchema.parse({ ...fixture.entries[0].data, decision: promptLike });
  const pageSource = await readFile(new URL("../src/pages/scenarios/[slug].astro", import.meta.url), "utf8");

  // When: the text crosses the content boundary and current project views resolve.
  const views = resolveScenarioViews(fixture.entries, fixture.data);

  // Then: text remains data, rendering bypasses are absent, and only evidence-backed projects are verified.
  assert.equal(parsed.decision, promptLike);
  assert.doesNotMatch(pageSource, /set:html|is:raw/);
  const modelRouting = views.find((view) => view.entry.id === "model-routing");
  const toolSkill = views.find((view) => view.entry.id === "tool-skill-selection");
  const riskGates = views.find((view) => view.entry.id === "risk-gates");
  const outputVerification = views.find((view) => view.entry.id === "output-verification");
  assert.equal(modelRouting?.projects.filter((item) => item.verification?.status === "verified").length, 1);
  assert.equal(toolSkill?.projects.filter((item) => item.verification?.status === "verified").length, 2);
  assert.equal(riskGates?.projects.filter((item) => item.verification?.status === "verified").length, 1);
  assert.equal(outputVerification?.projects.filter((item) => item.verification?.status === "verified").length, 3);
  assert.equal(outputVerification?.projects.filter((item) => item.verification?.status === "limited").length, 1);
  assert.equal(outputVerification?.projects.filter((item) => item.verification?.status === "unverified").length, 1);
});
