# Task checkpoints

Record each meaningful task here, including interrupted or blocked work. The checkpoint lives in the same commit as its task changes; its containing Git commit is the authoritative identifier. Publication is complete only after the remote ref has been read back and matched to that commit.

## Latest

- [Public surface, profile types and notification bell](2026-10-22-public-surface.md) — provider names and setup progress hidden from visitors, hosting headers stripped, Developer and Recruiter profiles only, header notification bell.
- [Legal pages, age and consent, data rights](2026-10-22-legal-compliance.md) — privacy policy, terms, guidelines, contact and about pages; 18+ date-of-birth gate with consent records; data export and account deletion with 180-day registration retention; retention purges; real 404 for internal pages.
- [Security hardening and adaptive skill checks](2026-10-21-security-hardening.md) — consent-based organization invitations, per-network lockouts, masked moderator contact data, hidden pending invitations, adaptive skill-check question sets with a retake cooldown, per-account limits on shared addresses, internal pages hidden in production.
- [First live review and callback fix](2026-10-21-live-review-callback.md) — live anonymous review of the deployed Worker/API; the sign-in callback no longer redirects, because the Worker's proxy followed redirects and dropped session cookies.
- [Neon application database](2026-10-21-neon-database.md) — Neon replaces Supabase Postgres (Supabase kept for Auth); new guarded migrate:release, pool/TLS/channel-binding settings, preflight checks and identity backups.
- [Cloudflare Workers frontend](2026-10-21-cloudflare-workers-frontend.md) — Next 16 runs on Workers via OpenNext (Pages is not viable); client-only editor brings the Worker to 2,636 KiB gzip; CI size gate at the free 3 MiB limit.
- [Scheduled operations](2026-10-21-scheduled-operations.md) — run-once image cleanup and encrypted nightly database backups via GitHub Actions; restore script exercised by a CI drill.
- [Social sign-in providers](2026-10-21-social-sign-in.md) — eight Supabase providers, only enabled ones shown; credential-free staging smoke check added. Real-user sign-in not yet performed (no provider apps or deployment exist).
- [Image decoding and canonical re-encoding](2026-10-21-image-reencoding.md) — uploads fully decoded and re-encoded with sharp (pixel, dimension, frame and time limits; metadata stripped) before the R2 write; decode runs outside the row lock.
- [Cloudflare R2 image storage](2026-10-21-r2-image-storage.md) — Replit/GCS adapter replaced by R2; uploads pass through the authenticated API with size/type/signature checks before the write; migration 0013 accepts R2 ETags. Live R2 acceptance pending.
- [Trusted client address behind the web proxy](2026-10-21-trusted-client-address.md) — shared-secret client-IP forwarding so browsers behind the web tier no longer share one rate-limit bucket; IPv6 bucketed by /64; preflight check added.
- [Git push write tokens and code editor](2026-10-21-git-push-write-tokens.md) — token-authorized feature-branch push, read/write token scopes, CodeMirror editor and 1 MiB web commits; ships inactive while REPOSITORY_ROOT is unset.
- [Platform workflow verification](2026-10-19-platform-workflow-verification.md) — repository collaboration, hiring listings/applications, and platform assessments verified; confirms read-only Git transport and no employer-authored custom form/assignment support.
- [Asset lifecycle local-gate repair](2026-10-19-asset-lifecycle-local-gates.md) — repaired the full-suite table-count assertion and lifecycle mock typing; local tests, typecheck, and lint pass. Drizzle snapshot and database migration validation remain open.
- [Frontend ownership cleanup](2026-10-18-frontend-ownership.md) — feature UI, shared hooks/utilities, and frontend aliases consolidated after import/build analysis; focused gates pass, while separate asset-lifecycle work blocks two repository-wide checks.
- [Replit scaffold cleanup and deployment alignment](2026-10-18-replit-scaffold-cleanup.md) — removed Replit deployment scaffolding and unused mockup workspace; runtime object storage migration to Supabase remains required before uploads can run on Render.
- [Deployment CI repair](2026-10-17-deployment-ci-repair.md) — root Express test dependencies and narrowly scoped CodeQL permission repaired; 615 local unit tests pass. Hosted verification and provider authorization remain separate gates.
- [Deployment intake](2026-10-17-deployment-intake.md) — approved free-tier, India-oriented, personal/non-commercial staging with fresh Supabase; connections and CI repairs pending. No cloud deployment created yet.
- [GitHub connection and accumulated-work checkpoint](2026-10-17-github-baseline.md) — standing task checkpoint/commit policy and initial publication preparation.

## Earlier evidence

- [Coverage continuation](../production-audit-coverage-resume.md) — 612 passing unit assertions and measured coverage; native/provider acceptance remains separate.
- [Production-readiness risk register](../production-readiness-risk-register.md) — open source and deployment risks; not release approval.
- [Retained checkpoint reconciliation](../production-audit-checkpoint-evidence.md) — older build/native/browser/recovery evidence and provenance limits.

## Entry requirements

Include scope, changed paths or logical groups, executed validation and results, unexecuted gates, blockers, and the next safe action. Never include secrets, raw personal data or credential values. Do not overwrite historical results with newer claims.
