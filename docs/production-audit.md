# Full-stack production audit — working report

## Scope and acceptance

Repository: `C:/Users/ithes/proofstack`. Existing dirty/untracked work is preserved. No commit, push, hosted migration, live secret replacement, production deployment or real payment is authorized or performed. Local development is distinct from production. Statuses describe executed evidence, not implementation-file presence.

This report is being updated phase by phase. **Production readiness: NOT APPROVED.** In particular, storage ingress/cleanup, hosted grants/TLS/backups, privileged native MFA and operational deployment acceptance require further work/evidence.

## Phase 1 — original authentication HTTP 500

### Root cause and reproduction

- Failing request: `GET http://127.0.0.1:3011/api/auth/firebase/config`.
- Actual response: HTTP **500**, body `Internal Server Error`; saved sanitized headers/body under `.local/auth-500-*`.
- Direct `http://127.0.0.1:8089/api/healthz` refused the connection.
- The running Next log showed `Failed to proxy ... /api/auth/firebase/config` and **`ECONNREFUSED 127.0.0.1:8089`**.
- `artifacts/proofstack/next.config.ts` correctly targeted the separate Express API. The development run had started **only Next**, and the root manifest had no full-stack `dev` entry point. No API runtime configuration was inherited or loaded.
- HTTP-only development would also conflict with the existing exact-HTTPS auth origin and Secure host-only cookies. Those security checks were not weakened.

### Correction

Added a single validated `pnpm dev` launcher (`scripts/dev.mjs`, `dev-config.mjs`, `dev-health.mjs`) that loads ignored `.env.local`, reads the **existing** external session-secret file into API memory, validates the selected identity configuration and TLS files, builds/starts Express first, requires real database/schema/auth/anonymous-CSRF probes, and only then starts Next over HTTPS. If either service exits, the launcher tears down its own stack rather than leaving a frontend pointed at a dead API. `pnpm dev:check` validates without starting services. It refuses production mode and remote database targets.

The frontend process receives an allowlisted nonsecret environment only; database/session/Admin credentials stay with the API. The public Firebase auth domain is propagated to Next's CSP. Added validated `BIND_HOST`, with the dev API bound to loopback.

Created a separate **persistent local development** database `proofstack_dev`, with all 11 current migrations (45 product tables) and a non-superuser/no-createdb/no-createrole runtime role. The existing `proofstack_test` database was left unchanged. The runtime role has no schema CREATE permission. This local Docker cluster uses development trust authentication and is **not a production database security configuration**.

Existing external Firebase Admin credentials and public Web configuration were reused without displaying values or modifying provider settings. Read-only provider checks confirmed Google and GitHub enabled. Localhost-only TLS keys remain outside the repository with restricted WSL permissions; the OS trust store was not modified. `.env.local` stores configuration/file references, not credential values, and was verified ignored by Git.

### Exact-target verification

The verified local origin is **`https://localhost:3011`**, proxying to the actual API at `http://127.0.0.1:8089`.

