import type { DataBundle } from "./data-loader";
import type { CatalogSource, ProjectCatalog } from "./data-schemas";
import { getCasesForProject } from "./project-case-relations.ts";

export type Project = ProjectCatalog["projects"][number];

export type DiscoveryOptions = Readonly<{
  categories: readonly Readonly<{ key: string; title: string }>[];
  agents: readonly string[];
  types: readonly string[];
}>;

export type CatalogProvenance = Readonly<{
  state: "published" | "working-tree" | "unavailable";
  repository?: string;
  revision?: string;
  checksum?: string;
  artifactUrl?: string;
}>;

function assertNever(value: never): never {
  throw new Error(`Unsupported catalog source: ${JSON.stringify(value)}`);
}

export function getDiscoveryOptions(projects: readonly Project[]): DiscoveryOptions {
  const categories = new Map<string, string>();
  const agents = new Set<string>();
  const types = new Set<string>();

  for (const project of projects) {
    categories.set(project.category.key, project.category.title);
    if (project.tags.agent !== undefined) agents.add(project.tags.agent);
    if (project.tags.type !== undefined) types.add(project.tags.type);
  }

  return {
    categories: [...categories].map(([key, title]) => ({ key, title })).sort((a, b) => a.title.localeCompare(b.title)),
    agents: [...agents].sort(),
    types: [...types].sort(),
  };
}

export function getProjectBySlug(projects: readonly Project[], slug: string): Project | undefined {
  return projects.find((project) => project.slug === slug);
}

export function getProjectView(data: DataBundle, project: Project) {
  return {
    relatedCases: getCasesForProject(data.relations, data.cases, project.id),
    verification: data.verifications.verifications.find((record) => record.projectId === project.id),
  };
}

export function getCatalogProvenance(source: CatalogSource): CatalogProvenance {
  if (source.source === null) return { state: "unavailable" };

  switch (source.source.state) {
    case "published":
      return {
        state: "published",
        repository: source.source.repository,
        revision: source.source.commit,
        checksum: source.source.sha256,
        artifactUrl: source.source.rawUrl,
      };
    case "working-tree":
      return {
        state: "working-tree",
        repository: source.source.repository,
        revision: source.source.baseCommit,
        checksum: source.source.sha256,
      };
    default:
      return assertNever(source.source);
  }
}
