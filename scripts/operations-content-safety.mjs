import assert from "node:assert/strict";

function isAutomation(token) {
  return token === "auto" || token.startsWith("automat");
}

function isScale(token) {
  return token === "bulk" || token === "mass";
}

function isSource(token) {
  return token.startsWith("scrap") || token.startsWith("harvest");
}

function isContactAction(token) {
  return token === "dm" || ["contact", "email", "mail", "messag", "outreach", "reach", "send"].some((stem) => token.startsWith(stem));
}

export function splitProseClauses(text) {
  return text
    .split(/(?:[;.!?\n]+|,?\s+\b(?:but|however|yet|then)\b\s+)/i)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

export function normalizeClause(clause) {
  return clause
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll(/[‐‑‒–—―_\\/]+/g, " ")
    .replaceAll(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function hasSequence(tokens, sequence) {
  return tokens.some((_, index) => sequence.every((token, offset) => tokens[index + offset] === token));
}

function hasScopedProhibition(tokens) {
  if (hasSequence(tokens, ["must", "be", "human", "sent"])) return true;
  if (hasSequence(tokens, ["is", "prohibited"])) return true;
  if (hasSequence(tokens, ["is", "forbidden"])) return true;
  if (hasSequence(tokens, ["is", "not", "permitted"])) return true;
  const noIndex = tokens.indexOf("no");
  if (noIndex >= 0 && tokens.slice(noIndex + 1).includes("permitted")) return true;
  for (const [index, token] of tokens.entries()) {
    if (token !== "without") continue;
    const scope = tokens.slice(index + 1, index + 5);
    if (scope.some(isAutomation) && scope.some(isContactAction)) return true;
  }

  const markerEnds = [];
  for (const [index, token] of tokens.entries()) {
    if (token === "never") markerEnds.push(index);
    if (token === "do" && tokens[index + 1] === "not") markerEnds.push(index + 1);
    if (token === "must" && tokens[index + 1] === "not") markerEnds.push(index + 1);
  }
  return markerEnds.some((index) => {
    const scopedToken = tokens[index + 1];
    if (!scopedToken) return false;
    if (["use", "deploy", "enable", "start", "allow", "authorize", "permit"].includes(scopedToken)) {
      return tokens.slice(index + 2, index + 6).some((token) => isAutomation(token) || isScale(token) || isSource(token));
    }
    return isAutomation(scopedToken) || isScale(scopedToken) || isSource(scopedToken) || isContactAction(scopedToken);
  });
}

export function classifyContactClause(clause, inheritedModifier = false) {
  const tokens = normalizeClause(clause);
  const categories = {
    automation: tokens.some(isAutomation),
    scale: tokens.some(isScale),
    source: tokens.some(isSource),
    action: tokens.some(isContactAction),
  };
  const hazardous = categories.action
    && (inheritedModifier || categories.automation || categories.scale || categories.source);
  return { categories, hazardous, prohibited: hazardous && hasScopedProhibition(tokens) };
}

export function findUnsafeContactClauses(text) {
  const unsafe = [];
  for (const clause of splitProseClauses(text)) {
    const full = classifyContactClause(clause);
    const modifier = full.categories.automation || full.categories.scale || full.categories.source;
    const segments = clause.split(/\s+\band\b\s+/i).map((segment) => segment.trim()).filter(Boolean);
    for (const segment of segments) {
      const result = classifyContactClause(segment, modifier);
      if (result.hazardous && !result.prohibited) unsafe.push(segment);
    }
  }
  return unsafe;
}

export function parseCsv(text, source = "CSV") {
  const rows = [];
  for (const line of text.trimEnd().split(/\r?\n/)) {
    const cells = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"' && quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) {
        cells.push(cell);
        cell = "";
      } else cell += char;
    }
    assert.equal(quoted, false, `${source}: malformed quoted field`);
    cells.push(cell);
    rows.push(cells);
  }
  return rows;
}

function isFormulaValue(value) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("`") || /^:?(?:-{3,}|\*{3,}|_{3,}):?$/.test(trimmed)) return false;
  return /^[=+@-](?=\S)/.test(trimmed);
}

function assertSafeInstruction(value, source) {
  const text = value.replaceAll(/`[^`]*`/g, "");
  assert.equal(
    findUnsafeContactClauses(text).length,
    0,
    `${source}: prohibited automated mass-contact instruction`,
  );
}

function validateMarkdown(file) {
  let fenced = false;
  for (const [index, line] of file.text.split(/\r?\n/).entries()) {
    if (/^\s*(?:```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const source = `${file.name}:${index + 1}`;
    assert.equal(isFormulaValue(line), false, `${source}: spreadsheet formula injection`);
    if (line.includes("|")) {
      for (const cell of line.split("|")) {
        assert.equal(isFormulaValue(cell), false, `${source}: spreadsheet formula injection`);
      }
    }
    assertSafeInstruction(line, source);
  }
}

function validateJsonValue(value, source) {
  if (typeof value === "string") {
    assert.equal(isFormulaValue(value), false, `${source}: spreadsheet formula injection`);
    assertSafeInstruction(value, source);
    return;
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) validateJsonValue(item, `${source}.${index}`);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) validateJsonValue(item, `${source}.${key}`);
  }
}

export function validateContentSafety(files) {
  for (const file of files) {
    if (file.name.endsWith(".md")) {
      validateMarkdown(file);
      continue;
    }
    if (file.name.endsWith(".csv")) {
      for (const [rowIndex, row] of parseCsv(file.text, file.name).entries()) {
        for (const cell of row) {
          assert.equal(isFormulaValue(cell), false, `${file.name}:${rowIndex + 1}: spreadsheet formula injection`);
          assertSafeInstruction(cell, `${file.name}:${rowIndex + 1}`);
        }
      }
      continue;
    }
    if (file.name.endsWith(".json")) {
      let value;
      try {
        value = JSON.parse(file.text);
      } catch (error) {
        throw new Error(`${file.name}: malformed operations JSON: ${error.message}`);
      }
      validateJsonValue(value, file.name);
    }
  }
}
