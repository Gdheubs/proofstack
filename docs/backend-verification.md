# Backend checkpoint verification

## Verdict

This is a verified backend hardening checkpoint, NOT a completed production release. Backend stage remains active. Database/UI/security-compliance release gates remain pending. The authoritative working repository is `C:/Users/ithes/proofstack`; the source ZIP was not modified.

## Changes exercised

| Audit item | Implemented behavior                                                                                                                                                                      | Regression evidence                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| F17        | Release version tags use the same Git-safe ref schema as ref synchronization; invalid `.lock` prereleases and overlong refs rejected                                                      | `tests/pull-input.test.ts`, including real `git check-ref-format`                                        |
| F18        | Legacy privileged membership changes require target verified native MFA, count active owners, enforce membership-management grants and 500-member cap, and revoke sessions on role change | `tests/organization-role-policy.integration.test.ts`; equivalent legacy/community cases                  |
| F19        | Direct image fallback excludes project references owned by disabled users                                                                                                                 | `tests/asset-visibility.integration.test.ts`; denial before object lookup                                |
| F20        | Anonymous actions and OAuth starts have per-IP budgets; named-account budgets remain shared across IPs                                                                                    | `tests/auth-limits.test.ts`; real SQL limiter and route/action dispatch, external OAuth transport mocked |
| F21        | Existing Git read tokens fail while user recovery lockdown is set or the user is disabled                                                                                                 | `tests/repositories.integration.test.ts`, including real HTTP Git transport                              |
| F24        | Editing/deleting another contributor's project entry goes through existing grant-aware project edit authorization                                                                         | `tests/project-entry-permissions.integration.test.ts`                                                    |

Red-capable regressions reproduced defects before their fixes. The initial combined unit run with newly added regressions failed on invalid release refs and anonymous-rate isolation; targeted runs also reproduced OAuth sharing, disabled-owner asset access, disabled-owner counting, missing session revocation, quota bypass, revoked actor-grant bypass, and role-only entry deletion. Independent final patch review returned valid JSON with `passed: true` and empty security/logic concern arrays. This is a narrow code review, not an application-wide security assessment; positive/failure-path tests were added and the complete suite rerun.

## Executed quality gates

Runtime: verified Linux x64 Node `v24.18.0`, locked pnpm `11.25.0`. Validation ran in an isolated Linux-native source copy because the repository deliberately excludes Windows native-package variants and mounted Windows filesystem imports were exceptionally slow. Intentional formatted files and API build output were copied back.

- Frozen dependency installation: passed.
- `pnpm lint`: passed.
- `pnpm format:check`: passed.
- `pnpm typecheck`: passed, including API, web, libraries, mockup sandbox and tests.
- Native PostgreSQL tracked migrations: passed on disposable PostgreSQL 17.
- Full suite with `RUN_DB_TESTS=1`, native PostgreSQL, `--maxWorkers=2 --no-file-parallelism`: **25 test files, 135 tests passed, no failures or skips**.
- Embedded PostgreSQL/WASM integration suite: **12 files, 44 tests passed**.
- API build: passed; emitted API and intelligence-worker entry points plus required Pino worker bundles.
- Production Next.js web build: passed against the local API rewrite target; no browser/UI acceptance claim.
- OpenAPI code generation: passed; 155 generated client/Zod files hash-compared with authoritative source and no drift was found.
- `pnpm audit --audit-level moderate`: returned **No known vulnerabilities found** at execution. This is time-bound advisory evidence, not security certification.
- `git diff --check`: passed.
- Narrow static scan of added tracked lines found no shell-eval/`shell:true` pattern or embedded credential assignments. This is not a whole-repository secret or penetration scan.

Machine-readable native report: ignored `.local/native-test-results.json`. Vitest JSON counts nested `describe` suites separately; the displayed file count is 25 while its suite total is 53. Both report 135 passed tests.

## Production-mode local smoke

The built API started with `NODE_ENV=production`, using ONLY the isolated local PostgreSQL fixture database, no hosted provider credentials.

- `GET http://127.0.0.1:8088/api/healthz`: HTTP 200, `{"status":"ok"}`.
- `GET http://127.0.0.1:8088/api/readyz`: HTTP 200, `{"status":"ready","checks":{"database":"ready"}}`.
- Observed security headers include CSP, HSTS, `X-Content-Type-Options: nosniff`, request IDs and private `Cache-Control: no-store`.

This proves startup/readiness in the test environment, not deployed TLS, provider delivery, browser functionality, or a self-contained `dist/` artifact. The build externalizes Google Cloud dependencies; production packaging still needs runtime dependencies and an accepted stateful hosting topology. The task-owned smoke API and disposable PostgreSQL container were stopped after verification; no unrelated containers were stopped.

## Supabase inspection scope

Existing project identified in authenticated dashboard:

- Name: `proofstack`.
- Reference: `klnxrwwixynheasqiqjl`.
- Organization: `Gdheubs's Org`.
- Region: Tokyo (`ap-northeast-1`).
- Main branch labeled `PRODUCTION`.
- Was paused. User explicitly approved resume and inspection only, no schema/data changes.
- Resume request was submitted, then dashboard readback showed `Healthy`.
- Dashboard summary displayed `No migrations`, `No backups`, and `No repository connected`. These summary labels do not prove that the database has no schema/data or that provider migration history matches Drizzle.
- Table Editor for `public` displayed `No tables or views`; other schemas were not enumerated.
- Auth provider configuration readback: Email enabled; Phone, GitHub and Google disabled. No provider settings were changed.
- Storage Files dashboard displayed the empty-state `Create a file bucket`; no bucket was created.

No new hosted project, paid upgrade, hosted migration, data reset, provider-secret edit or production deployment was performed. Existing Auth/storage/schema must be inspected read-only before a separately approved migration and staging plan.

## Outstanding backend work

See `docs/build-checklist.md`. Still open: session provider/transaction coupling and race tests; upload ingestion/sanitization and durable cleanup; reporting/blocking/moderation; privacy/export/deletion; resource-aware notifications; recovery-code lifecycle and SMS receipt reconciliation; encryption-key rotation; shared AI usage/spend limits; aggregated telemetry/external alerts; full history pagination and accurate enabled scope; real provider/browser/scale/restore acceptance. Permanent token revocation on security events remains a policy decision despite recovery lockdown now being enforced.

Passing tests do not close these unimplemented or unverified requirements. No public production approval is granted.
