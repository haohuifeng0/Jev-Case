#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, validateContentSafety } from "./operations-content-safety.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const businessPath = process.env.BUSINESS_JSON_PATH
  ? path.resolve(process.env.BUSINESS_JSON_PATH)
  : path.join(root, "src/data/business.json");
const operationsDir = process.env.OPERATIONS_DIR
  ? path.resolve(process.env.OPERATIONS_DIR)
  : path.join(root, "docs/operations");

const requiredFiles = [
  "12-week-calendar.md", "README.md", "acceptance.md", "assessment-report.md",
  "case-study-consent.md", "change-control.md", "contact-safety-policy.md", "discovery.md", "faq.md", "kpi.md",
  "lead-tracker.csv", "lead-tracker.md", "outreach-sequences.md", "poc-sow.md", "qualification.md",
];
const templateFiles = requiredFiles.filter((name) => name.endsWith(".md") && name !== "README.md");
const requiredSections = ["Owner", "Inputs", "Outputs", "Timeline", "Exclusions", "Acceptance", "Next action"];
const trackerHeaders = [
  "account_ref", "scenario", "research_status", "qualification_status", "owner_status",
  "timing_status", "input_access_status", "authority_budget_status", "outreach_week",
  "outbound_attempts", "assessment_call_status", "paid_assessment_status", "paid_poc_status",
  "next_action", "notes_redacted",
];

