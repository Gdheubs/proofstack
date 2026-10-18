# Controlled-beta baseline checkpoint — 2026-10-18

## Scope

This checkpoint resumes from `18674ec` (`Remove Replit deployment scaffolding`).
It adds a safe, non-deploying deployment baseline for the intended Vercel,
Render, Supabase, and GitHub layout.

## Changes

- Added `render.yaml` for the API service with a health check, explicit
  production bind settings, and secret-only placeholders.
- Added `docs/deployment.md`, a controlled-beta configuration, verification,
  and rollback runbook.
- Added `docs/production-plan.md`, which converts the risk register into
  independently verifiable release chunks.
- Made two source-policy tests normalize CRLF input so the same assertions
  work on Windows and Linux checkouts.

## Local evidence

- `pnpm install --frozen-lockfile --ignore-scripts` completed successfully.
- TypeScript build/type checks and ESLint completed successfully.
- `vitest run --exclude '**/*.integration.test.ts'` passed: 44 files and 615
  tests.
- `node artifacts/api-server/build.mjs` completed successfully.
- `next build` completed successfully in `artifacts/proofstack` with
  `NODE_ENV=production` and `API_INTERNAL_ORIGIN=http://127.0.0.1:8080`.

## Deliberate beta restrictions

Uploads, native Git hosting, and worker-dependent features remain disabled for
the free-tier beta. The current object-storage code still requires replacement
with a durable Supabase Storage implementation before those features can be
enabled.

## Release gates still open

- Configure provider projects and their secrets outside the repository.
- Push the release commit and verify hosted GitHub Actions.
- Rehearse migrations, backup/recovery, authentication, authorization, and
  privacy/retention flows against a fresh Supabase staging project.
- Complete the P1 storage, credential lifecycle, privacy, AI-consent, and
  operational controls listed in `docs/production-readiness-risk-register.md`.

## Tooling note

Git for Windows currently reports `fatal: this operation must be run in a work
tree` for `git status` and `git diff`, even though `git rev-parse
--is-inside-work-tree` reports `true` and read-only revision commands work.
No reset, checkout, staging, or commit was attempted while this inconsistency
is unresolved. The working tree must be revalidated before this checkpoint is
committed.
