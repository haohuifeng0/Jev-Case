import rawCases from "../data/cases.json";
import rawCatalogSource from "../data/catalog-source.json";
import rawRelations from "../data/project-case-relations.json";
import rawProjects from "../data/projects.json";
import rawScenarios from "../data/scenarios.json";
import rawVerifications from "../data/verifications.json";
import { parseDataBundle } from "./data-loader.ts";

export const projectData = parseDataBundle({
  "cases.json": rawCases,
  "projects.json": rawProjects,
  "catalog-source.json": rawCatalogSource,
  "project-case-relations.json": rawRelations,
  "verifications.json": rawVerifications,
  "scenarios.json": rawScenarios,
});