function parseBusiness(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${businessPath}: malformed business JSON: ${error.message}`);
  }
  assert.equal(value.schemaVersion, 1, "unsupported business schemaVersion");
  assert.equal(value.canonicalSource, "src/data/business.json", "stale business source: canonicalSource mismatch");
  for (const id of ["assessment", "poc"]) {
    const service = value.services?.[id];
    assert.ok(service, `services.${id} is required`);
    assert.ok(Number.isInteger(service.price?.amount), `services.${id}.price.amount is required`);
    assert.equal(service.price.currency, "CNY", `services.${id}.price.currency must be CNY`);
    assert.ok(service.timeline?.label, `services.${id}.timeline.label is required`);
  }
  return value;
}

async function loadFiles() {
  const names = (await readdir(operationsDir)).sort();
  for (const name of requiredFiles) assert.ok(names.includes(name), `${name}: missing required operations file`);
  return Promise.all(names.map(async (name) => ({ name, text: await readFile(path.join(operationsDir, name), "utf8") })));
}

function validateTemplateSections(files) {
  for (const name of templateFiles) {
    const file = files.find((candidate) => candidate.name === name);
    for (const section of requiredSections) {
      assert.match(file.text, new RegExp(`^- \\*\\*${section}:\\*\\*\\s*\\S`, "im"), `${name}: missing ${section}`);
    }
  }
}

function validateSensitiveContent(files) {
  const checks = [
    [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, "email address"],
    [/(?:\+?86[- ]?)?\b1[3-9]\d{9}\b/, "mobile number"],
    [/\b(?:sk|api|ghp|github_pat|xox[baprs])[_-][A-Za-z0-9_-]{20,}\b/i, "API key"],
    [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key"],
    [/\bcustomer (?:name|organization)\s*:/i, "customer identity"],
    [/\b(?:customer|private|production) prompt\s*:/i, "private prompt"],
    [/\b(?:ignore|disregard)\s+(?:all\s+)?(?:previous|prior|above)\s+instructions\b/i, "prompt instructions stored as data"],
    [/\b(?:system prompt|developer message)\s*:/i, "private prompt instructions stored as data"],
  ];
  for (const { name, text } of files) {
    for (const [pattern, label] of checks) assert.doesNotMatch(text, pattern, `${name}: prohibited ${label}`);
  }
}

function validateClaims(files) {
  const text = files.map((file) => file.text).join("\n");
  assert.doesNotMatch(text, /\bguarantee(?:d|s|ing)?\b/i, "unsupported assurance language");
  assert.doesNotMatch(text, /\b\d+(?:\.\d+)?%\s+(?:accuracy|saving|faster|better)\b/i, "unsupported benchmark language");
}

function validateCommercialTerms(business, files) {
  const markdown = files.filter(({ name }) => name.endsWith(".md"));
  const allowedPrices = new Set(Object.values(business.services).map(({ price }) => `${price.currency} ${price.amount}`));
  for (const { name, text } of markdown) {
    for (const match of text.matchAll(/\b(CNY)\s+([\d,]+)\b/g)) {
      const normalized = `${match[1]} ${Number(match[2].replaceAll(",", ""))}`;
      assert.ok(allowedPrices.has(normalized), `${name}: inconsistent price ${match[0]}`);
    }
  }
  for (const [serviceId, fileName] of [["assessment", "assessment-report.md"], ["poc", "poc-sow.md"]]) {
    const service = business.services[serviceId];
    const file = files.find(({ name }) => name === fileName);
    const displayPrice = `${service.price.currency} ${service.price.amount.toLocaleString("en-US")}`;
    assert.ok(file.text.includes(displayPrice), `${fileName}: stale business source or inconsistent price; expected ${displayPrice}`);
    assert.match(file.text, new RegExp(service.timeline.label, "i"), `${fileName}: timeline must match ${service.timeline.label}`);
  }
}

function validateLeadTracker(files) {
  const tracker = files.find(({ name }) => name === "lead-tracker.csv");
  const rows = parseCsv(tracker.text);
  assert.deepEqual(rows[0], trackerHeaders, "lead-tracker.csv: headers do not match the privacy-safe template");
  assert.ok(rows.length > 1, "lead-tracker.csv: synthetic rows are required");
  for (const [rowIndex, row] of rows.entries()) {
    assert.equal(row.length, trackerHeaders.length, `lead-tracker.csv:${rowIndex + 1}: wrong column count`);
    if (rowIndex > 0) assert.match(row[0], /^SYN-[A-Z0-9-]+$/, `lead-tracker.csv:${rowIndex + 1}: account_ref must be synthetic`);
  }
}

function validateOperatingRules(files) {
  const outreach = files.find(({ name }) => name === "outreach-sequences.md").text;
  const scenarios = ["model-routing", "tool-skill-selection", "risk-gates", "output-verification"];
  for (const [index, scenario] of scenarios.entries()) {
    assert.match(outreach, new RegExp(`Scenario ${index + 1}: ${scenario}`), `outreach-sequences.md: missing exact ${scenario} sequence`);
  }
  assert.match(outreach, /sent manually|human-sent/i, "outreach must remain human-sent");
  assert.match(outreach, /Do not use bulk sending, automated outreach/i, "outreach must prohibit spam automation");

  const calendar = files.find(({ name }) => name === "12-week-calendar.md").text;
  for (const pattern of [
    /100 named accounts/i,
    /25 outbound attempts; log opt-outs/i,
    /25 outbound attempts; run the zero-qualified-interview rule/i,
    /six assessment calls/i,
    /three paid assessments/i,
    /one paid PoC/i,
    /If qualified interviews are zero at the end of week 8, stop feature development\./,
    /## Week-12 review/,
  ]) assert.match(calendar, pattern, `12-week-calendar.md: missing operating rule ${pattern}`);
}

const businessText = await readFile(businessPath, "utf8");
const business = parseBusiness(businessText);
const files = await loadFiles();
validateTemplateSections(files);
validateSensitiveContent(files);
validateClaims(files);
validateCommercialTerms(business, files);
validateContentSafety(files);
validateLeadTracker(files);
validateOperatingRules(files);

console.log(JSON.stringify({
  status: "PASS",
  files: files.length,
  templates: templateFiles.length,
  checks: ["required-files", "required-sections", "privacy-and-secrets", "prompt-injection", "commercial-terms", "claims", "content-safety", "lead-tracker", "outreach", "calendar"],
}));
