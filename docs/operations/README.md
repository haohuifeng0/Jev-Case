# One-person operations kit

These files are reusable sales and delivery templates for a human operator. They do not authorize automated outreach, customer contact, or storage of lead data in this repository.

Canonical prices, timelines, exclusions, and metric definitions come from [`src/data/business.json`](../../src/data/business.json). Real account research, contact details, customer inputs, and delivery artifacts belong only in the approved private Feishu workspace or CRM.

## Workflow

1. Research and qualify an account with `qualification.md` and a private copy of `lead-tracker.csv`.
2. A human sends the relevant sequence from `outreach-sequences.md` after account-specific review.
3. Run `discovery.md`, then use `assessment-report.md` for a paid assessment.
4. Use `poc-sow.md`, `acceptance.md`, and `change-control.md` only when the assessment supports a bounded PoC.
5. Track aggregate, non-identifying counts with `kpi.md` and review the operating cadence in `12-week-calendar.md`.

Run `npm run test:operations` before changing this kit.
