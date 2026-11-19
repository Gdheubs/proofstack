# Next.js audit remediation (2026-11-19)

Parent: `97f2a79` (Skill Check platform Wave 0 WIP).

## Finding and fix

GitHub CI for `97f2a79fa7c3f04807371400b29beb3e69961408` failed its dependency
audit. GitHub Security passed. The failed audit identified four moderate
Next.js advisory paths (two ignored by the existing policy) because the
lockfile resolved Next.js 16.4.2. The maintainer advisories mark versions
through 16.4.4 as affected.

Updated the frontend's minimum Next.js version to 16.4.5 and refreshed the
lockfile. The existing range excludes the affected versions and keeps the
runtime patch level explicit in `artifacts/proofstack/package.json`.

## Validation

- `pnpm audit --audit-level moderate`: passed (two moderate advisories remain
  ignored by existing policy; no active finding failed the threshold).
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- No test suites, database migration, browser acceptance, or deployment were
  run. This dependency change does not enable the Skill Check features.

## Exact next step

Read the hosted CI result for this remediation commit, then continue WIRE-1:
define the Skill Check API contract files, register them in OpenAPI, regenerate
the clients, and add the shared route coverage loops. Keep the owner decisions
listed in section 15 of the platform specification open until public launch.
