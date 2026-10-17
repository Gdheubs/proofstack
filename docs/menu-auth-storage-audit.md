# Menu, authentication and storage audit

## Verdict

**Local navigation/authentication fixes and disposable-database checks pass. Production readiness is NOT established.** No hosted schema, provider account, secret, storage bucket or production deployment was changed. Existing uncommitted work was preserved; nothing was committed or pushed.

The open UI at `http://localhost:3011` was inspected and left running. Its configured API target on port 8089 was offline during the audit, producing a sign-in configuration error. No fake authenticated test backend was attached to that UI. The isolated browser tests used different ports and disposable identities/data.

## Navigation scope and fixes

All **37** frontend page-route patterns and **15** unique primary submenu destinations were inventoried. Every literal internal destination resolves to an existing page pattern. Footer resources and account/auth utilities remain separate from the four workspaces.

| Parent           | Intended children                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| Overview         | Product overview only                                                                                    |
| Community        | Projects, hosted repositories, organizations, typed search, writing assist                               |
| Talent           | Talent directory, skill checks, my profile/settings                                                      |
| Career workspace | Preferences, applications/hiring inbox, opportunities, intelligence                                      |
| Build log        | Latest updates/post threads, bookmarks, notifications                                                    |
| Account utility  | Identity, credentials/security, devices/activity, membership links, authorized administration/operations |
| Footer resources | Live foundation status and explicitly demonstrational design-system reference                            |

Confirmed defects fixed:

1. Removed the full applications inbox from Career preferences. Listing/tracking/back links now use `/career/applications`; valid legacy `/career?job=...` destinations redirect there.
2. Replaced Account's duplicate organization authoring/member editor with a linked membership/access summary. Creation and management have their UI home under Community → Organizations. The legacy compatibility API remains; its older creation semantics still need consolidation before broad API release.
3. Developers and Skills search types no longer return one another's result sections; All retains both.
4. Both sign-in UIs preserve a narrow allowlisted skill-check return path through MFA/provider round trips. Only the nonsecret destination is stored in tab-local session storage; external/malformed paths fall back to `/account`.
5. Other people's profiles keep the Talent parent active without falsely marking My profile as the current page.
6. Manual project/organization records are labeled Release records / Repository links, distinct from hosted Git source/releases.
7. Source, pull-request listing, releases and security request pages share one repository-scoped submenu; Security review is manager-only.
8. A project-filtered repository initializer cannot silently choose a different project.
9. Profile Projects uses paginated queries and Load more; regression coverage reaches 45 projects across three pages.
10. Writing-assist descriptions and the Overview collaboration destination now match the actual tools.

The complete initial source audit is retained in ignored `.local/navigation-audit.md`; its findings describe the **pre-fix snapshot**, not the final state.

## Authentication changes

- Added the missing provider-config and strict CSRF/origin/rate-protected Firebase session endpoints.
- Connected selected-provider session reading, encrypted persistence, signed device binding, native assurance/current-user checks, principal gates and local/global logout. Cross-provider sessions never fall back to the other SDK.
- Fixed missing identity types and tests-wide type errors.
- Firebase account UI no longer offers unsupported Supabase password, phone, enrollment/removal or backup-code actions. Native enrollment/recovery and organization target-factor verification remain explicitly pending and fail closed.
- Added narrowly scoped Firebase token/iframe CSP support for the exact `FIREBASE_WEB_AUTH_DOMAIN`; production retains nonce-based scripts and no `unsafe-eval`. The actual production-build response header was read back. Configure the public auth domain on **both Next and API**; see [firebase-auth.md](firebase-auth.md).
- Existing users are not automatically linked/migrated when changing providers. Actual Google/GitHub sign-in, ADC, authorized domains, native MFA entitlement and operator bootstrap still require real-provider acceptance.

## Database and storage evidence

