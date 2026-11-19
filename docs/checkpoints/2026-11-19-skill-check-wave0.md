# Skill Check platform, Wave 0 wiring (2026-11-19)

Parent: `a06a2ff` (`docs: Skill Check platform specification and build plan`).
Status: **work in progress**. The Skill Check specification remains the source
of truth; this checkpoint does not approve a migration or enable any feature.

## Scope

Continued the spec's Wave 0 foundation in DB-1 and WIRE-1. The working tree at
the start already contained the additive migration 0022, module schema barrel,
export-policy registry, placeholder routes/pages, media CSP helper, exam chrome
guards, and focused test/config files. This task connected the shared runtime
and package wiring that those files depend on.

## Changes in this task

- Mounted the 14 placeholder API routers. Added request-size parsers for
  attempts, authoring and education; kept provider hook bodies raw and capped;
  allowed attempt writes during maintenance so an active attempt can finish.
- Connected configured media origins to the CSP while preserving the existing
  policy when origins are blank; added the three optional browser origins to
  `.env.example`.
- Reserved `/verify`, `/shorts` and `/topics` in route ownership and handle
  validation; grouped their navigation paths under Skills/Home.
- Exposed `@workspace/db/modules` and changed frozen table-count expectations
  to 66 (the 54 core tables plus the 12 tables in migration 0022).
- Added the core-only Vitest command and HLS playback dependency.
- Replaced the Unix-shell-only `preinstall` command with a Node script so
  Windows installs can enforce pnpm and remove competing lockfiles.

## Validation actually run

- `pnpm exec prettier --write ...` on the touched TypeScript/JSON files: exited
  successfully.
- `pnpm typecheck`: passed across libraries, API, frontend, scripts and tests.
- `pnpm lint`: passed.
- `pnpm install --lockfile-only --frozen-lockfile --offline`: passed; all 10
  workspace projects were already up to date.
- `git diff --cached --check`: passed.
- Redacted staged-diff scan for common AWS/GitHub/Stripe/Slack token prefixes,
  private-key headers, JWT-shaped tokens and populated credential assignments:
  zero hits. `.env.example` is the only environment file staged.
- `pnpm --filter @workspace/proofstack add hls.js` resolved HLS 1.7.4 and wrote
  the lockfile, then failed at the old `preinstall` because Windows has no
  `sh`. The preinstall script was made cross-platform afterward. The frozen
  lockfile install above passed with the repaired script.

No test suite, database migration, browser session, deployment, or hosted CI was
run for this checkpoint. The typecheck and lint results do not substitute for
the DB-1 and WIRE-1 acceptance gates below.

## Remaining gates and risks

- DB-1: run the trigger/cascade PGlite capability test; assert all new CHECK
  and partial-unique constraints; prove the original schema readiness check
  remains ready without module tables; rehearse 0022 twice on disposable
  PostgreSQL 17 and confirm the generated snapshot.
- WIRE-1: add the 14 API contract specs and regenerate clients, include every
  new route in cross-site/forged-identity checks, complete navigation/address
  ownership assertions, and record the Cloudflare header behavior for exam
  routes.
- Audit all new UI/API routes against the spec and run the focused and full
  acceptance suites before calling Wave 0 complete.
- This is an intentional WIP checkpoint, not a verified or release-ready
  change. No production or staging database was changed, and no feature was
  deployed or enabled.

## Exact next step

Implement the WIRE-1 API contract stubs from section 12 of
`docs/skill-check-platform.md`, register them in OpenAPI, regenerate the Zod and
React clients, then add the shared route coverage loops. After Wave 0 passes its
local acceptance gates, proceed to DB-2 (migration 0023) and FND-1.
