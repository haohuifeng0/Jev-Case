# Catalog refresh cadence

Review the pinned `awesome-jev` catalog at least every 30 days and before each production launch. Run `LAUNCH_AS_OF=YYYY-MM-DD npm run catalog:cadence`; a stale review, source commit mismatch, or checksum mismatch blocks readiness.

1. Review upstream changes without changing the production build's offline behavior.
2. Import only an exact commit and expected SHA-256 using the existing maintainer import command.
3. Run data, catalog, project, scenario, verification, and build checks.
4. Update `docs/launch/catalog-refresh.json` only after the new commit/checksum and generated pages are reviewed.
5. Preserve the prior source pin and dry-run manifest so rollback remains possible.

The production Astro build must never fetch the catalog or read a sibling checkout at runtime.
