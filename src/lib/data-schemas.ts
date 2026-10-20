import { z } from "zod";
import type { Verifications } from "./verification-schema.ts";

export { VerificationsSchema } from "./verification-schema.ts";
export type { VerificationEvidence, VerificationRecord } from "./verification-schema.ts";

const nonEmptyString = z.string().trim().min(1);
const identifier = nonEmptyString.regex(/^[a-z0-9][a-z0-9._:/-]*$/i);
const slug = nonEmptyString.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const httpsUrl = z.url({ protocol: /^https$/ });
const webUrl = z.url({ protocol: /^https?$/ });
const stringArray = z.array(nonEmptyString).readonly();

const metricsSchema = z.strictObject({
  views: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  bookmarks: z.number().int().nonnegative(),
  reposts: z.number().int().nonnegative(),
  replies: z.number().int().nonnegative(),
  quotes: z.number().int().nonnegative(),
}).readonly();

const authorSchema = z.strictObject({
  name: nonEmptyString,
  screenName: nonEmptyString,
  avatarUrl: httpsUrl.optional(),
  verified: z.boolean(),
  followers: z.number().int().nonnegative().optional(),
}).readonly();

const translationSchema = z.strictObject({
  status: z.literal("ready"),
  text: nonEmptyString,
  targetLang: nonEmptyString,
  detectedLang: nonEmptyString.optional(),
}).readonly();

const caseReferenceSchema = z.strictObject({
  id: nonEmptyString,
  canonicalUrl: httpsUrl,
  author: authorSchema,
  createdAt: z.iso.datetime(),
  text: nonEmptyString,
  lang: nonEmptyString.optional(),
  translation: translationSchema.optional(),
  metrics: metricsSchema,
}).readonly();

const mediaSchema = z.strictObject({
  id: nonEmptyString,
  type: z.enum(["video", "gif", "photo"]),
  publicUrl: httpsUrl.optional(),
  posterPublicUrl: httpsUrl.optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  status: z.enum(["ready", "pending", "failed"]),
}).readonly();

const linkSchema = z.strictObject({
  url: webUrl,
  displayUrl: nonEmptyString.optional(),
  domain: nonEmptyString,
}).readonly();

const articleSchema = z.strictObject({
  url: webUrl,
  domain: nonEmptyString,
  title: nonEmptyString.optional(),
  description: nonEmptyString.optional(),
  imageUrl: httpsUrl.optional(),
}).readonly();

export const CaseItemSchema = z.strictObject({
  id: nonEmptyString,
  canonicalUrl: httpsUrl,
  author: authorSchema,
  createdAt: z.iso.datetime(),
  text: nonEmptyString,
  lang: nonEmptyString,
  metrics: metricsSchema,
  media: z.array(mediaSchema).readonly(),
  quoted: caseReferenceSchema.nullable(),
  links: z.array(linkSchema).readonly(),
  articles: z.array(articleSchema).readonly(),
  references: z.array(caseReferenceSchema).readonly(),
  translation: translationSchema.optional(),
  hashtags: stringArray,
  mentions: stringArray,
  mediaStatus: z.enum(["ready", "partial", "pending", "failed"]),
  curatedAt: z.iso.datetime(),
}).readonly();

export const CaseDatabaseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  generatedAt: z.iso.datetime(),
  aliases: z.array(z.strictObject({
    id: nonEmptyString,
    canonicalCaseId: nonEmptyString,
  }).readonly()).readonly(),
  cases: z.array(CaseItemSchema).readonly(),
}).superRefine((database, context) => {
  const caseIds = new Set<string>();
  database.cases.forEach((item, index) => {
    if (caseIds.has(item.id)) {
      context.addIssue({ code: "custom", path: ["cases", index, "id"], message: `duplicate ID ${item.id}` });
    }
    caseIds.add(item.id);
  });
  const aliasIds = new Set<string>();
  database.aliases.forEach((alias, index) => {
    if (aliasIds.has(alias.id) || caseIds.has(alias.id)) {
      context.addIssue({ code: "custom", path: ["aliases", index, "id"], message: `duplicate ID ${alias.id}` });
    }
    if (!caseIds.has(alias.canonicalCaseId)) {
      context.addIssue({
        code: "custom",
        path: ["aliases", index, "canonicalCaseId"],
        message: `unknown case ID ${alias.canonicalCaseId}`,
      });
    }
    aliasIds.add(alias.id);
  });
}).readonly();

