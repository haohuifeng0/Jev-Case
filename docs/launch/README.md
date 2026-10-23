# Launch readiness

The default production URL is exactly `https://haohuifeng0.github.io/Jev-Case/`. A custom domain remains supported by setting `PUBLIC_SITE_URL` to the HTTPS origin and `PUBLIC_BASE_PATH=/`.

## Required external settings

Environment approval must be configured in GitHub repository settings before production use. A repository administrator must configure the public repository variable `PUBLIC_ASSESSMENT_FORM_URL` and add required reviewers to the `github-pages` environment. This repository documents that external setting but does not change it. Keep Pages source set to GitHub Actions.

Pull requests build and upload an artifact for inspection only. They never run the deploy job. Pushes to protected `main` and manual `workflow_dispatch` runs may reach the deploy job only after the configured `github-pages` approval.

## Dry run

Do not deploy while preparing launch evidence. From a clean checkout, run:

```bash
PUBLIC_SITE_URL=https://haohuifeng0.github.io \
PUBLIC_BASE_PATH=/Jev-Case/ \
PUBLIC_ASSESSMENT_FORM_URL=https://wenjuan.feishu.cn/m/cfm?assessment_form_id=fixture \
LAUNCH_AS_OF=2026-10-21 LAUNCH_REQUIRE_CLEAN=true npm run launch:dry-run
```

The command validates configuration and data, checks catalog cadence and verification expiry, builds every route, proves sitemap/canonical equality, generates a 12-row weekly KPI template, and writes `launch-artifacts/manifest.json` plus `launch-artifacts/manifest.sha256`. It performs no upload and must print `PASS` only after all checks complete.

## Launch checklist

- Confirm branch protection is enabled for `main` outside this repository.
- Confirm required reviewers are configured for the `github-pages` environment.
- Confirm the form repository variable is present and opens the intended Feishu form.
- Review the expiry and catalog cadence reports; do not waive stale records silently.
- Review the immutable manifest checksum and the full desktop/mobile Playwright smoke result.
- Obtain human approval before any deployment or outreach.