| Probe                               | Actual result                                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/healthz`                      | 200, `ok`                                                                                                                                                          |
| `/api/readyz`                       | 200, database `ready`                                                                                                                                              |
| `/api/auth/firebase/config`         | 200, explicit Firebase, both social providers enabled; privileged fields absent                                                                                    |
| `/api/auth/context` without cookies | 200, unauthenticated, CSRF available, Secure/HttpOnly `__Host-` cookies                                                                                            |
| `/api/auth/account` without cookies | 401 `SIGN_IN_REQUIRED`                                                                                                                                             |
| Local TLS                           | Verified by the diagnostic client against the generated localhost CA, not globally disabled                                                                        |
| Real browser sign-in page           | Google/GitHub enabled, original error absent, zero browser exceptions                                                                                              |
| Real-user login                     | User explicitly confirmed successful sign-in and arrival at Account                                                                                                |
| SQL readback after real login       | Exactly one active verified Firebase app user, one active encrypted native session, and one `auth.login_succeeded` event; no identity/contact/token values printed |

At this checkpoint, focused configuration/bind regressions passed **30 tests**; additional startup-health tests and the full quality gates will be recorded after execution. The earlier failure was at proxy reachability, **not** a Supabase RLS denial, invalid password, or auth-route exception. No fake identity/test backend was attached to the user's UI.

### Auth acceptance boundaries

Social first-login account provisioning and real login have evidence. Reload/session persistence, logout/re-login and selected-provider native failure cases are tracked separately. Password signup/reset and email/SMS OTP are not offered in selected Firebase social-only mode; they are not falsely called passing flows. Firebase native enrollment/recovery/privileged operator setup remain incomplete. No privileged role was granted to the real user for testing.

## Structured findings ledger

| Component                 | Severity | Finding / root cause                                                                                    | Fix / files                                                                                                            | Validation                                                                         | Status                      | Remaining risk                                                           |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------ |
| Development orchestration | High     | Frontend-only run proxies auth requests to an absent API, yielding the reported generic 500             | Root `dev`/`dev:check`; `scripts/dev*.mjs`; API `BIND_HOST`                                                            | Reproduced 500/ECONNREFUSED; full-stack 200 probes and real sign-in + SQL readback | Fixed, locally verified     | Hosted topology/process supervision still needs deployment acceptance    |
| Environment/secrets       | High     | API did not inherit required runtime configuration; frontend run had no matching auth CSP configuration | Ignored local config references existing external files; exact provider/domain validation; child-environment allowlist | Config checks, nonsecret diagnostics, native provider readback                     | Fixed for local development | Production secret store/rotation and ADC workload identity not certified |
| Development transport     | Medium   | HTTP preview cannot satisfy existing exact-HTTPS origin/Secure cookies                                  | Localhost-only HTTPS, existing security policy preserved                                                               | CA-verified probe and actual login                                                 | Locally verified            | User-managed certificate trust; no public HTTPS deployment claim         |
| Uploaded asset deletion   | High     | Cloud delete currently precedes SQL/audit commit; rollback cannot restore bytes                         | Durable outbox fix being developed independently                                                                       | Pending regression evidence                                                        | In progress                 | Do not declare safe until failure/retry/fencing tests pass               |
| Upload ingress            | High     | Signed PUT has no demonstrated storage-enforced byte/type limit before bytes arrive                     | Provider policy/bounded ingestion/quarantine required                                                                  | Source finding; real private bucket unavailable locally                            | Blocked for live acceptance | Do not enable unverified storage ingress for production                  |
| Native Git deletion       | High     | Cascading metadata deletion can leave disk objects outside live-row quotas                              | Durable cleanup/accounting/reconciliation required                                                                     | Source audit and existing Git tests; new recovery evidence pending                 | Partial                     | Durable shared storage and paired restore remain gates                   |

## Phase tracker

| Phase                        | Status                | Evidence / next dependency                                                                                  |
| ---------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1 Authentication             | PARTIAL               | Original 500 fixed; real social sign-in verified. Remaining critical-flow/MFA acceptance tracked explicitly |
| 2 Security                   | IN PROGRESS           | Independent current-source audit and local remediation under way                                            |
| 3 CI/CD                      | IN PROGRESS           | Actual workflow review/hardening delegated; no hosted CI/deployment pass claimed                            |
| 4 Limits/caching/performance | PENDING               | Fresh isolated bounded benchmark and abuse-limit checks                                                     |
| 5 QA/coverage                | PENDING               | Fresh complete suites and measured coverage, not recycled prior counts                                      |
| 6 Resilience                 | PENDING               | Local failure/recovery simulations and supervisor checks                                                    |
| 7 Background jobs            | PENDING               | Existing durable worker plus proposed cleanup worker reviewed/tested separately                             |
| 8 Database/data protection   | PARTIAL               | Separate dev schema/least-privileged role verified; hosted state/legal applicability incomplete             |
| 9 Payments                   | PENDING APPLICABILITY | Do not execute financial transactions                                                                       |
| 10 Infrastructure            | PENDING               | Distinguish Windows localhost/WSL/Docker from stateful production topology                                  |
| 11 Observability             | PENDING               | Logs/redaction/metrics and operational SLO evidence                                                         |
| 12 Recovery                  | PENDING               | Real synthetic isolated dump/restore and consistency checks required                                        |
| 13 Engineering quality       | IN PROGRESS           | New dev entry point/config tests; clean install/build/verification still to run                             |
| 14 Final acceptance          | PENDING               | Consolidate all ten requested deliverables and unresolved blockers                                          |

## Evidence handling

Raw diagnostics/tests/benchmarks belong under ignored `.local/production-audit/`. Reports must contain aggregate or sanitized results only. Existing historical reports remain historical; a previous green suite is not substituted for a fresh result. Private runtime configuration, session material, provider credentials, real user contact data and backup contents are never printed in the report.
