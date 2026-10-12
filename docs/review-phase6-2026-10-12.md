# Phase 6 intelligence checkpoint — 2026-10-12

Phase 6 now provides a private intelligence workspace with durable jobs and reviewable results. This is an implemented, locally verified milestone, not production certification.

## Delivered

- Explainable opportunity recommendations based on normalized overlap with self-reported skills, workplace filters, and currently public/open listings. Saved matches recheck current visibility and skills before display.
- Optional AI practice plans with explicit per-request consent, structured output validation, private result URLs, model/token records, and optional configured-rate cost estimates. Only skill labels are sent to the provider.
- Commit-pinned static repository reviews for managers, protected by fresh MFA on enqueue and current permissions on execution and reading. Fixed rules identify selected possible secrets and unsafe patterns without running repository code or returning matched source values.
- PostgreSQL queue persistence, request-key deduplication, lease fencing, bounded recovery, cancellation, retention, atomic daily quota reservations and a separately built worker process.
- Private analysis history, status polling, review acknowledgment, deletion and repository/opportunity entry points. Identity transitions clear the intelligence cache. AI output is rendered as text and is never automatically published or executed.
- Generated API contracts/clients, migration `0008_previous_vargas.sql`, environment inventory and operator setup instructions.

## Verification completed

- `pnpm check`: lint, formatting, TypeScript and 81 unit/regression tests passed.
- Full embedded PostgreSQL suite: 12 workflow tests across eight files passed. The five Phase 6 workflow tests also passed after final permission-revocation assertions were added.
- Tests cover idempotency, ownership isolation, closed/private opportunities, quota rollback and retention, active-job caps, lease recovery, stale worker fencing, cancellation during a provider call, valid/invalid simulated AI output and usage, provider ambiguity without automatic retry, real Git snapshots, stale MFA, credential-value omission and permission loss before processing.
- API, standalone worker and Next.js production builds passed. Final lint and formatting checks passed after UI review.
- Production HTTP checks passed for 24 page routes with CSP, existing public/private API boundaries, intelligence anonymous denial/no-store responses, CSRF rejection and database readiness.
- The bundled standalone worker consumed a durable opportunity job through a PostgreSQL-compatible socket, persisted its expected result and shut down cleanly on SIGTERM. The backing engine was PGlite, not a native PostgreSQL deployment.

## Configuration and remaining gates

Phase 6 defaults off. Provision and supervise its separate worker, apply the migration, then enable `INTELLIGENCE_ENABLED` in API and worker environments. AI plans additionally require configured provider credentials and an explicit supported `INTELLIGENCE_AI_MODEL`. Repository scans require Git and durable shared repository storage. See [intelligence.md](intelligence.md).

No live AI request or production deployment was performed. Provider output quality/billing, native PostgreSQL concurrent-worker behavior, authenticated browser/MFA journeys, load targets and durable backup/restore remain staging acceptance gates. No browser engine was available for interactive UI verification in this workspace.

Security reviews are bounded heuristics, not vulnerability clearance. Semantic recommendations, dependency/CVE feeds, external Git push and isolated executable CI/CD remain unimplemented. Phase 7 should establish operations, observability, load budgets, recovery drills and a tested release/rollback process while tracking these earlier-phase gaps explicitly.
