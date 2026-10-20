# Controlled-document contact safety policy

- **Owner:** Jev Case service operator maintains this finite policy and reviews proposed vocabulary changes.
- **Inputs:** Markdown, CSV, and JSON content in the operations kit after fenced and inline code are excluded from prose evaluation.
- **Outputs:** A deterministic clause-level decision that accepts controlled operating guidance or rejects hazardous outbound instructions.
- **Timeline:** Apply on every `validate:operations` and `test:operations` run before operations content is accepted.
- **Exclusions:** Automated customer contact is prohibited. Statistical classifiers, external services, inferred target vocabularies, and intent models are outside this policy.
- **Acceptance:** The repository matrix covers every listed category and prohibition form, canonical documents pass, and any policy expansion adds failing fixtures first.
- **Next action:** Keep wording inside this finite contract or add a reviewed matrix case before changing the classifier.

## Finite contract

1. Normalize case, Unicode dash variants, underscores, slashes, and punctuation before token classification.
2. Split sentences and contrast or sequence boundaries at punctuation and `but`, `however`, `yet`, and `then`.
3. Evaluate coordinated segments around `and` separately. Unsafe modifier context may establish a hazard across the full coordinated clause, but a prohibition applies only to the segment that contains it.
4. Outbound action stems are `contact`, `email`, `mail`, `message`, `DM`, `outreach`, `reach`, and `send`.
5. Unsafe modifier stems are `auto`, `automat`, `bulk`, `mass`, `scrap`, and `harvest`.
6. A clause is hazardous when it contains an outbound action and an unsafe modifier. No target noun is required or inferred.
7. `generate`, `analyze`, `store`, `archive`, and `export` applied to reports, data, or evidence are non-outbound. If an outbound action also appears, the clause is hazardous.
8. Accepted clause-local prohibitions are `do not`, `never`, `must not`, `must be human-sent`, `without automated contact`, `is prohibited`, `is forbidden`, `is not permitted`, and `no ... permitted`.
9. A safe segment does not make a neighboring hazardous segment safe. Repeat the explicit prohibition for every coordinated hazardous segment.

## Controlled examples

- Reject `Use automation and email prospects.`
- Reject `Automatically email the assessment report to the private archive.`
- Reject `Do not auto-email leads and mass-message companies.` because the second hazardous segment has no prohibition.
- Accept `Do not auto-email leads and do not mass-message companies.`
- Accept `Automated outreach is prohibited and bulk email is forbidden.`
- Accept `Automatically generate reports and archive evidence.`
