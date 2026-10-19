import { z } from "zod";
import {
  CaseDatabaseSchema,
  CatalogSourceSchema,
  ProjectCatalogSchema,
  RelationsSchema,
  ScenariosSchema,
  VerificationsSchema,
  type CaseDatabase,
  type CatalogSource,
  type ProjectCatalog,
  type ProjectCaseRelations,
  type Scenarios,
  type Verifications,
} from "./data-schemas.ts";

export type DataBundle = Readonly<{
  cases: CaseDatabase;
  projects: ProjectCatalog;
  catalogSource: CatalogSource;
  relations: ProjectCaseRelations;
  verifications: Verifications;
  scenarios: Scenarios;
}>;

export type RawDataBundle = Readonly<{
  "cases.json": unknown;
  "projects.json": unknown;
  "catalog-source.json": unknown;
  "project-case-relations.json": unknown;
  "verifications.json": unknown;
  "scenarios.json": unknown;
}>;

export class DataValidationError extends Error {
  readonly dataset: string;
  readonly fieldPath: string;

  constructor(dataset: string, fieldPath: string, detail: string) {
    super(fieldPath === "$" ? `${dataset}: ${detail}` : `${dataset}: ${fieldPath}: ${detail}`);
    this.name = "DataValidationError";
    this.dataset = dataset;
    this.fieldPath = fieldPath;
  }
}

function parseDataset<T>(dataset: string, schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  if (issue === undefined) throw new DataValidationError(dataset, "$", "invalid data");
  const fieldPath = issue.path.length === 0 ? "$" : issue.path.join(".");
  throw new DataValidationError(dataset, fieldPath, issue.message);
}

export function parseCaseDatabase(input: unknown): CaseDatabase {
  return parseDataset("cases.json", CaseDatabaseSchema, input);
}

export function parseDataBundle(input: RawDataBundle): DataBundle {
  const cases = parseCaseDatabase(input["cases.json"]);
  const projects = parseDataset("projects.json", ProjectCatalogSchema, input["projects.json"]);
  const catalogSource = parseDataset("catalog-source.json", CatalogSourceSchema, input["catalog-source.json"]);
  const relations = parseDataset(
    "project-case-relations.json",
    RelationsSchema,
    input["project-case-relations.json"],
  );
  const verifications = parseDataset("verifications.json", VerificationsSchema, input["verifications.json"]);
  const scenarios = parseDataset("scenarios.json", ScenariosSchema, input["scenarios.json"]);
  const caseIds = new Set(cases.cases.map((item) => item.id));
  const projectIds = new Set(projects.projects.map((project) => project.id));

  relations.relations.forEach((relation, index) => {
    if (!projectIds.has(relation.projectId)) {
      throw new DataValidationError(
        "project-case-relations.json",
        `relations.${index}.projectId`,
        `unknown project ID ${relation.projectId}`,
      );
    }
    if (!caseIds.has(relation.caseId)) {
      throw new DataValidationError(
        "project-case-relations.json",
        `relations.${index}.caseId`,
        `unknown case ID ${relation.caseId}`,
      );
    }
  });
  verifications.verifications.forEach((verification, index) => {
    if (!projectIds.has(verification.projectId)) {
      throw new DataValidationError(
        "verifications.json",
        `verifications.${index}.projectId`,
        `unknown project ID ${verification.projectId}`,
      );
    }
  });
  scenarios.scenarios.forEach((scenario, scenarioIndex) => {
    scenario.projectIds.forEach((projectId, projectIndex) => {
      if (!projectIds.has(projectId)) {
        throw new DataValidationError(
          "scenarios.json",
          `scenarios.${scenarioIndex}.projectIds.${projectIndex}`,
          `unknown project ID ${projectId}`,
        );
      }
    });
    scenario.caseIds.forEach((caseId, caseIndex) => {
      if (!caseIds.has(caseId)) {
        throw new DataValidationError(
          "scenarios.json",
          `scenarios.${scenarioIndex}.caseIds.${caseIndex}`,
          `unknown case ID ${caseId}`,
        );
      }
    });
  });

  return { cases, projects, catalogSource, relations, verifications, scenarios };
}
