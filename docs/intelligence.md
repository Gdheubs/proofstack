# Phase 6: intelligence workspace

Phase 6 adds private, durable analyses at `/intelligence`. The implementation supports explainable opportunity matching, optional AI learning plans, and bounded repository security reviews. It does not make hiring decisions, publish generated work, or execute repository code.

## Product workflows

1. Add self-reported skills in profile settings. In the intelligence workspace, choose a workplace preference and request matches. The matcher compares the newest 500 public, open opportunities, ranks by the number of exact normalized shared skill labels, and returns at most 20. It normalizes case, whitespace and Unicode compatibility, but does not infer synonyms or assess competence. Equal counts use stable opportunity IDs. Results are rechecked against current opportunity visibility, status, creator account status, and your current skill labels when opened.
2. Open an opportunity or match and choose **Build a learning plan**. The user must consent to sending their skill labels and the opportunity's skill labels to the configured provider. Names, bios, applications, messages, and repository files are excluded. An optional AI provider returns a validated plan with up to five practice steps. The private result includes model, reported tokens, and an optional operator-rate-based cost estimate. Plans are suggestions, not verified qualifications or promises of employment.
3. In a repository you manage, choose **Security review**, select a branch and confirm its commit. Fresh native MFA is required to enqueue. The job inspects that exact commit even if the branch subsequently advances, provided it remains reachable. Only its requester, while still a current manager, can read the report. A new owner does not inherit another user's report. Findings contain rule IDs, paths, line numbers, priority and fixed review guidance, without matched source excerpts or credential values.
4. Each job has a private URL, status polling, cancellation, a review acknowledgment and result deletion. Review acknowledgment does not mark a finding fixed or alter a project. Terminal results expire after 30 days through worker housekeeping. Quota reservations remain after cancellation, failure or deletion.

## Security scan scope

The fixed `bounded-static-rules-v1` engine identifies possible private keys, selected credential token formats, literal secret assignments, disabled TLS verification and dynamic evaluation. Matches are heuristics: placeholders and tests can trigger them, and real vulnerabilities can be missed.

- Inspects at most 200 entries, 32 KiB per text file and 2 MiB of text in one commit.
- Returns at most 100 hints; records skipped files and limited coverage.
- Stops its file loop after 45 seconds; each Git subprocess has the existing 15-second timeout. Tree listings exceeding 256 KiB fail explicitly rather than implying full coverage.
- Reads regular Git blobs directly. Symlinks, submodules, binary content, excessive paths and oversized files are skipped. Executable blobs may be read as text but are never executed.
- Does not check dependencies against CVEs, query external URLs, analyze Git history or runtime behavior, run builds, or establish that a repository is secure.
- Never sends repository content to an AI provider. Investigate findings privately. Confirmed credentials require revocation/rotation and history/exposure review, not just removing the current line.

## Queue and recovery

`intelligence_jobs` stores request identity, input selection, status, lease, attempts, output and provider usage. `intelligence_budgets` stores UTC daily reservations independently of job deletion. Tracked migration: `0008_previous_vargas.sql`.

Enqueue serializes submissions per account. The same request key and input return the original job; reusing a key with different input is rejected. This deduplication lasts while that job record exists. At most two queued/running jobs and 20 daily jobs are allowed per user; AI plans additionally have three per user and 100 globally per UTC day. These are request caps, not guaranteed monetary budgets. Configure provider-side spend controls too.

A separate worker claims jobs with `FOR UPDATE SKIP LOCKED`, commits a unique lease, then performs the analysis outside the claim transaction. A lease lasts 120 seconds. Conditional completion prevents cancelled, expired or replaced workers from publishing results. Access is checked before work and again before publishing; read routes also use current permissions. Fixed local analysis may retry up to three attempts with bounded delays. Queued jobs expire after 24 hours when a worker next polls.

Before an AI call, the worker durably marks the provider attempt. It uses a 45-second provider timeout and disables SDK retries. An expired lease after that marker becomes a failed, ambiguous completion; it is never automatically called again. Reported token usage is stored before validating generated JSON, including when cancellation wins the race. Timeout or transport failure can leave usage unknown; consult provider billing. Deletion waits two minutes from provider start so an in-flight response can record usage. Cancellation suppresses the result but cannot undo an external request already sent.

The worker processes one job at a time per process, polls idle queues every two seconds and performs hourly retention cleanup. On shutdown it finishes current work before closing the pool, with an 80-second hard deadline. Use a process supervisor and monitor queue age, failed jobs, unknown provider usage and worker liveness. Multiple workers use leases, but native PostgreSQL contention/load testing is still a launch gate. PostgreSQL's documented queue use of [SKIP LOCKED](https://www.postgresql.org/docs/current/sql-select.html) underpins the claim operation.

## Enable and operate

1. Apply all tracked migrations to a disposable staging database and validate the schema diff and backup plan before production.
2. Set `INTELLIGENCE_ENABLED=true` in both API and worker environments. It defaults off. Keep the worker running as an always-on separate process; enabling the API flag alone does not start it.
3. Build with `pnpm --filter @workspace/api-server run build`, then run:

   ```sh
   NODE_ENV=production PORT=8080 pnpm --filter @workspace/api-server run worker:intelligence
   ```

   The worker uses `DATABASE_URL` and shared API configuration validation. `PORT` is required by that validation, but the worker opens no HTTP port. Do not route public requests to it.

4. For scans, install Git and provide the same private, durable `REPOSITORY_ROOT` and database as the repository API. The existing Replit autoscale filesystem is not durable repository storage. Use a dedicated durable service/volume and supervise the worker there.
5. For optional plans, configure `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`, and an explicit `INTELLIGENCE_AI_MODEL` supported by your provider's chat-completions JSON mode. No model is silently selected for Phase 6. Keep all credentials server-side. Review the provider's retention, location and pricing before enabling real user traffic. Matching and static scans need no AI credentials.
6. Optionally set `INTELLIGENCE_INPUT_USD_PER_MILLION` and `INTELLIGENCE_OUTPUT_USD_PER_MILLION` to the actual rates for that model. Estimates are USD micro-units computed from reported token totals; without valid rates/usage they remain unknown. They are approximate and do not include discounts, cached-token pricing or provider-specific fees.

`GET /api/intelligence` lists only the current user's permitted job metadata, with bounded pagination. `GET /api/intelligence?id=...` returns a private result. `POST /api/intelligence/action` accepts strict enqueue/cancel/review/delete inputs with session, CSRF and rate-limit enforcement. No browser endpoint can submit worker results or arbitrary execution commands. Closed/private target opportunities make their AI plans inaccessible; the owner can delete a known job through the action endpoint, and retention housekeeping still removes it. Completed security reports disappear from listings after management access is lost.

## Remaining acceptance work

The tests exercise real Git and embedded PostgreSQL SQL, including leases, cancellation, access revocation and simulated provider responses. They do not establish live AI response quality, native PostgreSQL concurrency under load, authenticated browser/MFA acceptance, durable storage recovery, or production deployment readiness. Run those gates with dedicated staging accounts and configured services. Full dependency/CVE scanning, semantic recommendations, isolated CI/CD and external Git push remain separate work.
