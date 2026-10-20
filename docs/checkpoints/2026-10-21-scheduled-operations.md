# Scheduled operations: image cleanup and database backups — October 21, 2026

Parent: `94d7a0d` (markdown-it 14.3.3 override). Hosted [ProofStack CI](https://github.com/Gdheubs/proofstack/actions/runs/39508569612) and [ProofStack Security](https://github.com/Gdheubs/proofstack/actions/runs/39508569509) passed on `94d7a0d`, closing the CI failure recorded for `1f36b46`.

## Scope

Render Free has no background workers and Supabase Free has no backups. Add a run-once cleanup mode and scheduled GitHub Actions for image cleanup and encrypted nightly database backups to R2, with a restore script and a CI restore drill.

## Changes

- `services/asset-cleanup-runtime.ts`: `drainAssetCleanup` processes due jobs until none remain, 500 jobs or 8 minutes; keeps the 120-second per-job deadline and, like the supervisor, exits without draining the pool after a deadline. `asset-cleanup-worker.ts --once` uses it; npm script `worker:asset-cleanup:once`.
- `scripts/backup-database.sh`: `pg_dump` 17 custom-format dump of `public`, `auth` (Supabase identities) and `drizzle` (migration ledger); refuses archives missing `public.users`, the migration ledger or below 40 tables; GPG AES-256 symmetric encryption with the passphrase passed on a file descriptor; uploads to `s3://$BACKUP_BUCKET/database/` via the AWS CLI against R2, or keeps the file locally when no bucket is set.
- `scripts/restore-database.sh`: decrypts and restores into an **empty** database only (refuses any target with tables), in one transaction, and reports table and migration counts.
- `.github/workflows/operations.yml`: schedule (`17 */6 * * *` cleanup, `41 20 * * *` backup) and manual dispatch only; `contents: read`; both jobs in the `production` environment with timeouts and `persist-credentials: false`; secrets only as step environment values; actions pinned to the same commits as CI.
- `.github/workflows/ci.yml`: after `test:all`, installs the PostgreSQL 17 client from the signed PGDG repository and runs a backup-and-restore drill with a throwaway passphrase: backup, restore into a new database, compare table/migration/user counts, then confirm a second restore into the populated database is refused. No secrets are used.
- `tests/ci-workflows.test.ts`: new policy test for `operations.yml` (triggers, permissions, environment, timeouts, secret placement, no echo of expressions); mutation-checked by temporarily adding a `pull_request` trigger and a secret inside `run:`, each of which failed the test.
- `docs/operations.md`: environment variables/secrets table, cadence and minutes rationale, separate backup bucket and 30-day lifecycle rule, restore procedure.

Cleanup runs every 6 hours instead of the planned hourly: an hourly install+build job would use most of the private repository's 2,000 free Actions minutes per month.

## Validation (local)

- `tests/asset-cleanup-runtime.test.ts`: 5 new run-once cases (drain then close, job budget, sanitized failure stop, abort, stuck job fails closed without awaiting the pool); 25 passed with the existing supervisor cases.
- Workflow YAML parsed with js-yaml (jobs, triggers and step counts as intended); `tests/ci-workflows.test.ts` 7 passed.
- `bash -n` syntax check of both scripts. They could not be executed locally: no PostgreSQL or passwordless sudo is available on this machine; the CI drill is their first real execution.
- `pnpm run typecheck`, `pnpm lint` passed. Unit tests: 721 passed (51 files). Embedded integration: 190 passed, 2 skipped.

## Remaining risks

- The scheduled jobs have never run against real Supabase/R2; they require the `production` environment configuration in `docs/operations.md`.
- Supabase must stay on PostgreSQL 17 or lower for the pinned `pg_dump` 17 client.
- Restoring Supabase `auth` into a different project is not covered by the script.
- Recovery point is up to 24 hours; images are not backed up separately.

## Next step

Task 7: run the frontend on Cloudflare Workers with OpenNext, starting with a compatibility check of Next 16 and `proxy.ts`.
