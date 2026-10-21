# Production readiness execution plan

This plan is a live delivery checklist for the intended **controlled beta**.
It converts the current risk register into independently verifiable chunks.
No checked item means an external provider has been configured unless the
evidence section says so.

## Release boundary

- [x] The application is a Next.js 16 frontend, Express 5 API, PostgreSQL/Drizzle data layer, Supabase-managed identity, and optional workers.
- [x] The target layout is Cloudflare Workers for the frontend, Render for the API, Neon for PostgreSQL, Supabase for Auth, Cloudflare R2 for images, and GitHub Actions for CI and scheduled maintenance.
- [x] Native Git hosting, background intelligence jobs, and image uploads remain disabled for the initial free-tier beta until their durable-storage/worker controls have been implemented and accepted.
- [ ] A product owner has approved the beta privacy notice, terms, support contact, retention schedule, account-erasure policy, and external AI provider policy.

## Chunk 1 — repository and deployment baseline

- [x] Remove Replit deployment scaffolding and unused mockup workspace.
- [x] Remove Replit-only development CORS, CSP, authentication-origin, and Next development-origin allowances.
- [x] Document the Render, Supabase and GitHub target layout (frontend moved from Vercel to Cloudflare Workers on 2026-10-21).
- [x] Add a non-deploying Render Blueprint for the API with a health check and secret placeholders.
- [ ] Confirm the Cloudflare Worker builds from `artifacts/proofstack` with `API_INTERNAL_ORIGIN` set to the HTTPS Render API origin at build time.
- [ ] Confirm production environment variables exist only in Cloudflare, Render, Supabase and GitHub environment secret stores.
- [ ] Verify the exact GitHub commit is pushed and hosted CI passes.

**Exit evidence:** a clean checkout installs from `pnpm-lock.yaml`; lint, typecheck,
tests, API build, and Next build all pass from the exact release commit.

## Chunk 2 — storage and upload hardening

- [x] Replace the Replit/Google sidecar object-storage adapter with a Cloudflare R2 (S3 API) adapter; uploads pass through the API (source, 2026-10-21; live R2 acceptance pending).
- [ ] Create a private R2 bucket and a bucket-scoped Object Read & Write API token.
- [ ] Enforce MIME, byte limit, decode/canonicalization, expiry, and durable promotion/abandonment state before publishing an image. (MIME, byte limit, declared size, signature, one-hour expiry and full decode/re-encode with dimension, pixel, frame and time limits are enforced before the write; abandoned reservations remain.)
- [ ] Run a separately supervised cleanup/reconciliation worker or deliberately keep uploads disabled.
- [ ] Prove anonymous private-object denial, upload limits, cleanup retry, and crash recovery against a disposable R2 bucket.

**Exit evidence:** upload, completion, authorization, deletion, and recovery tests pass
against the actual selected storage provider without a Replit service.

## Chunk 3 — identity, sessions, and authorization

- [ ] Select Supabase as the only beta identity provider; leave Firebase paths disabled.
- [ ] Verify allowed redirect URLs, exact `AUTH_APP_ORIGIN`, CORS origins, cookies, logout, recovery, MFA, and privileged-role operations in the deployed environment.
- [ ] Define and implement credential revocation for factor removal, recovery, disable/reactivate, and repository clone tokens.
- [ ] Move provider I/O outside database locks only with version fencing and concurrency tests.

**Exit evidence:** two-user isolation, session expiry/revocation, recovery failure, and
administrator authorization are tested against the real provider.

## Chunk 4 — data integrity and privacy

- [ ] Apply migrations to a fresh Supabase database using the reviewed production procedure.
- [ ] Verify least-privileged runtime, worker, and migration roles; TLS; schema; indexes; constraints; and backup/export procedure.
- [ ] Implement the approved account export, deletion-request, retention, and last-organization-owner policy.
- [ ] Decide and document assessment-result publication policy.

**Exit evidence:** migration rehearsal, role review, restore rehearsal, and
two-user deletion/export isolation tests are recorded.

## Chunk 5 — operations and resilience

- [ ] Configure Sentry or equivalent redacted error monitoring.
- [ ] Configure external HTTPS uptime checks for the frontend and `/api/healthz`.
- [ ] Record owner contacts, alert thresholds, incident steps, rollback steps, and a tested recovery procedure.
- [ ] Verify worker supervision or keep all worker-dependent features disabled.
- [ ] Verify resource limits, connection pooling, rate limiting, request timeouts, and provider outage behavior.

**Exit evidence:** a controlled fault drill produces a redacted alert and the
documented recovery procedure works without data loss.

## Chunk 6 — deployment and beta acceptance

- [ ] Deploy a fresh staging release from the exact GitHub commit.
- [ ] Run public HTTPS, API, authentication, authorization, database, logging, and desktop/mobile smoke tests with dedicated test accounts.
- [ ] Verify no secrets appear in bundles, logs, responses, or commits.
- [ ] Publish the beta notice, feedback route, support contact, privacy policy, terms, and data-deletion instructions.
- [ ] Approve the controlled-beta release only after every enabled feature has its exit evidence.

## Known free-tier constraints

| Service                 | Suitable beta use                     | Constraint that blocks a production claim                                                           |
| ----------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Cloudflare Workers Free | Commercial-use Next.js frontend       | 3 MiB compressed Worker and about 10 ms CPU per request; Paid is $5/month.                          |
| Render Free             | Staging Express API                   | Sleeps after idle, has an ephemeral filesystem, and does not provide a free persistent worker/disk. |
| Neon Free               | Application PostgreSQL with branching | 1 GB per project, 100 CU-hours/month, scale to zero after 5 minutes, 6-hour restore history.        |
| Supabase Free           | Auth only                             | 50,000 MAU; project pauses after a week of inactivity; no automatic backups of the auth schema.     |

The current source must therefore keep uploads, native Git hosting, and
always-on worker features disabled until a provider and operational model
meeting their durability requirements is approved.