All **11 tracked migration files** applied to a newly created, loopback-only PostgreSQL 17 fixture. Schema inventory has **45 tables and 4 enums**; offline Drizzle comparison against the latest snapshot produced no migration statements. The new read-only preflight verified all snapshot table/column names, named indexes/constraints, the exact migration ledger and six required community role-grant mappings against that fixture. PostgreSQL-generated constraint names are compared using its 63-byte ASCII identifier limit.

`/api/readyz` now rejects a reachable database missing product columns, rather than treating `SELECT 1` as proof of product readiness. It remains a schema-availability probe, not a provider/storage/backup certification. Preflight now selects the configured identity provider rather than unconditionally requiring Supabase, and rejects ambiguous image-storage namespaces.

Persistence covers identities/profiles, tenants/RBAC, sessions/auth security, audit/events/notifications, community records/assets, careers/applications/messages/tasks, repository metadata/tokens, PRs/releases, intelligence jobs/budgets, worker heartbeats and assessment attempts/results. **Image bytes live in external object storage; Git objects live on a separate durable filesystem.** PostgreSQL alone is not storage for every byte type.

A preflight run using the disposable database but otherwise unsupplied shell configuration correctly passed schema/history/grants and failed application origin, identity configuration, object-storage namespace and session secret. This is not a readout of any separately configured hosted runtime.

## Verified gates

- `pnpm check`: passed (lint, formatting, libraries/API/frontend/tests TypeScript and **408 unit tests**, 27 files).
- Complete final suite with the disposable native PostgreSQL target: **559 tests passed**, 45 files, no failures or skips; raw results are recorded in `.local/menu-storage-native-final.json`.
- Embedded database integration suite: **151 passed**, 18 files; no browser tests counted in that number.
- API/worker build: passed. Production Next build from the isolated final-source copy: passed, including all page routes.
- Production-build browser checks: two real API/SQL flows (published and unclaimed profile), all 15 submenu destinations, six widths, inbox isolation, safe sign-in return, account organization-summary isolation, assessment submit/reload and exact SQL result readback; no browser exceptions. The initial fast production traversal hit the real limiter; the final isolated run used `RATE_LIMIT_MAX=1000` without changing the application's default.
- Narrow tracked-added-line scan found no matched credential literal or shell-eval pattern. This is not a full secret/security audit. Independent review could not complete because its provider returned HTTP 429; no independent approval is claimed.

Raw machine-readable evidence is under ignored `.local/menu-*-final.json`; browser screenshots/report are under `TEMP/proofstack-browser-checks`. Native transport does not make faked identity-provider boundaries real; `firebase-sessions.integration.test.ts` deliberately uses its own embedded database. Neither suite proves deployed TLS/grants, live identity or concurrency/scale acceptance.

## Still blocking a truthful “all configured and production-ready” claim

1. Confirm the exact staging/production target, supply configuration through its secret store, start the real API, and verify actual provider sign-in/MFA/recovery. Firebase-native enrollment/linking and provider-specific initial-admin procedures are unfinished.
2. Verify hosted migration state and permission seed DML; schema-only publishing is not proof that role grants ran. Review least-privilege runtime/migration roles, Data API/RLS strategy, TLS and aggregate connection limits.
3. Provision/test a private object bucket, sidecar or replacement adapter, IAM/CORS, ingress byte limits and quotas. Current signed PUT byte limits are checked **after** cloud upload, not enforced by the signing payload.
4. Implement an asset cleanup outbox/reconciliation. Current external deletion happens before SQL commit; rollback can retain a row whose bytes are gone. Pending uploads and failed promotions also need durable expiry/reconciliation.
5. Provision durable private shared Git storage and cleanup/tombstones. Project/org deletion cascades metadata but can leave physical repositories; create/fill/delete cycles can consume disk outside the live-row quota.
6. Rehearse paired PostgreSQL + image + Git backup/restore, retention/privacy deletion, worker supervision, alerts, outage/concurrency/load acceptance and release packaging. See [build-checklist.md](build-checklist.md) for the wider unfinished release gates.

No destructive hosted repair, credential replacement, migration rollout or production approval is implied by this local audit.
