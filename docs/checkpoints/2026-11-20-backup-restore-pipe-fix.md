# CI backup and restore pipe fix (2026-11-20)

Parent: `4b67ad6` (navigation inventory follow-up).

## Finding and fix

Hosted CI for `4b67ad66a7f8f22e0f3977f509ece53ffc324f10` passed dependency
audit, lint, formatting, typecheck, coverage tests, database integration and
migration idempotency. It then failed the backup/restore drill while restoring
the PostgreSQL 17 dump.

The restore script used `pg_restore --list ... | grep -q` under `set -o
pipefail`. `grep -q` closed the pipe on its first match; `pg_restore` exited
with a broken pipe, making the condition false and skipping removal of the
empty database's default `public` schema. The archive then failed to recreate
that schema. The detection now reads the full listing before matching, so the
pipe remains open until `pg_restore` exits normally.

## Validation

- Git Bash `-n scripts/restore-database.sh`: passed.
- `git diff --check`: passed.
- Hosted CI on the parent passed all checks through the database integration
  suite and failed only in the backup/restore drill. Hosted Security passed,
  including secret scan and CodeQL.
- The PostgreSQL 17 backup/restore drill must be rerun by CI for this fix.
  No database migration, local database restore, or deployment was performed.

## Exact next step

Read CI and Security for the commit containing this fix. Then resume WIRE-1 by
adding the new Skill Check API contracts and generated clients.
