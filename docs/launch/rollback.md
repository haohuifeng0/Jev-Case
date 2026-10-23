# GitHub Pages rollback

Rollback means redeploying a prior immutable Pages artifact or rebuilding the exact prior commit SHA. Never describe a green workflow alone as proof that the expected content is live.

1. Stop new production approvals and record the affected deployment URL, workflow run, commit SHA, and manifest checksum.
2. Select the last known-good artifact whose `manifest.json`, `manifest.sha256`, source commit SHA, site URL, and base path were reviewed.
3. Prefer GitHub's retained prior immutable Pages artifact when the platform permits rerun/redeploy. Otherwise check out the exact prior commit SHA, use the same documented environment contract, and run `npm ci && npm run launch:dry-run` before approving deployment.
4. Compare the generated checksum and canonical/sitemap set with the retained evidence. A successful command without matching content is not a successful rollback.
5. A human reviewer approves the `github-pages` environment deployment. This runbook does not bypass environment protection.
6. Verify the home, one scenario, one project, one case, service CTA, sitemap, and canonical host/base. Record the new workflow run and rollback source SHA.

Do not change DNS during an application rollback. If the retained artifact or exact source commit is unavailable, pause and escalate rather than deploying an unverified reconstruction.
