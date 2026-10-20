# Project Verification Rubric

## Purpose

Verification records describe public evidence observed on a specific review date. Catalog inclusion is not endorsement, certification, ranking, or a recommendation, and verification does not establish customer-specific accuracy, security, compliance, savings, or production suitability.

## Required Record

Each record identifies one catalog project and includes:

- an ISO `YYYY-MM-DD` review date;
- a direct Jev-call check;
- a runnable-check result and a public-demo result;
- license, documentation-depth, and maintenance-signal checks;
- reviewer notes describing limits, failures, or unavailable evidence;
- HTTPS evidence labels and URLs bound to an immutable 40-character Git commit revision.

Accepted evidence URLs are limited to exact public GitHub structures: `github.com/<owner>/<repo>/blob/<revision>/...`, `github.com/<owner>/<repo>/tree/<revision>/...`, `github.com/<owner>/<repo>/commit/<revision>`, and `raw.githubusercontent.com/<owner>/<repo>/<revision>/...`. The declared revision must occupy that path segment; query strings, fragments, branch names, mismatched revisions, credentials, and other hosts are rejected. No non-GitHub immutable evidence form is currently accepted.

Evidence labels and reviewer notes are untrusted text. They are rendered as text, never interpreted as instructions or markup.

## Derived Status

- `verified`: direct Jev-call evidence passes, and either a runnable check or public demo passes.
- `limited`: direct Jev-call evidence passes, neither runnable check nor public demo passes, and neither explicitly fails.
- `unverified`: direct-call evidence is absent or fails, or a runnable check/public demo explicitly fails.

The input status is checked against these rules and cannot override them. License, documentation depth, and maintenance are transparent supporting observations; they do not produce an aggregate score and cannot upgrade the derived status.

## Review Expiry

A review date uses UTC calendar semantics, may equal the current UTC date, and cannot be in the future. A record older than 90 calendar days is presented as `needs recheck`. Expiry does not silently change historical evidence or assert a new status. A new dated review must reassess the current immutable revision and publish a replacement record.

## Corrections and Removal

Maintainers and rights holders may use the repository's public contact route to identify the record, exact disputed statement, immutable replacement evidence, and requested correction. Do not submit credentials, customer data, private prompts, or confidential datasets. Records may be corrected, downgraded, or removed when evidence is inaccessible, attribution is wrong, or a substantiated rights request applies. The review history should remain auditable where legally and ethically appropriate.

## Sponsorship Separation

Payment or sponsorship does not alter evidence requirements, status, catalog order, or editorial conclusions. Sponsored material must be labeled separately and cannot purchase a verification outcome.
