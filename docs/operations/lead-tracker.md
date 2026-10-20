# Privacy-safe lead tracker template

- **Owner:** Jev Case service operator in the approved private Feishu workspace or CRM.
- **Inputs:** Public account-level research, synthetic account reference, scenario fit, canonical qualification conditions, aggregate activity, and next action.
- **Outputs:** A minimized pipeline record and aggregate KPI counts without repository-stored contact or customer data.
- **Timeline:** Update after each human action; review weekly and remove records under the private workspace retention policy.
- **Exclusions:** Real records in this repository, names, email addresses, mobile numbers, credentials, customer prompts, private datasets, sensitive traits, and spreadsheet formulas.
- **Acceptance:** The repository CSV has exactly the approved headers and synthetic rows whose `account_ref` starts with `SYN-`; working copies remain private.
- **Next action:** Copy the template into the approved private system, assign a synthetic internal reference, and keep identifying/contact fields in that system only.

## Approved headers

`account_ref,scenario,research_status,qualification_status,owner_status,timing_status,input_access_status,authority_budget_status,outreach_week,outbound_attempts,assessment_call_status,paid_assessment_status,paid_poc_status,next_action,notes_redacted`

Never add name, organization name, email, phone, prompt, secret, or raw customer-input columns. Prefix text that could begin with `=`, `+`, `-`, or `@` with a safe apostrophe in the private system.
