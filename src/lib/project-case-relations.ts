import type {
  CaseDatabase,
  ProjectCaseRelation,
  ProjectCaseRelations,
  ProjectCatalog,
} from "./data-schemas.ts";

export type RelatedCase = Readonly<{
  relation: ProjectCaseRelation;
  case: CaseDatabase["cases"][number];
}>;

export type RelatedProject = Readonly<{
  relation: ProjectCaseRelation;
  project: ProjectCatalog["projects"][number];
}>;

export function getCasesForProject(
  dataset: ProjectCaseRelations,
  cases: CaseDatabase,
  projectId: string,
): readonly RelatedCase[] {
  return dataset.relations.flatMap((relation) => {
    if (relation.projectId !== projectId) return [];
    const relatedCase = cases.cases.find((item) => item.id === relation.caseId);
    return relatedCase === undefined ? [] : [{ relation, case: relatedCase }];
  });
}

export function getProjectsForCase(
  dataset: ProjectCaseRelations,
  projects: ProjectCatalog,
  caseId: string,
): readonly RelatedProject[] {
  return dataset.relations.flatMap((relation) => {
    if (relation.caseId !== caseId) return [];
    const relatedProject = projects.projects.find((project) => project.id === relation.projectId);
    return relatedProject === undefined ? [] : [{ relation, project: relatedProject }];
  });
}
