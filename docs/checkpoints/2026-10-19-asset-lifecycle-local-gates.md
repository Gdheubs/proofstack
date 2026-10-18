# Asset lifecycle local-gate repair — October 19, 2026

## Scope

Repair the local full-suite and repository typecheck failures in the active durable asset-lifecycle work. The lifecycle service, schema, SQL migration, and design note were already present in the worktree; they are included with this test repair so the committed tests have their implementation context.

## Changes

- Kept the lifecycle test's `query` spy typed and cast the mock only at the service boundary using `reserveLifecycleUpload`'s parameter type. This avoids `as never` erasing the spy and avoids adding a root `pg` dependency.
- Removed the brittle total-table count from the historical 0011 cleanup migration test. It still compares `asset_cleanup_jobs` against snapshot 0011 and verifies snapshot 0011 differs from 0010 only by that table; later lifecycle schema additions no longer invalidate that historical assertion.
- Included the related asset lifecycle schema, service, SQL migration, journal entry, and design note already in the worktree.

## Validation

- Focused asset tests: 5 passed across 2 files.
- `pnpm test`: 618 passed across 45 files.
- `pnpm typecheck`: passed for libraries, API, frontend, scripts, and tests.
- `pnpm lint`: passed.
- Prettier checks for the changed tests, schema barrel, and checkpoint documents: passed.
- `git diff --cached --check`: passed; only Git line-ending normalization warnings were emitted.
- Gitleaks 8.30.1 archive checksum verified; redacted scan reported 0 findings.
- Database integration/migration application was not run locally.

## Remaining risk and next action

The journal registers `0012_durable_asset_lifecycle.sql`, but `lib/db/drizzle/meta/0012_snapshot.json` is absent. This does not block the checks above, but the Drizzle snapshot/generation chain and actual database migration still need validation before treating this WIP as release-ready. No deployment was performed. Review and commit the related lifecycle work and this checkpoint, verify hosted CI on the exact pushed SHA, then generate/validate the migration snapshot and run database-backed migration tests before enabling the storage flow.
