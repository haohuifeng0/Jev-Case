import type { DataBundle } from "./data-loader";
import type { ScenarioContent } from "./scenario-schema";

export type ScenarioEntry = Readonly<{ id: string; data: ScenarioContent }>;
export type ScenarioProject = Readonly<{
  project: DataBundle["projects"]["projects"][number];
  verification: DataBundle["verifications"]["verifications"][number] | undefined;
}>;
export type ScenarioView = Readonly<{
  entry: ScenarioEntry;
  projects: readonly ScenarioProject[];
  relatedCases: readonly DataBundle["cases"]["cases"][number][];
}>;

const plannedProjectIds = {
  "model-routing": [
    "https://github.com/gargpratyush/jev-router",
    "https://github.com/minilv/jev-auto-router",
    "https://github.com/protocol-lattice/harness-router",
    "https://github.com/ruban-24/switchboard",
    "https://github.com/ruivalim/decision-router",
  ],
  "tool-skill-selection": [
    "https://github.com/godsboy/jev-agent-skill-router",
    "https://github.com/safzanpirani/pi-jev-skill-picker",
    "https://github.com/dicklesworthstone/skillranker",
    "https://github.com/parkavenue9639/jevloop",
    "https://github.com/kerpopule/hermes-jev-skills",
  ],
  "risk-gates": [
    "https://github.com/y0usaf/pi-jev",
    "https://github.com/leepokai/jev-guard",
    "https://github.com/veridicaltech/edward",
    "https://github.com/qkal/canny",
    "https://github.com/ckorhonen/jev-lint",
  ],
  "output-verification": [
    "https://github.com/different-ai/openwork",
    "https://github.com/thruwire/foreman",
    "https://github.com/tech-byte-frontier/jevgate",
    "https://blink.review",
    "https://github.com/egma-ai/jev-code-reviewer",
  ],
} as const satisfies Record<ScenarioContent["slug"], readonly string[]>;

const expectedSlugs = [
  "model-routing",
  "tool-skill-selection",
  "risk-gates",
  "output-verification",
] as const;

export class ScenarioIntegrityError extends Error {
  constructor(detail: string) {
    super(`scenarios: ${detail}`);
    this.name = "ScenarioIntegrityError";
  }
}

export function resolveScenarioViews(entries: readonly ScenarioEntry[], data: DataBundle): readonly ScenarioView[] {
  const entrySlugs = entries.map((entry) => entry.data.slug);
  if (entries.length !== expectedSlugs.length || expectedSlugs.some((slug) => !entrySlugs.includes(slug))) {
    throw new ScenarioIntegrityError("must contain the four planned canonical scenarios");
  }
  if (new Set(entries.map((entry) => entry.data.title)).size !== entries.length) {
    throw new ScenarioIntegrityError("titles must be distinct");
  }
  if (new Set(entries.map((entry) => entry.data.description)).size !== entries.length) {
    throw new ScenarioIntegrityError("descriptions must be distinct");
  }

  return entries.map((entry) => {
    if (entry.id !== entry.data.slug) throw new ScenarioIntegrityError(`${entry.id}: ID must match slug ${entry.data.slug}`);
    const planned = plannedProjectIds[entry.data.slug];
    if (planned.some((id, index) => entry.data.projectIds[index] !== id)) {
      throw new ScenarioIntegrityError(`${entry.id}: projectIds must match the planned five projects in order`);
    }
    const projects = entry.data.projectIds.map((projectId) => {
      const project = data.projects.projects.find((candidate) => candidate.id === projectId);
      if (project === undefined) throw new ScenarioIntegrityError(`${entry.id}: unknown project ${projectId}`);
      return {
        project,
        verification: data.verifications.verifications.find((record) => record.projectId === projectId),
      };
    });
    const relatedCaseIds = new Set(
      data.relations.relations
        .filter((relation) => entry.data.projectIds.includes(relation.projectId))
        .map((relation) => relation.caseId),
    );
    return {
      entry,
      projects,
      relatedCases: data.cases.cases.filter((item) => relatedCaseIds.has(item.id)),
    };
  });
}
