# Production readiness execution plan

This plan is a live delivery checklist for the intended **controlled beta**.
It converts the current risk register into independently verifiable chunks.
No checked item means an external provider has been configured unless the
evidence section says so.

## Release boundary

- [x] The application is a Next.js 16 frontend, Express 5 API, PostgreSQL/Drizzle data layer, Supabase-managed identity, and optional workers.
- [x] The target layout is Vercel for the frontend, Render for the API, Supabase for PostgreSQL/Auth/Storage, and GitHub Actions for CI.
- [x] Native Git hosting, background intelligence jobs, and image uploads remain disabled for the initial free-tier beta until their durable-storage/worker controls have been implemented and accepted.
- [ ] A product owner has approved the beta privacy notice, terms, support contact, retention schedule, account-erasure policy, and external AI provider policy.

## Chunk 1 — repository and deployment baseline

- [x] Remove Replit deployment scaffolding and unused mockup workspace.
- [x] Remove Replit-only development CORS, CSP, authentication-origin, and Next development-origin allowances.
- [x] Document the Vercel, Render, Supabase, and GitHub target layout.
- [x] Add a non-deploying Render Blueprint for the API with a health check and secret placeholders.
- [ ] Confirm the Vercel project is configured with `artifacts/proofstack` as its Root Directory and `API_INTERNAL_ORIGIN` set to the HTTPS Render API origin at build time.
- [ ] Confirm production environment variables exist only in Vercel, Render, and Supabase secret/configuration stores.
- [ ] Verify the exact GitHub commit is pushed and hosted CI passes.

**Exit evidence:** a clean checkout installs from `pnpm-lock.yaml`; lint, typecheck,
tests, API build, and Next build all pass from the exact release commit.

## Chunk 2 — storage and upload hardening

- [ ] Replace the Replit/Google sidecar object-storage adapter with a Supabase Storage adapter.
- [ ] Create a private storage bucket and least-privileged storage policies.
- [ ] Enforce MIME, byte limit, decode/canonicalization, expiry, and durable promotion/abandonment state before publishing an image.
- [ ] Run a separately supervised cleanup/reconciliation worker or deliberately keep uploads disabled.
- [ ] Prove anonymous private-object denial, signed-upload constraints, cleanup retry, and crash recovery against a disposable Supabase project.

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

| Service       | Suitable beta use                             | Constraint that blocks a production claim                                                           |
| ------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Vercel Hobby  | Personal/noncommercial Next.js frontend       | Usage limits and personal-use restriction.                                                          |
| Render Free   | Staging Express API                           | Sleeps after idle, has an ephemeral filesystem, and does not provide a free persistent worker/disk. |
| Supabase Free | Fresh staging PostgreSQL/Auth/Storage project | 500 MB database, 1 GB storage, project pause after inactivity, and no automatic backups.            |

The current source must therefore keep uploads, native Git hosting, and
always-on worker features disabled until a provider and operational model
meeting their durability requirements is approved.
