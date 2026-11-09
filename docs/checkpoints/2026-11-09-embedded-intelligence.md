# Opportunity suggestions on the free plan — November 9, 2026

Parent: `e942770`. Part of "every feature working live".

## Problem

"Suggested for you" (and its job processing) needs the intelligence worker, a separate always-on process. Render Free has no background workers, so production runs with `INTELLIGENCE_ENABLED` off and the page says new searches are paused. Simply running the existing worker inside the API would poll the database every two seconds, keeping Neon's free compute awake around the clock (about 186 of 100 free compute-hours a month) until Neon suspends it.

## Change

- `EMBEDDED_WORKERS=intelligence` (with `INTELLIGENCE_ENABLED=true`) makes the API process jobs itself, **on demand**: after a member submits a request, when a member checks a job (the page polls every five seconds only while a job is queued or running), and once at start-up for jobs queued while the API slept. Each trigger drains due jobs (at most 50) with the same leases, retries and hourly retention cleanup as the separate worker, records a heartbeat, and stops. No timer, so the database can still sleep.
- Off unless both variables are set; nothing changes for deployments with a separate worker.
- Documented in `docs/intelligence.md` and `render.yaml`.

## Validation

- Embedded PostgreSQL: 227 passed, 2 skipped; `tests/intelligence.integration.test.ts` shows a queued job stays queued with the setting off and completes, with a heartbeat, once it is on.
- Unit: 823 passed. Typecheck, lint, format check and audit pass; the built API starts and answers `/api/healthz`.
- **Owner:** add `INTELLIGENCE_ENABLED=true` and `EMBEDDED_WORKERS=intelligence` to `proofstack-api-env`, then deploy.
