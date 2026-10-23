# Verification expiry review

Verification records need recheck when their review date is more than 90 days before the report date. Generate the report with `LAUNCH_AS_OF=YYYY-MM-DD npm run report:verification-expiry`.

1. Treat each `expired: true` result as `needs recheck` in launch review; do not silently preserve a current-looking claim.
2. Re-run the documented rubric against immutable public evidence and record a new review date only after the evidence is inspected.
3. If evidence is unavailable or weaker, retain the project and lower its truthful status as required by the rubric.
4. Run validation, build, metadata, and smoke checks after record changes.
5. Archive the expiry report with the launch manifest. The report contains project IDs and aggregate evidence state, never customer data.

Malformed dates, future review dates, and unsupported dataset schemas fail closed.
