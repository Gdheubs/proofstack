# ProofStack four-stage production build

Status: NOT approved for production. Source is the audited Foundation ZIP extracted into this repository. Original archive is unchanged. Existing Supabase project was resumed and inspected with approval; no hosted migrations or production deployment performed.

## Stage 1 — Backend (active)

### Baseline and release scope

- [x] Recover audit and identify exact source archive.
- [x] Extract safe working copy and create version-control baseline.
- [x] Frozen installation, native PostgreSQL suite (135 passed), embedded DB suite (44 passed), lint, format, types and API/worker production build reproduced.
- [x] Full existing integration suite executed on disposable native PostgreSQL.
- [ ] Dedicated native concurrency/race, outage and recovery acceptance matrix (neither embedded SQL nor serial native suite closes this gate).
- [ ] Confirm enabled v1 functionality versus complete original Git/CI/intelligence roadmap.

### Concrete defects from audit

- [ ] F04: Remove provider network I/O from long database session transactions with refresh fencing/revocation tests.
- [x] F17: Reject release refs that cannot be synchronized by Git (including prerelease .lock and length bounds).
- [x] F18: Align legacy organization-role changes with native-factor, active-last-owner, actor-grant, member-quota and session-revocation safeguards; equivalent cases pass through both API paths. Shared-service consolidation remains a maintainability improvement.
- [x] F19: Apply active-owner visibility to project-backed direct image access.
- [x] F20: Isolate anonymous and OAuth authentication rate budgets while retaining named account/IP protections.
- [x] F21: Enforce account recovery lockdown on existing Git tokens; recovery and disabled-user checks verified. Permanent security-event token revocation policy remains open.
- [ ] F22: Define recovery credential invalidation on factor removal/replacement and test it.
- [ ] F23: Persist accepted/failed/unknown SMS delivery transitions with safe retry/reconciliation.
- [x] F24: Use the existing grant-aware project edit authorization for editing/deleting other contributors' entries.
- [ ] F25: Resource-aware notifications must not disclose private metadata after access revocation, at delivery and read time.

### Missing production backend capabilities

- [ ] F05/F06: Upload ingress byte caps, bounded decode/re-encode, quarantine, quotas and staging lifecycle.
- [ ] F09: Durable storage cleanup/outbox and DB/Git/image reconciliation, crash recovery and safe deletion.
- [ ] F07: Reporting, blocking, moderation cases/actions/appeals and audited human operations.
- [ ] F08: Authenticated privacy export/deletion lifecycle, ownership transfers and retention/hold handling.
- [ ] F10: Versioned encryption envelopes/key rotation or explicit forced-session-reset runbook and tests.
- [ ] F12: Explicit AI models, shared usage reservations/global spending controls, safe outputs and cancellation semantics.
- [ ] F13: Aggregate telemetry, external paging, provider outage controls, worker progress and pool/disk alerts.
- [ ] F14: Fresh deploy-artifact packaging and worker smoke tests, supply-chain gates and protected CI promotion. Generated-contract drift check and local API smoke have passed.
- [ ] F16: Complete promised history pagination/search, measured query plans and accurate documentation.
- [ ] F15: Decide and either implement or explicitly disable/defer external Git push, SSH/import, isolated executable CI/CD, richer collaboration and advanced intelligence. These are not mere deployment settings.
- [ ] F02/F03: Live provider acceptance, route/action cross-tenant tests, load/failure/race/recovery evidence.

Stage 1 exit: enabled API workflows correct and contract-covered; no unresolved backend launch blockers; native concurrency and provider acceptance evidence recorded. Until then, Stage 2 preparation does not mean Stage 1 is complete.

## Stage 2 — Supabase database, identity and storage (pending)

- [x] User-managed Supabase sign-in completed in preview.
- [x] Existing project identified: proofstack / klnxrwwixynheasqiqjl / Gdheubs's Org / Tokyo; main branch labeled PRODUCTION. User authorized resume and read-only inspection only.
- [x] Existing project resumed with user approval; exact dashboard readback showed Healthy. Table Editor displayed no public tables/views; full schema/Auth/storage review still pending. No hosted migrations or data edits performed.
- [ ] Separate staging/production databases, Auth configuration, secrets and storage.
- [ ] Preserve and validate Drizzle migration history; authorized migration plan with exact target confirmation, no startup DDL.
- [ ] F26: Provision/verify required roles, permissions and mappings, not just tables.
- [ ] F11: Least-privileged runtime/migration/worker roles; restricted Data API exposure and reviewed RLS strategy.
- [ ] Verified TLS and appropriate pool mode/connection limits (persistent backend: direct or session pooler).
- [ ] F27: Named, MFA-verified, one-time audited initial-operator bootstrap without development-mode bypass.
- [ ] Replace Replit-only image storage adapter with Supabase private storage where approved, using verified limits and cleanup.
- [ ] Configure enabled email/OAuth/SMS/MFA identity channels and test actual delivery/recovery.
- [ ] Backups/PITR according to selected plan, isolated restore drill, DB/Git/image consistency and approved RPO/RTO.

## Stage 3 — UI/UX (pending)

- [x] Production web build and generated-contract drift check passed; deployed same-origin routing acceptance remains pending.
- [ ] Contract-generated client integrity and private cache clearing on account/access changes.
- [ ] Real role/tenant browser journeys for enabled features.
- [ ] Accessible mobile/keyboard forms, errors/loading states, confirmations and privacy/moderation screens.
- [ ] Honest unavailable-feature and AI/scan coverage labels.

## Stage 4 — Security/compliance and production release (pending)

- [ ] Threat model, applicable ASVS controls and independent security review.
- [ ] Deployed HTTPS/CSP/cookies/proxy/CORS, private networks, non-root services and scoped secrets.
- [ ] Current dependency/secret/SAST/container/IaC checks as applicable; protected CI and immutable artifact promotion.
- [ ] Region/jurisdiction, privacy/terms/minors/hiring-retention approval; vendor review. No certification claim from code alone.
- [ ] Durable Linux API/Git storage and separate supervised worker topology (frontend-only deployment is insufficient).
- [ ] Staging acceptance, performance/cost objectives, external alerts and incident/rollback/key-rotation drills.
- [ ] Confirm hosting account/domain/budget and authorize production target before provisioning/deploying.
- [ ] Verify exact deployed URLs/configuration/artifact, provider readback and live smoke journeys.

## Evidence

Evidence is recorded in [backend-verification.md](backend-verification.md); machine-readable native results are in ignored `.local/native-test-results.json`. Provider credentials must not be pasted into chat or committed. Local build support scripts/logs live under ignored `.local/`.
