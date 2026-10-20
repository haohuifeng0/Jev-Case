import { z } from "zod";

const nonEmptyText = z.string().trim().min(12);
const projectId = z.url({ protocol: /^https$/ });

const questionShapeSchema = z.strictObject({
  context: nonEmptyText,
  options: z.array(nonEmptyText).min(2).readonly(),
  criteria: z.array(nonEmptyText).min(2).readonly(),
  output: nonEmptyText,
}).readonly();

const confidenceSchema = z.strictObject({
  interpretation: nonEmptyText,
  escalation: nonEmptyText,
}).readonly();

const ctaSchema = z.strictObject({
  heading: nonEmptyText,
  body: nonEmptyText,
  label: z.string().trim().min(4),
  href: z.literal("/services/agent-decision-assessment"),
}).readonly();

export const ScenarioContentSchema = z.strictObject({
  slug: z.enum(["model-routing", "tool-skill-selection", "risk-gates", "output-verification"]),
  title: z.string().trim().min(4),
  titleSegments: z.array(z.string().trim().min(2)).min(2).max(4).readonly(),
  description: nonEmptyText,
  eyebrow: z.string().trim().min(4),
  decision: nonEmptyText,
  fit: z.array(nonEmptyText).min(2).readonly(),
  notFit: z.array(nonEmptyText).min(2).readonly(),
  questionShape: questionShapeSchema,
  confidence: confidenceSchema,
  controls: z.array(nonEmptyText).min(2).readonly(),
  projectIds: z.array(projectId).length(5).readonly(),
  verificationCaveat: nonEmptyText.refine(
    (value) => value.includes("不代表推荐") && value.includes("尚未审阅"),
    "must state non-endorsement and unreviewed status",
  ),
  cta: ctaSchema,
}).superRefine((scenario, context) => {
  if (scenario.titleSegments.join("") !== scenario.title) {
    context.addIssue({ code: "custom", path: ["titleSegments"], message: "must reconstruct title exactly" });
  }
  if (new Set(scenario.projectIds).size !== scenario.projectIds.length) {
    context.addIssue({ code: "custom", path: ["projectIds"], message: "must contain five unique projects" });
  }
  const claims = JSON.stringify(scenario);
  if (/\bROI\b|回报率|保证准确率|\d+(?:\.\d+)?%/.test(claims)) {
    context.addIssue({ code: "custom", path: [], message: "unsupported benchmark or ROI claim" });
  }
}).readonly();

export type ScenarioContent = z.infer<typeof ScenarioContentSchema>;
