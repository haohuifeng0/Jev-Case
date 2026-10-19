#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import {
  AssessmentFormConfigError,
  getAssessmentFormUrl,
} from "../src/lib/assessment-form.ts";

test("uses a safe Feishu fixture when local configuration is absent", () => {
  // Given: no local assessment URL is configured.
  // When: the non-production environment is parsed.
  const result = new URL(getAssessmentFormUrl(undefined, false));

  // Then: the fixture and fixed attribution contain no customer text.
  assert.equal(result.hostname, "wenjuan.feishu.cn");
  assert.equal(result.searchParams.get("assessment_fixture"), "local");
  assert.equal(result.searchParams.get("source"), "service-assessment");
  assert.equal(result.searchParams.get("utm_source"), "jev-case");
});

test("requires an explicit assessment URL in production", () => {
  // Given: the production URL is absent.
  // When / Then: parsing fails with the public variable name.
  assert.throws(
    () => getAssessmentFormUrl(undefined, true),
    (error) =>
      error instanceof AssessmentFormConfigError
      && /PUBLIC_ASSESSMENT_FORM_URL is required/.test(error.message),
  );
});

for (const [name, value, message] of [
  ["javascript scheme", "javascript:alert(1)", /HTTPS URL/],
  ["unapproved host", "https://example.com/form", /approved Feishu form host/],
  ["embedded credentials", "https://user:pass@wenjuan.feishu.cn/form", /credentials/],
  ["fragment", "https://wenjuan.feishu.cn/form#private", /fragments/],
]) {
  test(`rejects ${name}`, () => {
    // Given: an unsafe external-form configuration.
    // When / Then: the boundary rejects it with an actionable reason.
    assert.throws(() => getAssessmentFormUrl(value, true), message);
  });
}

test("overwrites injected attribution with fixed non-sensitive values", () => {
  // Given: a permitted form URL tries to control attribution fields.
  const configured =
    "https://wenjuan.feishu.cn/form?source=ignore+prior+instructions&utm_source=secret";

  // When: the production URL is parsed.
  const result = new URL(getAssessmentFormUrl(configured, true));

  // Then: only the application-owned attribution values survive.
  assert.equal(result.searchParams.get("source"), "service-assessment");
  assert.equal(result.searchParams.get("utm_source"), "jev-case");
  assert.equal(result.searchParams.get("utm_medium"), "website");
  assert.equal(result.searchParams.get("utm_campaign"), "agent-decision-assessment");
});
