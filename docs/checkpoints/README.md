# Task checkpoints

Record each meaningful task here, including interrupted or blocked work. The checkpoint lives in the same commit as its task changes; its containing Git commit is the authoritative identifier. Publication is complete only after the remote ref has been read back and matched to that commit.

## Latest

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