const projectSchema = z.strictObject({
  id: httpsUrl,
  slug,
  name: nonEmptyString,
  url: httpsUrl,
  category: z.strictObject({ key: slug, title: nonEmptyString }).readonly(),
  summary: nonEmptyString,
  tags: z.strictObject({ type: nonEmptyString.optional(), agent: nonEmptyString.optional() }).readonly(),
  source: z.strictObject({ file: nonEmptyString, line: z.number().int().positive() }).readonly(),
  github: z.strictObject({ owner: nonEmptyString, repo: nonEmptyString }).readonly().optional(),
}).readonly();

export const ProjectCatalogSchema = z.strictObject({
  schemaVersion: z.literal(1),
  projects: z.array(projectSchema).readonly(),
}).superRefine((catalog, context) => {
  const ids = new Set<string>();
  const slugs = new Set<string>();
  catalog.projects.forEach((project, index) => {
    if (ids.has(project.id)) context.addIssue({ code: "custom", path: ["projects", index, "id"], message: `duplicate ID ${project.id}` });
    if (slugs.has(project.slug)) context.addIssue({ code: "custom", path: ["projects", index, "slug"], message: `duplicate slug ${project.slug}` });
    ids.add(project.id);
    slugs.add(project.slug);
  });
}).readonly();

export const CatalogSourceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  source: z.discriminatedUnion("state", [
    z.strictObject({
      state: z.literal("working-tree"),
      repository: httpsUrl,
      baseCommit: z.string().regex(/^[0-9a-f]{40}$/),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
    }).readonly(),
    z.strictObject({
      state: z.literal("published"),
      repository: httpsUrl,
      commit: z.string().regex(/^[0-9a-f]{40}$/),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      rawUrl: httpsUrl,
    }).readonly(),
  ]).nullable(),
}).readonly();

const relationSchema = z.strictObject({
  projectId: httpsUrl,
  caseId: nonEmptyString,
  type: z.enum(["announcement", "demo", "discussion", "benchmark", "derivative"]),
  evidenceUrl: httpsUrl,
}).readonly();

export const RelationsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  relations: z.array(relationSchema).readonly(),
}).superRefine((dataset, context) => {
  const triples = new Set<string>();
  dataset.relations.forEach((relation, index) => {
    const triple = `${relation.projectId}\u0000${relation.caseId}\u0000${relation.type}`;
    if (triples.has(triple)) {
      context.addIssue({
        code: "custom",
        path: ["relations", index],
        message: `duplicate relation triple ${relation.projectId}, ${relation.caseId}, ${relation.type}`,
      });
    }
    triples.add(triple);
  });
}).readonly();

export const ScenariosSchema = z.strictObject({
  schemaVersion: z.literal(1),
  scenarios: z.array(z.strictObject({
    id: identifier,
    slug,
    title: nonEmptyString,
    projectIds: z.array(httpsUrl).readonly(),
    caseIds: stringArray,
  }).readonly()).readonly(),
}).superRefine((dataset, context) => {
  const ids = new Set<string>();
  const slugs = new Set<string>();
  dataset.scenarios.forEach((scenario, index) => {
    if (ids.has(scenario.id)) context.addIssue({ code: "custom", path: ["scenarios", index, "id"], message: `duplicate ID ${scenario.id}` });
    if (slugs.has(scenario.slug)) context.addIssue({ code: "custom", path: ["scenarios", index, "slug"], message: `duplicate slug ${scenario.slug}` });
    ids.add(scenario.id);
    slugs.add(scenario.slug);
  });
}).readonly();

export type CaseItem = z.infer<typeof CaseItemSchema>;
export type CaseDatabase = z.infer<typeof CaseDatabaseSchema>;
export type CaseMedia = z.infer<typeof mediaSchema>;
export type CaseTranslation = z.infer<typeof translationSchema>;
export type CaseAlias = CaseDatabase["aliases"][number];
export type ProjectCatalog = z.infer<typeof ProjectCatalogSchema>;
export type CatalogSource = z.infer<typeof CatalogSourceSchema>;
export type ProjectCaseRelations = z.infer<typeof RelationsSchema>;
export type ProjectCaseRelation = z.infer<typeof relationSchema>;
export type { Verifications };
export type Scenarios = z.infer<typeof ScenariosSchema>;
