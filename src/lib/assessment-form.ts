import { z } from "zod";

const LOCAL_ASSESSMENT_FORM_URL =
  "https://wenjuan.feishu.cn/m/cfm?assessment_fixture=local";
const ALLOWED_FEISHU_HOSTS = new Set([
  "feishu.cn",
  "forms.feishu.cn",
  "wenjuan.feishu.cn",
  "www.feishu.cn",
]);
const ATTRIBUTION = {
  source: "service-assessment",
  utm_campaign: "agent-decision-assessment",
  utm_medium: "website",
  utm_source: "jev-case",
} as const;

const assessmentFormUrlSchema = z
  .url({
    protocol: /^https$/,
    error: "must be a valid HTTPS URL",
  })
  .superRefine((value, context) => {
    const url = new URL(value);
    if (!ALLOWED_FEISHU_HOSTS.has(url.hostname)) {
      context.addIssue({
        code: "custom",
        message: "host must be an approved Feishu form host",
      });
    }
    if (url.username || url.password) {
      context.addIssue({
        code: "custom",
        message: "credentials are not allowed in the assessment form URL",
      });
    }
    if (url.hash) {
      context.addIssue({
        code: "custom",
        message: "fragments are not allowed in the assessment form URL",
      });
    }
  });

export class AssessmentFormConfigError extends Error {
  readonly name = "AssessmentFormConfigError";
}

export function getAssessmentFormUrl(
  configuredUrl: string | undefined,
  production: boolean,
): string {
  if (production && !configuredUrl?.trim()) {
    throw new AssessmentFormConfigError(
      "PUBLIC_ASSESSMENT_FORM_URL is required for production builds",
    );
  }

  const result = assessmentFormUrlSchema.safeParse(
    configuredUrl?.trim() || LOCAL_ASSESSMENT_FORM_URL,
  );
  if (!result.success) {
    const reason = result.error.issues.map((issue) => issue.message).join("; ");
    throw new AssessmentFormConfigError(
      `PUBLIC_ASSESSMENT_FORM_URL is invalid: ${reason}`,
    );
  }

  const url = new URL(result.data);
  for (const [key, value] of Object.entries(ATTRIBUTION)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}
