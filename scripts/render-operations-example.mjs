#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const operationsDir = process.env.OPERATIONS_DIR
  ? path.resolve(process.env.OPERATIONS_DIR)
  : path.join(root, "docs/operations");
const businessPath = process.env.BUSINESS_JSON_PATH
  ? path.resolve(process.env.BUSINESS_JSON_PATH)
  : path.join(root, "src/data/business.json");

const [qualification, assessment, poc, businessText] = await Promise.all([
  readFile(path.join(operationsDir, "qualification.md"), "utf8"),
  readFile(path.join(operationsDir, "assessment-report.md"), "utf8"),
  readFile(path.join(operationsDir, "poc-sow.md"), "utf8"),
  readFile(businessPath, "utf8"),
]);
const business = JSON.parse(businessText);

for (const [name, template] of [["qualification", qualification], ["assessment", assessment], ["PoC", poc]]) {
  assert.match(template, /\*\*Owner:\*\*/i, `${name} template has no owner`);
  assert.match(template, /\*\*Acceptance:\*\*/i, `${name} template has no acceptance rule`);
}

const rendered = {
  account_ref: "SYN-RENDER-001",
  scenario: "risk-gates",
  narrative: "qualification → assessment → PoC",
  stages: [
    { stage: "qualification", outcome: "qualified", evidence: "all five rubric conditions marked yes" },
    { stage: "assessment", outcome: "consider PoC", price: `CNY ${business.services.assessment.price.amount.toLocaleString("en-US")}`, timeline: business.services.assessment.timeline.label },
    { stage: "PoC", outcome: "draft SOW", price: `CNY ${business.services.poc.price.amount.toLocaleString("en-US")}`, timeline: business.services.poc.timeline.label, decision_nodes: business.services.poc.decisionNodeLimit },
  ],
  privacy: "synthetic references only; no contact details or customer inputs",
};

console.log(JSON.stringify({ status: "PASS", rendered }));
