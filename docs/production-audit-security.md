# Production security, integrity and resilience audit

## Verdict and scope

**NOT production-ready. The smallest high-priority fix class is durable cross-store lifecycle work, paired with bounded image ingress.** Do not equate passing SQL/UI fixtures with safe object deletion, bounded cloud charges, durable Git storage, live identity, or recoverability.

Audit date: **October 15, 2026**. Repository: `C:/Users/ithes/proofstack`, current dirty working tree. This is a read-only application/schema audit; the only repository write by this auditor is this report. No application/schema/configuration edits, commits, migrations, test runs, database connections, server starts, hosted operations, payments, credential inspection or secret changes were performed. Existing changes were preserved. Source/configuration files were inspected without reading `.env` or credential files. Runtime-offline/auth-proxy symptoms are being investigated separately by the parent; this report does not independently certify runtime state.

Evidence is local `file:line` source inspection plus offline parsing of existing result JSON and migration metadata. Paths below are relative to the repository; `API/` means `artifacts/api-server/src/`, `DB/` means `lib/db/src/schema/`, and `WEB/` means `artifacts/proofstack/`. Line numbers describe the inspected working tree and may move during concurrent implementation. Severity describes source risk or an explicit launch prerequisite, **not a claim of a demonstrated production exploit**. Proposed changes are not implemented or newly tested here. This is not legal advice, compliance certification, or independent penetration testing.

## Evidence ledger: historical fixtures versus current inspection

