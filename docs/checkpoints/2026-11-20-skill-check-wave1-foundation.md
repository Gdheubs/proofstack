# Skill Check Wave 1: media/social schema and API foundation

Date: 2026-11-20. Status: verified on published commit `c4021846c43cb2f13e42682a556cce7ba837df1c`; hosted ProofStack CI and ProofStack Security both pass. No migration was applied to a hosted database and no deployment was performed.

## Scope

This slice implements the DB-2 media/social schema and FND-1 module readiness, crypto, and account-data foundation from `docs/skill-check-platform.md`. It is an enabling foundation, not the user-facing authoring, assignment, candidate, recruiter, or social experience.

## Changed areas

- Adds Drizzle migration `0023_media_social` with media ownership, upload/ticket metadata, processing and cleanup state, social posts, post/media ordering, and supporting indexes/constraints.
- Adds media/social module exports and pins the schema inventory in the existing tests.
- Adds fail-closed readiness middleware with feature flags, required environment configuration, fresh media-processor heartbeat checks for recorded and voice modes, and expected trigger attachment/enabled-state checks.
- Adds skill key-ring encryption and bound attempt/ticket verification helpers.
- Extends account export rules and refuses exports exceeding 5,000 rows; account deletion checks media readiness and queues owned media cleanup before user cascades.
- Adds `.env.example` safe-off feature defaults and mounts module readiness after the core schema guard.
- Follow-up after hosted CI: puts module schema warming after the global rate limiter. This prevents unauthenticated requests from triggering schema probe queries before request protection and restores the malformed-body rate-limit behavior.
- Adds focused DB, readiness, crypto, export, and core-only tests.

## Validation

- `tsc --build`: passed.
- ESLint on changed API, DB, and test files: passed.
- Prettier check on changed code and tests: passed.
- Core-only Vitest suite: 73 passed across 2 files.
- Embedded database integration suite: 201 passed, 2 skipped across 30 files (29 passed, 1 skipped), including PGlite migration replay.
- Focused DB-2 PGlite test: 5/5 passed; FND-1 focused unit and integration checks also passed during implementation.
- `git diff --check`: passed.
- After the CI-discovered middleware-order fix, `tests/api.test.ts`: 12/12 passed; `tsc --build`, ESLint, Prettier, and `git diff --check`: passed.
- Hosted `ProofStack CI` run `44674126889`: passed on `c4021846c43cb2f13e42682a556cce7ba837df1c`, including migration idempotency, codegen, audit, lint, formatting, typecheck, coverage and full tests, PostgreSQL 17 backup/restore, API build/health, Worker build and size gate.
- Hosted `ProofStack Security` run `44674127078`: passed on the same commit.

## Remaining gates and limits

- Initial hosted CI `44673787246` failed in the existing API boundary test because module warming consumed the test's first mocked DB response before the limiter. The middleware order was corrected; both hosted workflows passed on the follow-up commit.
- CI ran the repository's native PostgreSQL 17 migration and backup/restore drill on its disposable CI database. A hosted application database has not been migrated.
- `/auth/context` keeps the existing object-valued `capabilities` contract consumed by the web client. The separate per-area `features` map described in the platform spec remains an additive API contract task; changing the current shape here would break existing clients.
- Migration 0023 is not applied to any hosted environment. Platform feature flags remain off by default. Recording, AI evaluation, and voice features must remain disabled until consent text is published, required infrastructure is configured, and operational/legal acceptance is complete.
- Current platform API route families remain feature-off stubs; this checkpoint does not claim a complete Skill Check platform or security perfection.

## Next safe action

Proceed to DB-3 (assessment attempts/leases and immutable snapshots), then add the compatible auth-context `features` field before starting the end-user Skill Check Studio.
