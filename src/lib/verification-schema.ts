import { z } from "zod";
import { deriveVerificationStatus, VERIFICATION_STATUSES } from "./verification-rules.ts";

const nonEmptyString = z.string().trim().min(1);
const httpsUrl = z.url({ protocol: /^https$/ });
const revision = z.string().regex(/^[0-9a-f]{40}$/);

function hasImmutableGitHubPath(urlValue: string, expectedRevision: string): boolean {
  const url = new URL(urlValue);
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    return false;
  }
  if (url.hostname === "github.com") {
    const match = url.pathname.match(
      /^\/[^/]+\/[^/]+\/(?:(?:blob|tree)\/([0-9a-f]{40})(?:\/.*)?|commit\/([0-9a-f]{40})\/?)$/,
    );
    return match?.[1] === expectedRevision || match?.[2] === expectedRevision;
  }
  if (url.hostname === "raw.githubusercontent.com") {
    const match = url.pathname.match(/^\/[^/]+\/[^/]+\/([0-9a-f]{40})\/.+$/);
    return match?.[1] === expectedRevision;
  }
  return false;
}

export const VerificationEvidenceSchema = z.strictObject({
  label: nonEmptyString.max(180),
  url: httpsUrl,
  revision,
}).superRefine((evidence, context) => {
  if (!hasImmutableGitHubPath(evidence.url, evidence.revision)) {
    context.addIssue({
      code: "custom",
      path: ["url"],
      message: "must use an immutable GitHub blob, tree, commit, or raw URL matching revision",
    });
  }
}).readonly();

const evidenceList = z.array(VerificationEvidenceSchema).readonly();
const decisionCheckSchema = z.strictObject({
  outcome: z.enum(["pass", "fail", "not-found"]),
  evidence: evidenceList,
}).superRefine((check, context) => {
  if (check.outcome === "pass" && check.evidence.length === 0) {
    context.addIssue({ code: "custom", path: ["evidence"], message: "pass requires evidence" });
  }
}).readonly();

const licenseCheckSchema = z.strictObject({
  result: z.enum(["found", "missing", "unclear"]),
  evidence: evidenceList,
}).superRefine((check, context) => {
  if (check.result === "found" && check.evidence.length === 0) {
    context.addIssue({ code: "custom", path: ["evidence"], message: "found requires evidence" });
  }
}).readonly();

const documentationCheckSchema = z.strictObject({
  result: z.enum(["substantial", "basic", "missing"]),
  evidence: evidenceList,
}).superRefine((check, context) => {
  if (check.result === "substantial" && check.evidence.length === 0) {
    context.addIssue({ code: "custom", path: ["evidence"], message: "substantial requires evidence" });
  }
}).readonly();

const maintenanceCheckSchema = z.strictObject({
  result: z.enum(["active", "inactive", "unknown"]),
  evidence: evidenceList,
}).superRefine((check, context) => {
  if (check.result === "active" && check.evidence.length === 0) {
    context.addIssue({ code: "custom", path: ["evidence"], message: "active requires evidence" });
  }
}).readonly();

export const VerificationRecordSchema = z.strictObject({
  projectId: httpsUrl,
  status: z.enum(VERIFICATION_STATUSES),
  reviewedAt: z.iso.date(),
  checks: z.strictObject({
    directJevCall: decisionCheckSchema,
    runnableCheck: decisionCheckSchema,
    publicDemo: decisionCheckSchema,
    license: licenseCheckSchema,
    documentationDepth: documentationCheckSchema,
    maintenanceSignal: maintenanceCheckSchema,
  }).readonly(),
  reviewerNotes: nonEmptyString.max(2_000),
}).superRefine((record, context) => {
  if (record.reviewedAt > new Date().toISOString().slice(0, 10)) {
    context.addIssue({ code: "custom", path: ["reviewedAt"], message: "cannot be in the future" });
  }
  const derivedStatus = deriveVerificationStatus(record.checks);
  if (record.status !== derivedStatus) {
    context.addIssue({
      code: "custom",
      path: ["status"],
      message: `must be ${derivedStatus} based on check evidence`,
    });
  }
}).readonly();

export const VerificationsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  verifications: z.array(VerificationRecordSchema).readonly(),
}).readonly();

export type VerificationEvidence = z.infer<typeof VerificationEvidenceSchema>;
export type VerificationRecord = z.infer<typeof VerificationRecordSchema>;
export type Verifications = z.infer<typeof VerificationsSchema>;