| Evidence                                    | Readback in this audit                                                                                                                 | What it does not prove                                                                                                                                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.local/menu-storage-unit-final.json`       | `success=true`; 408 passed, 0 failed/pending; 27 result files; started 2026-10-15 09:34:26 UTC                                         | No rerun or current-source fingerprint comparison; no live provider/storage acceptance.                                                                                                                             |
| `.local/menu-storage-native-final.json`     | `success=true`; 559 passed, 0 failed/pending; 45 result files; started 2026-10-15 09:30:25 UTC                                         | Not 559 real-provider tests. The suite includes Firebase session tests that explicitly replace DB transport with PGlite and replace provider boundaries. Native transport elsewhere does not eliminate these mocks. |
| `.local/menu-storage-embedded-final.json`   | `success=true`; 151 passed, 0 failed/pending; 18 result files; started 2026-10-15 09:23:23 UTC                                         | PGlite executes SQL, not native connection pooling, TLS, grants or genuinely independent concurrent sessions. See `tests/embedded-db.ts:6-44`.                                                                      |
| `.local/menu-browser-production-final.json` | `success=true`; 2 passed, 0 failed/pending; **one result file**; started 2026-10-15 09:29:24 UTC                                       | `tests/assessments-browser.integration.test.ts:8-46` replaces `readSession` and provider capabilities. Product HTTP/UI/SQL flow is useful evidence, not Google/GitHub/MFA sign-in certification.                    |
| `tests/community-assets.test.ts:12-112`     | Completion pins a generation, copies to a new destination and rejects a bad header in mocked storage; abandoned-row deletion is mocked | No provider-side ingress bound, full decoder, external delete/SQL rollback test, crash/retry worker or real bucket IAM/CORS/lifecycle test.                                                                         |
| Migration metadata                          | Offline parse: 11 journal entries; latest snapshot has 45 tables; RLS-enabled table list is empty                                      | No current database inspection; no DDL execution, hosted ledger, grants or TLS verification.                                                                                                                        |
| Current static inspection                   | Full high-risk call chains below and entrypoint/worker/operations/DB boundaries reviewed                                               | No exploit execution, concurrency/load test, dependency advisory refresh, infrastructure account review or restore drill.                                                                                           |

The reports `docs/menu-auth-storage-audit.md` and `.local/storage-audit.md` are baselines, not authority over newer source. Two earlier findings are **partly fixed**: `objectStorage.ts:63-83` now rejects ambiguous namespaces; `health.ts:15-37` and `scripts/preflight*.mjs` now inspect product schema, selected provider, migration ledger and community grants. Do not re-report the old “SELECT 1 only” readiness or unconditional Supabase preflight defects as current. Conversely, signed PUT ingress, external delete-before-commit and orphan Git directories **remain in current source**. Historical build/browser assertions not represented by the JSON above were not rerun by this auditor.

## Full high-risk call chains

### Images: browser to cloud, completion, authorization and deletion

1. `WEB/components/community/uploader.tsx:24-29` calls `WEB/hooks/use-community.ts:99-139`. Browser size/type checks precede `POST /api/community/uploads`, then a direct cloud `PUT`, then `asset-complete`. Browser checks are not a trusted ingress boundary.
2. `API/app.ts:84-117` applies API rate limiting and JSON limits. `API/routes/community.ts:53-57` checks CSRF, selected-provider session/account assurance and an upload reservation limit. **These limits do not wrap the subsequent cloud PUT.**
3. `API/services/community-assets.ts:37-71` validates the declared size/type, requests a signed URL, then locks the user and inserts a pending asset under a 100-row quota. `API/lib/objectStorage.ts:126-145,247-285` sends the sidecar only bucket, key, method and expiry. No byte/type constraint is included in that request. Signing occurs before quota admission, although the URL is only returned on a successful transaction.
4. Completion goes through `POST /community/action` → `runCommunityAction` → `transaction` → `assetAction`. Ownership and the asset row lock are checked. Size/type and a 16-byte download/header signature are checked against a pinned generation; it is copied to a random ready key with a create precondition, ACL metadata is set, SQL is updated, audit is appended, **then SQL commits** (`community-assets.ts:94-169`; `community-actions.ts:16,58,73-82`; `auth-sessions.ts:99-113`).
5. `GET /community/assets/:id` validates the UUID, attempts anonymous access, then account-authorized access, streams through the API with `nosniff`, restrictive CSP and private/no-store (`routes/community.ts:59-83`). `assetAccess` requires ready status and checks active-owner public references or grant-aware project read access (`community-assets.ts:171-199`). Private ACL metadata is not evidence of actual private bucket IAM.
6. Deletion follows the same action transaction, locks the owned asset, checks avatar/project references, **deletes the cloud file first**, deletes SQL metadata second, appends audit third and commits last (`community-assets.ts:101-128`). A SQL/audit/commit failure cannot restore the external bytes. Completion has the reverse orphan window: cloud copy/ACL succeeds, SQL later rolls back.

### Git: metadata ownership, physical objects and cascade deletion

1. `API/routes/repositories.ts:24-46` reads selected-provider sessions; actions require account/CSRF/rate protection. `runRepositoryAction` validates input and uses parameterized SQL.
2. Create: authorize/lock project → lock owner → count live repositories → create UUID directory → initialize Git → write README objects → insert repository/branch rows → audit → commit (`services/repositories.ts:200-254,345-354`). No durable allocation record precedes filesystem writes.
3. Web commits and PR merges lock metadata, check expected branch heads and quotas, write Git objects, then update SQL/audit/commit (`repositories.ts:285-341`; `pull-actions.ts:235-306`). Rolled-back or rejected work can leave unreachable objects; post-write quota rejection does not undo bytes.
4. Browser/clone reads use `lockedRepository`: transaction → grant-aware repository access with row lock → derive validated UUID path → rebuild refs from **SQL branches and release tags** → Git read (`repositories.ts:60-100`). Git RPC is read-only upload-pack; no push endpoint is exposed (`routes/repositories.ts:48-111`). Clone credentials are scoped hashes with expiry and active-user/recovery checks (`repositories.ts:356-373`); repository access is still checked afterward.
5. `project-delete` and `organization-delete` delete SQL rows, with FK cascades into repositories, tokens, branches, pulls/releases and security jobs. Neither schedules Git removal (`community-project-actions.ts:97-110`; `community-org-actions.ts:50-76`; `DB/repositories.ts:19-21`; `DB/intelligence.ts:26-28`). Directory bytes are outside those cascades. Owner count falls while disk remains occupied.
6. Git subprocess safety is substantial: no shell, hooks/protocol/global config disabled, fsync requested, process/output/time bounds; path UUID and directory/symlink checks (`repository-git.ts:30-149`). These controls do not provision a private durable shared volume or implement GC.

### Identity, native PostgreSQL and tenant isolation

- HTTP identity is derived through `readSession`/`requireAccount`, not caller-supplied user/tenant headers. Supabase verifies exact provider credentials before interpreting claims, matches session and application user, checks active status and MFA (`auth-sessions.ts:174-228,387-501`; `auth-provider.ts:190-213`). Firebase verifies revocation/current identity, exact issuer/audience/project, provider subject, supported native factor and account status; token tenants are rejected (`firebase-provider.ts:69-124,228-317`). Firebase DB session reads recheck revocation after native I/O (`firebase-sessions.ts:214-347`).
- `community-policy.ts:15-26,35-133` derives private access from active membership **and actual role-permission grants**. Mutations lock organization/project rows; owner/admin/contributor decisions and fresh-MFA requirements differ by action. SQL-builder aliases are internal; request data is bound as parameters. Career applications/messages require applicant or current hiring manager (`careers-query.ts:127-159`; `careers-actions.ts:99-143`). PR reviews are tied to current heads and current eligible reviewers, not merely historical approval (`pull-policy.ts:29-43`). Assessment attempt reads/submits scope both attempt and user (`assessments.ts:57-81`).
- This is **application-enforced isolation**. `lib/db/src/index.ts:13-29` creates a shared native PostgreSQL pool; it does not set per-request DB identities/tenant claims. Snapshot RLS flags are all false; inspected migration SQL contains no RLS policies or native privilege provisioning. FKs constrain relationships, not the caller's authority. Direct DB/Data API access must not be assumed safe because the HTTP API checks grants.
- No confirmed arbitrary cross-tenant HTTP data access was demonstrated. Notifications are a concrete secondary disclosure gap described below. Statement-separated authorize/read paths also need native revocation-race validation; no linearizable revocation guarantee is established by inspection.

## Findings and minimal fix proposals

Each record uses the requested fields. `Open/source-confirmed` means the problematic control flow or missing capability is visible; `Unverified gate` means production configuration/effect cannot be inferred. Validation entries are **proposed regression seams for the parent**, not execution performed here.

### SEC-01 — Cloud upload ingress is not bounded by the signed request

- **Component:** Image reservation/signing/cloud ingress.
- **Severity:** High; storage-abuse/cost/availability launch blocker.
- **Finding:** The 8 MiB bound is declared by the client and checked only after bytes reach storage. A valid PUT capability can be used without completion and reused during its 900-second lifetime. API JSON/rate/row limits do not bound those bytes.
- **Root cause:** Signing contract contains no content-length/type restriction; quotas count rows, not ingress or retained versions.
- **Fix proposal:** Until verified bounded ingress exists, fail closed for new upload issuance. Preserve existing image reads. Smallest implementation choice: authenticated streaming upload proxy with a hard streaming byte limit, bounded concurrent requests/deadline and no unbounded buffering; alternatively a provider-supported bounded policy whose exact constraints are proven against the actual adapter. Reject oversize before accepting the entire body; reserve account/global byte capacity atomically. An added client header or completion-only check is not the fix.
- **Files:** `API/services/community-assets.ts:18-24,37-71,143-148`; `API/lib/objectStorage.ts:126-145,247-285`; `WEB/hooks/use-community.ts:99-139`.
- **Validation:** Oversize PUT/proxy stream, dishonest declaration, chunked/absent length, replay, disconnect and no-completion tests. Fake adapter tests first; explicitly authorized staging bucket test must prove bytes rejected at ingress, not merely rejected during completion.
- **Status:** Open/source-confirmed; real sidecar/bucket behavior unverified.
- **Remaining risk:** Egress, object versions, account farming and edge volumetric abuse still require budgets, lifecycle and monitoring.

### SEC-02 — Image validation is a header sniff, not safe image decoding

- **Component:** Image quarantine/promotion.
- **Severity:** High for untrusted-media launch.
- **Finding:** PNG/JPEG/WebP signatures and metadata can match malformed or pathological files; there is no full decode, pixel/frame/dimension limit or canonical re-encode. The unit fixture accepts an eight-byte PNG header as its valid sample.
- **Root cause:** `imageSignature` checks only magic bytes; no bounded media-processing boundary exists.
- **Fix proposal:** After bounded ingress, decode in a constrained worker with compressed-byte, pixel/frame/dimension/time/memory limits, strip metadata and re-encode to a supported canonical image; promote only that output. Keep immutable generation pinning and private quarantine. Reject unsupported animation rather than adding a new product surface.
- **Files:** `API/services/community-assets.ts:25-35,134-168`; `tests/community-assets.test.ts:25-41`.
- **Validation:** Header-only/truncated/polyglot images, oversized dimensions, animation/frame bomb, corrupt decode, worker timeout and metadata removal; assert no ready row/object on failure.
- **Status:** Open/source-confirmed; decoder not implemented.
- **Remaining risk:** Decoder/library supply-chain risk and resource isolation need separate review; MIME/CSP alone do not provide this control.

### SEC-03 — Irreversible external deletion occurs before SQL commit

- **Component:** Asset delete, audit and transaction boundary.
- **Severity:** High; direct data-loss path.
- **Finding:** External object deletion can succeed before SQL delete/audit/commit fails, leaving a retained ready row pointing to missing bytes.
- **Root cause:** External storage operations are treated as though SQL rollback covers them.
- **Fix proposal:** Add one durable cleanup outbox/lifecycle record. Under the existing asset lock, authorize/check references, mark the asset non-readable/non-attachable (or atomically delete metadata while recording the complete immutable object target), enqueue cleanup and audit in **the same SQL transaction**. Perform no external delete before commit. A supervised worker claims/retries idempotently, treats not-found as success, fences leases and records completion. Retain byte reservation until cleanup is acknowledged. An in-memory post-commit callback or a catch/finally delete is not durable.
- **Files:** `API/services/community-assets.ts:101-128`; `API/services/community-actions.ts:16,58,73-82`; `API/services/auth-sessions.ts:99-113`; proposed outbox migration/worker owned by parent.
- **Validation:** Inject failure at SQL delete/update, audit and commit; assert original bytes untouched on rollback. Crash after commit/before delete and after delete/before ack; duplicate workers, not-found, transient denial, lease expiry and concurrent attach/delete must converge without deleting referenced bytes.
- **Status:** Open/source-confirmed; no application/schema change made.
- **Remaining risk:** Backups/object versioning and unknown commit outcomes require reconciliation; successful SQL response alone is not physical-erasure evidence.

### SEC-04 — Promotion and abandoned-upload cleanup have no durable recovery ledger

- **Component:** Pending/ready object lifecycle and quota.
- **Severity:** High consistency/capacity gap; medium indefinite account-quota lockout.
- **Finding:** Copy/ACL may succeed before SQL rolls back, creating unknown ready objects; successful completion leaves the quarantine source to external lifecycle. Expired pending rows keep the 100-row quota. There is no durable promotion intent, pending expiry worker or ready-object reconciliation.
- **Root cause:** Random final key is chosen inside an uncommitted transaction; lifecycle exists only in control flow/provider documentation.
- **Fix proposal:** Use the same bounded lifecycle/outbox mechanism as SEC-03. Persist a promotion attempt/intended destination before external copy, generation-pin validation, and activate the DB reference only after verified copy. Keep retry targets stable; reconcile abandoned attempts. Record upload capability expiry and delay final quarantine cleanup until it expires plus grace: deleting a pending key while its PUT URL remains valid allows recreation. Account for versioned objects according to bucket policy. Expire SQL reservations only in concert with capacity accounting; never TTL-delete referenced ready objects.
- **Files:** `API/services/community-assets.ts:45-65,130-168`; `API/lib/objectStorage.ts:135-145`; `DB/community-assets.ts:18-26`.
- **Validation:** Crash/failure before and after copy, ACL, update, audit and commit; retry same attempt; overwrite source; late PUT after user deletion; expired pending row and source versions; inventory dry-run must retain every live ready reference.
- **Status:** Open/source-confirmed; lifecycle/IAM unverified.
- **Remaining risk:** Unknown historic orphans need reviewed, age-gated reconciliation, not blind prefix deletion.

### SEC-05 — Git cascades free row quotas but retain physical repositories

- **Component:** Repository allocation/deletion and filesystem capacity.
- **Severity:** High; durable disk-exhaustion and integrity risk.
- **Finding:** Project/org deletes cascade metadata without removing UUID directories; failed create can orphan a directory before metadata exists. A create/fill/delete cycle bypasses the effective 20-live-repository storage cap. Failed commits/merges can retain unreachable objects and cause lasting quota failure.
- **Root cause:** Filesystem ownership/capacity has no durable lifecycle independent of live repository rows; auto-GC is disabled.
- **Fix proposal:** Reuse a small durable storage registry/outbox: reserve owner allocation before mkdir; transition initializing→live, and capture repository UUID/owner/bytes into tombstones **before every cascade**. Keep reservations until physical cleanup completes. Worker resolves only canonical validated UUID paths under the configured root, rejects symlinks, rechecks lifecycle/absence under coordinated locking, quarantines/renames before delayed removal, and retries safely. Existing unregistered directories need read-only inventory, grace and explicit approval. For unreachable-object GC, synchronize/protect **SQL branches, releases and retained PR history heads**, acquire repository exclusion and use a reviewed retention policy; do not run blind `git gc --prune=now`.
- **Files:** `API/services/repositories.ts:73-100,211-254,325-345`; `API/services/repository-git.ts:30-54,151-168,247-277`; `API/services/community-project-actions.ts:97-110`; `API/services/community-org-actions.ts:50-76`; `API/services/pull-actions.ts:257-306`; `DB/repositories.ts:19-21`.
- **Validation:** Create failure at each stage, parent cascade, rollback, delete/recreate, crash before/after rename/remove/ack, concurrent clone/commit/GC and repeated fill/delete accounting. On DB/inventory error fail closed; never infer orphanhood from a failed query. Restore and read all retained branch/release/PR commits after GC.
- **Status:** Open/source-confirmed; no cleanup was run.
- **Remaining risk:** Global disk/inode limits, paired backups, shared-volume topology and legacy orphan attribution are operator gates.

### SEC-06 — Storage enablement is not storage provisioning

- **Component:** Object adapter, Git volume and topology.
- **Severity:** High operational gate.
- **Finding:** Images require the Replit loopback credential/signing sidecar; `REPOSITORY_ROOT` truthiness advertises enabled Git. The checked-in deployment target is autoscale. No code establishes durable shared private bytes across replicas/restarts.
- **Root cause:** Configuration presence is used as a capability flag; filesystem/bucket/IAM/topology live outside SQL.
- **Fix proposal:** Keep unsupported writes disabled. Select/provision the existing adapter's required sidecar or one explicitly approved replacement; verify private IAM, CORS, lifecycle and capacity. Enable Git only on a durable private shared POSIX volume/dedicated service with coordinated writers. Do not redesign storage providers as a prerequisite to fixing lifecycle semantics.
- **Files:** `API/lib/objectStorage.ts:13-31,247-285`; `API/services/repository-git.ts:27-54`; `.replit:3-5`; `artifacts/api-server/scripts/preflight.mjs:85-96`; `docs/operations.md:7-10`.
- **Validation:** Authorized staging read/write/restart/replica tests, private anonymous-bucket denial, Git fsync/permissions/disk/inodes and actual durable-mount readback.
- **Status:** Unverified gate; local path/sidecar presence was not inspected.
- **Remaining risk:** Database readiness cannot certify these independent stores.

### SEC-07 — Native DB access has no enforced tenant context or privilege baseline

- **Component:** PostgreSQL authentication, authorization and audit protection.
- **Severity:** High deployment/security gate, conditional on exposure and grants.
- **Finding:** Shared server SQL enforces tenant policy, but there is no RLS or checked-in runtime/worker/migration privilege provisioning. Audit tables are append-oriented by convention, not immutable. Direct Data API/client DB access is not covered by server predicates.
- **Root cause:** A single configured pool identity with no request tenant identity; infrastructure grants/TLS are operator-controlled.
- **Fix proposal:** Smallest safe baseline: restrict application tables to the authorized backend, revoke unintended browser/Data API access, separate least-privileged runtime/worker/migration roles, verify TLS/certificate policy and restrict audit UPDATE/DELETE. Do not bolt RLS on without defining pool/worker/admin semantics and testing them. Verify actual target grants rather than deriving them from provider name.
- **Files:** `lib/db/src/index.ts:13-29`; `API/services/authorization.ts:16-32`; `API/services/community-policy.ts:15-26`; `DB/audit-logs.ts`; migration snapshot RLS flags; `docs/database.md:26-46`.
- **Validation:** Parent-owned isolated native DB role matrix: backend allowed operations, anonymous/authenticated Data API denial, cross-tenant SQL under chosen policy, audit mutation denial, migration-only DDL, TLS and pooled-session context leakage tests if RLS is introduced.
- **Status:** Source absence confirmed; actual hosted grants/TLS/exposure unverified.
- **Remaining risk:** A privileged DB compromise bypasses app policy; “RLS absent” alone is not proof of remotely accessible rows.

### SEC-08 — Migration/system-data release path remains an explicit gate

- **Component:** Schema ledger, RBAC DML and first operator.
- **Severity:** High launch prerequisite.
- **Finding:** Required role-permission mappings come from SQL DML, not schema; runtime role helpers do not create grants. Production documentation requires schema Publish, while preflight requires the exact Drizzle ledger. First-super-admin bootstrap is development-only/Supabase-only. Some current release files are untracked.
- **Root cause:** Schema publication, data initialization, ledger ownership and production bootstrap are not one established authorized release workflow.
- **Fix proposal:** Package all SQL/journal/snapshot/schema files together; separately review idempotent system-data and ledger handling for the actual target. Preserve fail-closed preflight; do not fabricate ledger records or run dev bootstrap/migrator in production by changing NODE_ENV. Define named, native-MFA-verified, one-time audited operator bootstrap for the selected provider.
- **Files:** `lib/db/drizzle/0004_community-permissions.sql:1-20`; `lib/db/scripts/migrate-dev.mjs:6-29`; `API/services/auth-account.ts:155-177`; `artifacts/api-server/scripts/preflight-schema.mjs:94-139`; `artifacts/api-server/scripts/bootstrap-admin.mjs:5-8,38-74`; `docs/database.md:48-60`.
- **Validation:** Fresh isolated target from packaged artifacts, exact ledger/grant readback, missing/extra mapping denial, provider-specific bootstrap denial/replay/audit tests and reviewed native schema diff.
- **Status:** Preflight detection improved; production workflow/target remains unverified.
- **Remaining risk:** No hosted DDL, role seeding or administrator assignment is authorized by this report.

### SEC-09 — Live provider and privileged Firebase lifecycle are incomplete

- **Component:** Identity cutover, MFA/recovery and organization role administration.
- **Severity:** High readiness gate; fail-closed gaps, not demonstrated privilege bypass.
- **Finding:** Firebase Google/GitHub/native assurance checks exist, but enrollment/removal/recovery and target-factor verification for privileged role changes are unsupported. Provider switching changes subject namespace and requires explicit account linking. Real ADC/domain/OAuth/MFA behavior is not fixture evidence.
- **Root cause:** Selected-provider session support is newer than the complete security-account lifecycle; app users have a unique provider subject/contact mapping.
- **Fix proposal:** Keep unsupported actions visibly unavailable. Implement only the selected provider's required native lifecycle and audited first-operator path; explicit verified linking must preserve application UUIDs/ownership and revoke old sessions, never auto-link by email alone. Test real staging provider only after separate authorization.
- **Files:** `API/services/firebase-provider.ts:69-124,228-317`; `API/services/firebase-sessions.ts:163-184`; `API/services/auth-provider.ts:121-143`; `API/services/auth-actions.ts:39-55`; `API/services/auth-account.ts:195-197`; `API/services/community-org-actions.ts:108-131`; `API/lib/auth-config.ts:39-45`.
- **Validation:** Wrong project/tenant/provider, revoked/disabled identity, stale native factor, OAuth popup/MFA, duplicate contact/linking denial and every unsupported action must remain fail closed.
- **Status:** Implemented boundary checks; real-provider acceptance and missing workflows open.
- **Remaining risk:** Existing users/data do not migrate merely by changing AUTH_PROVIDER.

### SEC-10 — Supabase network I/O retains transaction/row/pool occupancy

- **Component:** Session hydration and organization membership changes.
- **Severity:** High resilience risk under provider latency/concurrency.
- **Finding:** Supabase session refresh/getUser occurs while a session transaction and row lock are held; target factor checks also run inside organization transactions. Each process has only ten pooled DB clients. Firebase session verification already uses an outside-I/O/recheck pattern.
- **Root cause:** External authentication correctness is coupled to long SQL transactions.
- **Fix proposal:** Copy the narrow Firebase approach: read encrypted credential/version, perform bounded provider I/O outside transaction, reacquire row lock, recheck handle/credential version/revocation/user and persist refresh with fencing. Preserve refresh-token concurrency correctness and native assurance; do not cache identity as an availability bypass. Apply a matching recheck to role grants.
- **Files:** `API/services/auth-sessions.ts:397-489`; `API/services/auth-provider.ts:39-52,55-77`; `API/services/auth-account.ts:199-280`; `API/services/community-org-actions.ts:78-178`; `lib/db/src/index.ts:13-21`; contrast `firebase-sessions.ts:223-310`.
- **Validation:** Native parallel refresh, provider timeout, revoke/disable during I/O, stale response fencing, credential-rotation conflict and pool saturation/outage recovery.
- **Status:** Open/source-confirmed for Supabase; no load test executed.
- **Remaining risk:** Removing I/O from transactions without fencing introduces auth regressions; avoid a broad auth rewrite.

### SEC-11 — Recovery credentials and clone tokens lack a complete security-event lifecycle

- **Component:** MFA removal/replacement/recovery and repository credentials.
- **Severity:** High account-recovery policy gap.
- **Finding:** Verified-factor removal revokes sessions but does not delete old app recovery codes. Partial native recovery failure can leave lockdown in progress without a durable repair job. Clone tokens reject disabled/recovery-locked users now, but are not permanently revoked by those events and may become usable again when status clears.
- **Root cause:** Security events update session state but do not uniformly version/revoke other durable credentials or persist external factor-reset progress.
- **Fix proposal:** Define a small credential-epoch/revocation policy: invalidate recovery codes when verified factors are removed/replaced; revoke or explicitly renew affected clone credentials on recovery/security disable. Persist retryable recovery progress, keep account locked until current native identity is verified, and never manufacture AAL2 from an app recovery code.
- **Files:** `API/services/auth-mfa.ts:164-193,195-240,251-316`; `API/services/repositories.ts:356-373`; `API/services/auth-account.ts:139-151`.
- **Validation:** Old code after unenroll/re-enroll, simultaneous code use, partial factor-delete failure/restart, disabled→active/recovery→cleared token behavior and native-factor step-up regression.
- **Status:** Open/source-confirmed; current lockdown checks are positive controls.
- **Remaining risk:** Security policy decisions and real native-factor behavior remain owner acceptance gates.

### SEC-12 — SMS receipts cannot distinguish failed versus unknown delivery

- **Component:** Signed SMS hook/idempotency.
- **Severity:** Medium availability/reconciliation gap.
- **Finding:** A receipt is inserted before MSG91 I/O. Every existing non-accepted receipt thereafter returns pending, including definite HTTP failures or crashes before send; ambiguous send timeout must not blindly retry. No failed/unknown retry reconciliation exists.
- **Root cause:** Two-state receipt lifecycle cannot represent external delivery transitions.
- **Fix proposal:** Persist attempted/accepted/definitely-failed/unknown transitions and safe provider reference without OTPs/phone payloads; retry only when provider idempotency or proven non-delivery permits it. Unknown outcomes need operator/provider reconciliation and bounded expiry, not automatic replay.
- **Files:** `API/routes/auth-sms.ts:59-113`; `API/services/auth-cleanup.ts:8-11`; `DB/auth-security.ts`.
- **Validation:** Signature/replay, crash before call, definite rejection, timeout after accept, DB failure after accept and concurrent hook delivery. Do not send real SMS in unit fixtures.
- **Status:** Open/source-confirmed; live delivery unverified.
- **Remaining risk:** OTP and mobile are placed in the outbound provider URL; vendor/proxy logging policy must avoid retaining that sensitive URL. No such logs were inspected.

### SEC-13 — Notifications retain private resource metadata after access changes

- **Component:** Notification creation/read/count.
- **Severity:** High confidentiality gap for private workspaces.
- **Finding:** Project invitations and pull updates snapshot project/PR titles. Notification reads/counts scope only recipient, not current resource access; revoked membership, private visibility change or resource deletion does not hide those snapshots.
- **Root cause:** Generic title/body/href records do not carry an enforceable typed resource relationship.
- **Fix proposal:** Add typed resource/tenant reference and current-access filtering for delivery, list, unread count and read mutation. Use generic non-sensitive text until access is verified; redact legacy sensitive entries using a reviewed migration/retention plan. Do not rely on destination-page 404s to protect notification content.
- **Files:** `API/services/community-policy.ts:159-170`; `API/services/community-project-actions.ts:139-151`; `API/services/pull-actions.ts:296-304`; `API/services/community-query.ts:46-52,177-185`; `API/services/community-actions.ts:47-56`; `DB/notifications.ts`.
- **Validation:** Invite/update→membership revoked, public→private, disabled resource owner, deletion and outsider mention; assert no private title/body/href leakage and consistent unread count.
- **Status:** Open/source-confirmed; matches baseline F25.
- **Remaining risk:** Data already delivered to a user cannot be made unseen; future disclosure must still be minimized.

### SEC-14 — Session/device and revocation guarantees differ by provider/path

- **Component:** Session resume and authorization timing.
- **Severity:** Medium hardening/concurrency gap.
- **Finding:** Firebase compares the signed device cookie with stored `device_hash`; Supabase stores the hash but its reader does not compare it. Some authorization/read chains span statements without shared revocation exclusion (for example application authorization then message query). There is no proven linearizable revoke guarantee.
- **Root cause:** Provider implementations and secondary read paths use different binding/fencing rules.
- **Fix proposal:** Decide whether both providers promise device binding; if yes, add the same non-destructive signed-cookie check before native I/O for Supabase and handle legitimate reissue consistently. Define revocation semantics; for especially sensitive multi-statement reads use a single scoped SQL statement or recheck within the documented transaction policy. Keep in-flight request behavior explicit.
- **Files:** `API/services/auth-sessions.ts:321-350,387-501`; `API/services/firebase-sessions.ts:229-237`; `API/services/careers-query.ts:127-159`; `API/services/auth-account.ts:21-61`.
- **Validation:** Stolen handle without matching device, malformed cookie without revoking legitimate browser, same-provider reissue, revoke/role change between authorization and resource query on independent native DB clients.
- **Status:** Source asymmetry confirmed; concurrency exploitability not exercised.
- **Remaining risk:** Bearer-handle theft remains a threat even with Secure/HttpOnly cookies; device cookies are not hardware binding.

### SEC-15 — Several data invariants exist only in API code

- **Component:** Asset, polymorphic references, JSON proof lists and repository relationships.
- **Severity:** Medium data-integrity hardening.
- **Finding:** Assets lack DB status/size/type/path uniqueness checks; polymorphic bookmark/reaction targets and project IDs in JSON cannot be protected by ordinary FK cascades. JSON TypeScript typing is not DB validation. SQL/import/cascade paths can bypass API cleanup; repository commit existence is external to SQL.
- **Root cause:** Flexible JSON/polymorphic schema and cross-store references require explicit validators/reconciliation.
- **Fix proposal:** Start with targeted CHECK/unique constraints after inspecting existing data in an authorized target; do not normalize the whole product. Add reference reconciliation for JSON/polymorphic links and typed cleanup ownership. Strengthen relationships only where the invariant and cascade policy are clear.
- **Files:** `DB/community-assets.ts:18-26`; `DB/community-social.ts`; `DB/community-entries.ts`; `DB/careers.ts`; `DB/pull-requests.ts`; `API/services/careers-policy.ts:16-33,45-60`; `API/services/community-social-actions.ts:144-164`.
- **Validation:** Disposable DB direct invalid inserts, parent cascades, private/deleted proof filtering, duplicate paths and independently reconstructed Git-object/reference checks.
- **Status:** Open/source-confirmed; not evidence of an HTTP authorization bypass.
- **Remaining risk:** Constraints cannot establish cloud/Git byte existence or authorization by themselves.

### SEC-16 — Queue mechanics are durable, but progress/recovery evidence is incomplete

- **Component:** Intelligence enqueue/claim/process/cancel/retention.
- **Severity:** Medium operational gate; preserve current safety semantics.
- **Finding:** Durable idempotency, per-user admission, atomic daily budgets, SKIP LOCKED claim, 120-second fenced lease, bounded attempts, 24-hour queued expiry and no automatic replay of ambiguous provider work exist. A single worker loop processes one job at a time and reports heartbeat before processing; no last-success/progress telemetry or separate cleanup worker exists. No native multi-worker crash/load evidence was rerun.
- **Root cause:** Heartbeat is liveness, not progress; cleanup and processing share process supervision.
- **Fix proposal:** Keep the SQL queue. Add claim/start/last-progress/last-success and safe error-category metrics, supervised restart/backoff and bounded independent maintenance batches. Preserve cancellation and lease fencing; if workloads outgrow lease duration, add fenced renewal rather than silently extending it. Never automatically replay provider-started work to clear a dashboard alert.
- **Files:** `API/services/intelligence-jobs.ts:92-233`; `API/services/intelligence-worker.ts:25-164`; `API/intelligence-worker.ts:10-43`; `API/services/intelligence-scanner.ts:64-121`; `DB/intelligence.ts:49-70`.
- **Validation:** Independent native workers claiming concurrently, crash/lease expiry, stale result, cancellation during provider request, DB outage at usage/result write, drain/kill/restart and retention backlog. Existing tests mock AI (`tests/intelligence.integration.test.ts:22-26`).
- **Status:** Positive source controls; operational/concurrency acceptance open.
- **Remaining risk:** Provider completion can remain unknown and usage unrecorded after crash; count quotas are not an invoice-grade ledger.

### SEC-17 — Writing assist bypasses queue-wide spending/consent controls

- **Component:** Direct community AI and queued learning plans.
- **Severity:** High spending/operational and privacy-product gap.
- **Finding:** Direct `/community/assist` sends up to 12,000 characters of arbitrary source to a configured external provider, uses a fallback model and account rate limit, but has no shared global cost reservation/usage ledger or explicit consent field. Queued career plans require consent and constrain submitted skills, with global call-count reservations and usage estimates. These are different control surfaces.
- **Root cause:** Synchronous assist predates durable AI budgeting; provider base URL is configured, not an enforced data policy.
- **Fix proposal:** Require an explicit approved model/provider and enable flag; reuse atomic account/global reservations across both call paths, conservative token/cost limits, usage outcome states and a clear data-sharing disclosure/consent decision. Validate HTTPS/provider policy at runtime, not only optional preflight. Do not auto-retry ambiguous paid calls. Human-reviewed text remains untrusted output.
- **Files:** `API/routes/community.ts:47-51`; `API/services/community-ai.ts:10-65`; `API/services/intelligence-input.ts:28`; `API/services/intelligence-jobs.ts:210-214`; `API/services/intelligence-provider.ts:1-46`; `lib/integrations-openai-ai-server/src/client.ts:3-18`.
- **Validation:** Concurrent global budget exhaustion across both endpoints, timeout/unknown usage, invalid output, disabled model/provider and private source disclosure UX. Fake provider fixtures are not real cost/retention acceptance.
- **Status:** Open/source-confirmed; no AI request or charge performed.
- **Remaining risk:** Prompt wording is not a security or privacy enforcement boundary; vendor handling/retention requires separate owner review.

### SEC-18 — Operations dashboard is not durable aggregated observability

- **Component:** API/index/worker logging, metrics and alerting.
- **Severity:** High operational launch gate.
- **Finding:** Safe API request IDs, redaction, bounded error envelopes and admin/fresh-MFA operations gating exist. Request/5xx/p95 metrics are per-process; p95 uses only the last 256 requests. Dashboard alerts have no external delivery. Worker exceptions are generic warnings without safe correlation/category; no asset/Git cleanup/capacity/backup/provider-progress telemetry exists.
- **Root cause:** Monitoring is a UI snapshot, not an aggregated metrics/incident system.
- **Fix proposal:** Export minimal protected counters/histograms and centralize redacted logs with service/instance/request/job IDs and safe error categories. Add external paging for readiness, queue age/progress, pool wait, disk/inodes, cleanup backlog and backup/restore failure. Preserve payload/credential exclusion; scrub SDK stream errors instead of assuming redaction catches arbitrary nested fields.
- **Files:** `API/app.ts:25-49`; `API/lib/logger.ts:6-20`; `API/middlewares/error-handler.ts:38-50`; `API/services/operations.ts:11-104`; `API/intelligence-worker.ts:24-43`; `API/routes/community.ts:76-81`; `docs/operations.md:14-20`.
- **Validation:** Restart/replica aggregation, stalled-but-heartbeating worker, injected provider/DB/storage errors, alert delivery/deduplication and log canaries with synthetic sensitive fields.
- **Status:** Dashboard implemented; external telemetry/paging unverified/not provisioned in code.
- **Remaining risk:** Admin login/provider outage must not be the only path to incident visibility.

### SEC-19 — Readiness/preflight scope must not be overstated

- **Component:** Liveness, schema readiness and deployment checks.
- **Severity:** Medium; partly remediated baseline.
- **Finding:** `readyz` now checks all expected table/column names. Preflight checks named indexes/constraints, exact migration hashes/timestamps, six required role mappings, selected-provider configuration, namespace and enabled-worker heartbeat. Name presence is not type/default/predicate/constraint-validity equality; no enabled store/provider/backup readiness is certified.
- **Root cause:** Intentional lightweight health probes and structural preflight, with older operations documentation lagging implementation.
- **Fix proposal:** Retain fast nonmutating liveness/readiness; make dependency/degradation semantics explicit. Add separately authorized full schema/grant/TLS diff and store acceptance gates. Detect disabled/unvalidated constraints or invalid indexes where required, not only names. Update documentation to match current scope; do not make readiness perform production uploads.
- **Files:** `API/services/health.ts:15-37`; `artifacts/api-server/scripts/preflight.mjs:23-165`; `artifacts/api-server/scripts/preflight-schema.mjs:36-139`; `docs/operations.md:11`.
- **Validation:** Same-name wrong-type/index definition, missing columns/grants/ledger, stale heartbeat, Firebase-only config and unavailable optional store, all in isolated fixtures.
- **Status:** Earlier schema/provider/namespace defects improved; broader readiness remains unverified.
- **Remaining risk:** Exact deployment artifact must include preflight metadata files; a green probe is not launch approval.

### SEC-20 — Backup/drain/restore is documented, not established

- **Component:** Multi-store disaster recovery and maintenance.
- **Severity:** High data-loss/recovery gate.
- **Finding:** API/index supports bounded shutdown and rate-limit housekeeping; worker stops new work after signal and drains current iteration. Maintenance leaves auth/session/rate-limit writes and reads operating. PostgreSQL-only recovery cannot restore image/Git bytes. No paired restore/RPO/RTO proof was inspected.
- **Root cause:** Stores and writers have independent lifecycles; maintenance is not a write barrier.
- **Fix proposal:** Establish explicit RPO/RTO, drain/stop every writer including cleanup and auth where required, record a DB/object-version/Git consistency point and retain encrypted off-host backups. Restore into isolated staging with outbound provider delivery/payment/AI disabled; verify object/ref integrity before cutover. Rehearse artifact/schema-compatible rollback and forced termination recovery.
- **Files:** `API/index.ts:19-40`; `API/app.ts:90-105`; `API/intelligence-worker.ts:10-38`; `docs/operations.md:24-36`.
- **Validation:** SIGTERM during DB/provider/Git/image work, timeout kill, full isolated restore, SQL heads/tags/retained PRs and image reference reads, private tenant checks and measured recovery times.
- **Status:** Unverified gate; no backup, restore or service action performed.
- **Remaining risk:** Provider version retention and privacy deletion from backups need an explicit policy; maintenance alone cannot close this gate.

### SEC-21 — Privacy/export/deletion and retention capabilities are incomplete

- **Component:** Personal data lifecycle and publication controls.
- **Severity:** High real-user launch capability gap, not a legal conclusion.
- **Finding:** Data includes contacts, sessions/security events, public profiles/social graph, applications/private conversations, assessments and AI inputs/results. There is no authenticated whole-account export/deletion/ownership-transfer lifecycle in inspected routes/actions. Disabling a user is not erasure. Assessment results become public with a published handle, without per-result publication control. Auth cleanup is request-triggered; worker retention covers only some queue/budget data; open attempts/pending assets and other records lack comprehensive expiry.
- **Root cause:** Feature-specific deletes/cascades are not a cross-provider/cross-store privacy workflow.
- **Fix proposal:** Inventory each data family and purpose; define owner-approved retention/publication/hold decisions. Implement authenticated, fresh-step-up export and durable deletion requests with identity verification, organization ownership resolution, provider revocation/deletion and image/Git outbox completion. Make public assessment visibility explicit. Schedule retention independently of user traffic with bounded batches and audit evidence.
- **Files:** `API/routes/index.ts:19-27`; `API/services/auth-actions.ts:63-418`; `API/services/auth-account.ts:87-153`; `API/services/assessments.ts:134-154`; `API/services/auth-cleanup.ts:3-20`; `API/services/intelligence-worker.ts:155-164`; `DB/*` cascades.
- **Validation:** Two-account export isolation, fresh-MFA/replay denial, last-owner/transfer, deletion crash/retry, provider failure, retained audit minimization, backup restore deletion replay and private/unpublished assessment results.
- **Status:** Open/source-confirmed capability gaps; no legal applicability determination made.
- **Remaining risk:** Vendor/region/minors/hiring-data/retention choices require qualified owner review; no GDPR/CCPA/other compliance claim follows from code alone.

### SEC-22 — Release packaging and CI are not deployment acceptance

- **Component:** Build artifacts, migration inclusion, CI/supply chain and runtime supervision.
- **Severity:** High release gate.
- **Finding:** CI uses disposable PostgreSQL, frozen install, audit, lint/format/types/tests and API/web builds. It does not establish live-provider acceptance, worker supervision, immutable artifact promotion, branch protection or paired restore. Build externalizes cloud/Firebase packages; a dist-only archive is not a complete runtime. Current untracked migration/auth files are not yet guaranteed in a clean release.
- **Root cause:** Successful workspace builds are being asked to stand in for packaged/deployed artifact evidence.
- **Fix proposal:** Parent packages an allowlisted clean artifact including required runtime dependencies and all schema/preflight metadata, excluding environments/credentials/data/backups; smoke-test API and worker from that fresh package in disposable infrastructure. Add generated-contract drift enforcement, appropriate dependency/secret/SAST gates and protected promotion. Reuse existing build rather than changing hosting as part of lifecycle fixes.
- **Files:** `.github/workflows/ci.yml:9-54`; `artifacts/api-server/build.mjs:17-23,30-103`; `artifacts/api-server/package.json:6-14`; `package.json:7-16`; current git status; `docs/build-checklist.md:68-77`.
- **Validation:** Fresh checkout/package presence audit, external dependency resolution, worker startup/drain fixture, secret/data exclusion and provenance/CI readback. Any server/test execution is owned by parent, not performed here.
- **Status:** Historical local build evidence only; release/deployment gate open.
- **Remaining risk:** Dependency audit workflow presence is not a current vulnerability verdict; no advisory/network audit was run.

### SEC-23 — Moderation and abuse response are not implemented product controls

- **Component:** Public community/user-generated content.
- **Severity:** Medium capability gap; high operational relevance at public launch.
- **Finding:** User status/platform-role management exists, but inspected routes do not implement reporting/blocking, moderation cases/actions/appeals or a full abuse-response workflow. Upload/write rate limits do not replace those capabilities.
- **Root cause:** Administrative account controls are narrower than content/community safety operations.
- **Fix proposal:** Define enabled public scope and minimal report/block/review/decision/audit tooling before onboarding untrusted public users, or explicitly restrict launch audience/features. Do not label account-disable alone as a complete moderation system.
- **Files:** `API/routes/index.ts:19-27`; `API/services/auth-account.ts:72-153`; `API/services/community-social-actions.ts`; `docs/build-checklist.md:31-40`.
- **Validation:** Reporter/subject/admin separation, private evidence access, repeated abuse, appeals/audit and deleted-content behavior using disposable fixtures.
- **Status:** Open/source-confirmed absence in exposed API inventory.
- **Remaining risk:** Human operational ownership and response coverage cannot be inferred from source.

## Payments and privacy applicability (technical inventory, not legal advice)

| Capability                                                                        | Actual code applicability                                                                                                                                                                                                                            | Audit implication                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checkout, customer billing, subscriptions, refunds and payment webhook processing | **Not implemented/found** in inspected API route/service inventory, API package dependencies, schema inventory or frontend search. No Stripe/Razorpay/PayPal SDK or charge path appears in those surfaces.                                           | Payment processing/idempotency/refund/ledger controls are **not applicable to currently implemented product flows**. This is not a PCI or legal exemption determination. Any future payment feature needs a fresh audit. No payment was attempted. |
| Compensation text in opportunities                                                | Career fields store/display compensation descriptions (`careers-actions.ts:56-78`); they do not transfer funds.                                                                                                                                      | Do not confuse job compensation fields with a payment integration.                                                                                                                                                                                 |
| AI and SMS vendor spending                                                        | Implemented outbound provider calls and usage estimates/count budgets exist.                                                                                                                                                                         | Spending/abuse controls apply even though customer payments are absent; see SEC-12/17.                                                                                                                                                             |
| Managed provider credentials and contacts                                         | External identity provider plus encrypted DB session credentials; provider is selected at runtime.                                                                                                                                                   | Requires native lifecycle/revocation, least privilege and retention acceptance; not a local password database certification.                                                                                                                       |
| Public profiles/social/project data                                               | Handles and public visibility make data intentionally readable; project/org defaults are public, and missing org profile often coalesces to public (`community-policy.ts:23-26`; `DB/community-projects.ts:31`; `DB/community-organizations.ts:20`). | Explicit publication choices/disclosures are relevant; verify private defaults where the product requires them.                                                                                                                                    |
| Talent discovery                                                                  | Career profile `discoverable`/availability gates directory inclusion (`careers-query.ts:110-125`).                                                                                                                                                   | Useful control, but not deletion/export or control over all public profile/assessment data.                                                                                                                                                        |
| Assessments                                                                       | Owner-scoped attempts; latest completed results are exposed for an active published handle (`assessments.ts:57-81,134-154`).                                                                                                                         | Publication/retention is applicable even though scoring is self-directed and not proctored certification.                                                                                                                                          |
| Hiring conversations                                                              | Applicant/current organization manager read/write scope; stored notes and message bodies.                                                                                                                                                            | Access-revocation, retention, export/deletion and notification minimization matter; no legal hiring-system classification is asserted.                                                                                                             |
| External AI processing                                                            | Direct assist sends supplied source; plans send skill strings; security scanner reads Git locally and records hints without source snippets (`community-ai.ts:35-45`; `intelligence-provider.ts:18-23`; `intelligence-scanner.ts:47-68`).            | Distinguish local scanning from vendor disclosure; consent/disclosure/retention cannot be generalized from one endpoint.                                                                                                                           |
| Whole-account privacy operations                                                  | Not implemented as a complete workflow; feature deletes and disable controls are narrower.                                                                                                                                                           | SEC-21 remains a launch decision/blocker for real user data; legal/privacy owners decide required scope and notices.                                                                                                                               |

## Phased readiness matrix (14 assessment gates)

These are **audit gates**, not a claim that the repository's four-stage production roadmap has been replaced by fourteen implemented phases. `Fixture evidence` means previously recorded tests, not a new run. No row is production-certified.

| Gate | Component/scope                                       | Current status                                                            | Smallest next acceptance / owner handoff                                                                                                         |
| ---- | ----------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Scope, source/release inventory                       | Partial: dirty/untracked work; baselines reconciled                       | Parent freezes enabled scope and packages complete source/migrations; SEC-22.                                                                    |
| 2    | Selected-provider primary identity                    | Fixture evidence; real provider unverified                                | Authorized staging Google/GitHub or Supabase lifecycle, wrong-project/revocation/outage; SEC-09/10.                                              |
| 3    | MFA/recovery/initial operator                         | Blocked for complete Firebase-native lifecycle; Supabase policy gaps      | Native lifecycle/bootstrap and credential-event tests; SEC-08/09/11/12.                                                                          |
| 4    | Tenant authorization/private reads                    | Positive source controls and historical fixtures; native races unverified | Independent-role HTTP/native concurrency matrix, notification scoping; SEC-07/13/14.                                                             |
| 5    | Native DB schema/system data/grants/TLS               | Offline 45-table/11-entry inventory; no hosted readback                   | Approved exact-target schema/ledger/grant/TLS review; SEC-07/08/19.                                                                              |
| 6    | Image ingress/quarantine/decoding                     | **Blocked**                                                               | Enforced byte boundary and bounded decoder before new public uploads; SEC-01/02.                                                                 |
| 7    | Asset deletion/promotion/expiry                       | **Blocked**                                                               | Durable intent/outbox, idempotent cleanup and failure/crash regression matrix; SEC-03/04.                                                        |
| 8    | Git persistence/quota/cascade cleanup                 | **Blocked when enabled**                                                  | Durable volume, allocation/tombstones, GC/restore-safe reference coverage; SEC-05/06.                                                            |
| 9    | Domain integrity/careers/assessments/privacy defaults | Partial fixture evidence                                                  | Focused invariants, destructive paths and publication/revocation tests; SEC-14/15/21.                                                            |
| 10   | Queue/worker resilience                               | Durable source mechanics; operations unverified                           | Native multi-worker fencing, crash/drain/outage and last-progress alerts; SEC-16/18.                                                             |
| 11   | AI/external delivery/spending                         | Inconsistent endpoint controls; real-provider acceptance open             | Shared global reservations, explicit models/consent and unknown-outcome policy; SEC-12/17. Customer payment gates N/A for implemented scope.     |
| 12   | Privacy/retention/moderation                          | **Missing end-to-end capabilities**                                       | Export/deletion/ownership/retention decisions and scoped abuse operations; SEC-21/23.                                                            |
| 13   | Observability/backups/incident response               | Dashboard/docs present; durable external controls unverified              | Paging, protected aggregate metrics, paired restore and measured RPO/RTO; SEC-18/20.                                                             |
| 14   | Clean artifact/staging acceptance/release             | **Not approved**                                                          | Parent-owned tests on disposable targets, fresh package/worker smoke, independent security review and explicit deployment authorization; SEC-22. |

## Implementation order without redesign

1. **Contain enabled-risk surfaces:** disable new image upload issuance until ingress is bounded; leave existing authorized reads working. Keep Git writes disabled where durable storage/capacity is not established. These are recommendations, not changes made here.
2. **Implement one small durable lifecycle substrate:** explicit object/repository target, owner/capacity reservation, intent state, stable operation key, timestamps/capability expiry, attempt/next-run and fenced lease, safe outcome/error category. Outbox rows must survive resource cascades. Reuse it for asset deletion, promotion/expiry and repository tombstones; do not introduce a new queue technology just for this fix.
3. **Fix deletion-before-commit first:** transactional metadata/audit/outbox, then idempotent external cleanup. Add rollback/crash tests before extending to promotion and cascade deletion. Never delete cloud bytes or directories as compensation for an unconfirmed DB commit.
4. **Add bounded ingress/decoder and accounting:** provider-independent service tests plus separately authorized real-storage acceptance. Include late signed-PUT recreation and source-generation/version cleanup in lifecycle tests.
5. **Close identity/DB/deployment gates independently:** provider-native lifecycle, I/O fencing, target grants/system data/bootstrap, privacy decisions, aggregate alerts and paired restore. Do not mark a storage code fix as resolution of these infrastructure prerequisites.

## Parent validation handoff and stop conditions

- No existing or hosted database is a test target. Parent must create/identify a disposable isolated native PostgreSQL target and temporary Git root; mock provider/storage failures explicitly. Never inherit an unknown DATABASE_URL. Existing test opt-in flags and NODE_ENV are not proof of target safety (`tests/setup.ts:1-4`; `lib/db/scripts/migrate-dev.mjs:6-14`).
- Native race tests must use independently acquired clients and explicit transactions; `pool.query('BEGIN')` is not a safe substitute for pinning a client in a new concurrent fixture. Embedded SQL remains useful but cannot establish concurrent native behavior.
- Preserve generation pinning, private/no-store image authorization, project/member grants, SQL head authority, read-only Git RPC, native MFA and unknown-provider-no-retry semantics during the minimal changes.
- Freshly verify unit, native concurrency/integration, API/worker/web builds and isolated browser flows against the final implementation. Historical JSON numbers above are not new test results for a later tree.
- Storage/identity/provider/backup acceptance needs exact-target confirmation and separate authorization. No production deletion/repair, secrets change, data deletion, migration rollout, charge or deployment is implied by the fix proposals.
- Release remains blocked while enabled uploads have unbounded ingress, irreversible precommit deletion exists, enabled Git lacks durable quota/cleanup, or real identity/native DB/restore/security gates remain unverified. A disabled optional feature can narrow scope, but cannot silently substitute for a promised working capability.
