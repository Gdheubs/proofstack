# Asset lifecycle local-gate repair — October 19, 2026

## Scope

Repair the local full-suite and repository typecheck failures in the active durable asset-lifecycle work. The lifecycle service, schema, SQL migration, and design note were already present in the worktree; they are included with this test repair so the committed tests have their implementation context.

## Changes

- Kept the lifecycle test's `query` spy typed and cast the mock only at the service boundary using `reserveLifecycleUpload`'s parameter type. This avoids `as never` erasing the spy and avoids adding a root `pg` dependency.
- Removed the brittle total-table count from the historical 0011 cleanup migration test. It still compares `asset_cleanup_jobs` against snapshot 0011 and verifies snapshot 0011 differs from 0010 only by that table; later lifecycle schema additions no longer invalidate that historical assertion.
- Updated the SQL migration and preflight integration expectations to the 49-table schema.
- Added the Drizzle-generated 0012 snapshot with `prevId` pointing to snapshot 0011, completing the journal snapshot chain.
- Included the related asset lifecycle schema, service, SQL migration, journal entry, and design note already in the worktree.

## Validation

- Focused asset tests: 5 passed across 2 files.
- `pnpm test`: 618 passed across 45 files after all changes.
- `pnpm typecheck`: passed for libraries, API, frontend, scripts, and tests after all changes.
- `pnpm lint`: passed after all changes.
- Targeted embedded PGlite suites for asset cleanup and schema preflight: 18 passed across 2 files, including application of all tracked SQL migrations.
- Full embedded PGlite run: 188 passed and 1 unrelated repository concurrency/recovery test timed out at 15 seconds. The package script's POSIX environment syntax does not run directly in PowerShell; the equivalent command with a temporary PowerShell environment variable was used.
- Prettier checks for all changed lifecycle sources, schema, snapshot, tests, and checkpoint: passed.
- `git diff --check`: passed; only Git line-ending normalization warnings were emitted.
- Gitleaks 8.30.1 archive checksum verified; redacted scan reported 0 findings.
- Native PostgreSQL migration/integration was not run locally because `DATABASE_URL` is not configured; PGlite applied all tracked migrations and passed the targeted suites.

## Remaining risk and next action

The missing 0012 snapshot is now generated from the current schema and links to snapshot 0011. The full embedded suite retains one unrelated repository timeout; native PostgreSQL validation still depends on a disposable database. No deployment was performed. Stage and review the final snapshot/integration changes and checkpoint, commit/push this lifecycle work, and verify hosted CI on the exact pushed SHA before enabling the storage flow.
