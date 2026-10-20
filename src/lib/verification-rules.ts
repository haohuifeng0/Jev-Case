export const VERIFICATION_STATUSES = ["verified", "limited", "unverified"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export type DecisionCheck = Readonly<{
  outcome: "pass" | "fail" | "not-found";
}>;

export type VerificationDecisionChecks = Readonly<{
  directJevCall: DecisionCheck;
  runnableCheck: DecisionCheck;
  publicDemo: DecisionCheck;
}>;

export type ReviewFreshness = Readonly<{
  state: "current" | "needs-recheck";
  ageDays: number;
}>;

export function deriveVerificationStatus(checks: VerificationDecisionChecks): VerificationStatus {
  if (checks.directJevCall.outcome !== "pass") return "unverified";
  if (checks.runnableCheck.outcome === "fail" || checks.publicDemo.outcome === "fail") {
    return "unverified";
  }
  if (checks.runnableCheck.outcome === "pass" || checks.publicDemo.outcome === "pass") {
    return "verified";
  }
  return "limited";
}

export function getReviewFreshness(reviewedAt: string, today: Date): ReviewFreshness {
  const reviewTime = Date.parse(`${reviewedAt}T00:00:00.000Z`);
  const currentDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const ageDays = Math.max(0, Math.floor((currentDay - reviewTime) / 86_400_000));
  return { state: ageDays > 90 ? "needs-recheck" : "current", ageDays };
}
