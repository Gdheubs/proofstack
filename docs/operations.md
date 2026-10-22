# Operations and recovery

Phase 7 provides operational controls, not a provisioned production environment. Keep secrets in deployment configuration. Apply the tracked schema through the documented Replit Publish workflow, including `0009_orange_firelord.sql`, before starting the new API/worker. Do not run development migrations or integration tests against production. New indexes can lock busy tables during creation; schedule schema changes during a controlled maintenance window and review the publish diff.

## Deployment checks

1. Configure exact HTTPS `AUTH_APP_ORIGIN`, managed identity, a random session secret, database TLS and least-privileged credentials. Review `.env.example`, `identity.md`, `database.md` and feature setup documents.
2. Set `TRUST_PROXY_CIDRS` only to the actual trusted proxy IPs/CIDRs. Default blank ignores forwarded client IPs. Verify separate clients receive separate limits through the deployed proxy and that client-supplied forwarding headers cannot change their effective identity. Never use a universal CIDR or hop-count trust.
3. Provision private durable Git storage before setting `REPOSITORY_ROOT`. It must not be a public web directory or ephemeral autoscale filesystem. Restrict its OS mode to 0700 and run all Git processes under the intended service user. Do not horizontally scale Git writers across uncoordinated/local volumes.
4. Start web/API and, when enabled, the separately supervised intelligence worker. API pools allow ten connections per process; each worker has its own pool. Budget the total against PostgreSQL connection limits before adding replicas. Set termination grace to at least 85 seconds; API/worker drain is bounded at 80 seconds.
5. Run `pnpm --filter @workspace/api-server run ops:preflight` with the exact production environment. It is read-only, emits no configuration values and exits nonzero on failed checks. It checks configuration presence, key tables, Phase 7 indexes and recent worker heartbeat when enabled. It does not validate every schema column, provider entitlement, TLS topology, randomness, storage durability or backups. Review the complete schema Publish diff separately.
6. Run CI with native PostgreSQL and perform the role-based acceptance matrix below. The local embedded database suite is useful evidence but does not establish native concurrent transaction behavior.

## Monitoring and performance

`/api/healthz` is liveness; `/api/readyz` verifies the database. Neither proves identity, AI, email/SMS or object storage availability. `/account/operations` and `GET /api/operations` require an active admin/super-admin session and fresh verified native MFA. Roles/session revocation are rechecked in the database. Responses are private/no-store and the endpoint is limited to ten requests per minute.

The dashboard exposes process uptime, RSS, request/in-flight/5xx counts, recent p95 latency (last 256 requests on that process), database pool waiters, queue depth/age, recent failed jobs and worker liveness. It deliberately contains no provider keys, connection strings or user payloads. A worker is considered live after a heartbeat within 180 seconds; this is a liveness signal, not a guarantee of progress. Counts restart with the process and are not aggregated across replicas. Alerts appear in the dashboard; external paging/email alert delivery is not configured.

Set external uptime alerts for readiness failure, sustained 5xx errors, oldest queued job over five minutes, absent worker heartbeat, pool saturation, storage exhaustion and backup failure. Choose thresholds after measuring actual traffic. Restrict external metric access and do not put user content in log labels.

### Logs and error monitoring

- **Logs:** the API and both workers write one structured JSON line per event with pino, carrying `service`, `release`, an ISO time and, inside a monitored request, `traceId`.
  - Each request produces one line, such as `GET /api/community 200`, with `req.id` (also returned as `X-Request-ID` and in error bodies), `responseTime` in milliseconds and `userId` when signed in.
  - Levels follow status: 5xx is `error` and 4xx is `warn`. Health probes are not logged. Cookies, auth headers and token fields are redacted, and query strings are never logged.
  - Render keeps the output under the service's Logs tab.
  - Morgan and winston are deliberately not used: they would duplicate pino-http and pino.
- **Errors and performance (Sentry, free Developer plan):**
  1. Create a Sentry organization with two projects, "Node.js" (API) and "Browser JavaScript" (web).
  2. On Render, set `SENTRY_DSN` (API project), `SENTRY_BROWSER_DSN` (web project, used only by the relay), `SENTRY_ENVIRONMENT=production` and optionally `SENTRY_TRACES_SAMPLE_RATE` (default 0.1). Render supplies `RENDER_GIT_COMMIT` as the release.
  3. In the Cloudflare Worker build variables, set `NEXT_PUBLIC_SENTRY_DSN` (web project) and optionally `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` (default 0.05).
- **What Sentry receives:**
  - **API:** unexpected errors with the request ID, account ID and error code, plus a performance trace for sampled requests. Deliberate API errors such as 4xx or "being updated" are not reported. The API is bundled, so database queries are not timed individually.
  - **Browser:** JavaScript errors and page-load traces. Browser traces link to the matching API trace.
- **Privacy safeguards:**
  - Reports go to `/api/monitoring/tunnel`, which relays only to the configured project. The browser never contacts Sentry directly, and the content security policy stays same-origin.
  - Cookies, request bodies, query strings, auth headers and user details other than the internal account ID are removed before anything is sent.
- **Alerts:** in Sentry, add issue alerts for new issues and for more than 10 events in 5 minutes, and a performance alert on p95 above 2 s. Point UptimeRobot (free) at the website's `https://<site>/api/healthz`, which checks the website and the API together, for uptime, never `/api/readyz` (see the Neon notes).

Run `pnpm --filter @workspace/api-server run ops:benchmark -- http://127.0.0.1:8080` on local staging. The script sends 40 requests per endpoint with concurrency four, uses timeouts and reports failures/p50/p95. It accepts loopback targets only and does not establish a throughput SLO. For launch, seed representative project/contributor/application volumes and measure database plans, latency, memory and queue lag under expected concurrent roles. Project-card reads are batched into four queries for a page; other lists and bounded offset pagination still require scale evaluation. Do not describe the included fixture timing as a production load test.

## Maintenance and rollback

Set `MAINTENANCE_MODE=true` on **every API and worker** and restart/redeploy them. This rejects new product mutations with 503 and stops new worker claims. Authentication, read-only requests and Git clone/fetch remain available. In-flight work may finish; this is not an instantaneous transaction or backup barrier. Wait for running jobs and API mutations to drain before stopping services for a consistent backup. Maintenance does not make auth/session/audit/rate-limit tables read-only.

For an incident, preserve safe request IDs and timestamps, disable the affected optional feature, revoke compromised sessions/tokens with the existing account controls and rotate provider secrets through the secret store. Do not log tokens or export user data to issue trackers. Investigate any external AI charge before manually retrying a job with uncertain completion.

Keep the previous verified application artifact, its configuration names and matching schema release. Prefer backward-compatible additive migrations. On failed release, enable maintenance, drain workers, restore the previous application only if it is schema-compatible, then validate readiness and role-based smoke flows. Do not blindly reverse database migrations. Restore to a separate environment if destructive schema/data changes prevent safe rollback, reconcile writes, and plan the cutover explicitly. This rollback procedure has not yet been rehearsed on a deployed environment.

## Backup and restore drill

Back up PostgreSQL, the durable Git volume and object storage together with a documented consistency point. Configure encrypted off-host retention, access controls and provider point-in-time recovery where supported. Never store backups or credentials in the source ZIP. Choose and record an acceptable recovery point/time objective before launch.

During the first drill, drain/stop writers and workers; obtain a provider database snapshot (or `pg_dump --format=custom` using secret-managed credentials), snapshot Git storage, and record object versions. Restore **into isolated staging**, using the same database major version and service UID. Use `pg_restore --no-owner --no-acl` where appropriate for the target privilege model. Restore Git paths/permissions and object versions; do not connect restored staging to production email/SMS/AI credentials. Verify schema, counts, private tenant boundaries, repository branches/commit objects/tags, release snapshots, upload references and queue states. Check an actual clone and file read. Measure elapsed restore time and document any lost writes. Test deletion/retention policies against backup obligations. No native backup or restore drill was possible in this local checkpoint.

## Scheduled maintenance (GitHub Actions)

The free-tier deployment has no always-on worker, so `.github/workflows/operations.yml` runs maintenance on a schedule. It runs only on its schedule or a manual **Run workflow** (choose `cleanup` or `backup`), never for pull requests or pushes. Scheduled runs are skipped until the **repository** variable `OPERATIONS_ENABLED` is `true` (set it after the environment below is configured and a manual run of each task succeeds); manual runs are never skipped. Both jobs use the protected GitHub environment `production`; create it under Settings → Environments, restrict it to the default branch, and add:

| Kind     | Name                                                     | Used by | Value                                                                                       |
| -------- | -------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------- |
| Variable | `PRIVATE_OBJECT_DIR`                                     | cleanup | Same `/<bucket>/<prefix>` as the API                                                        |
| Variable | `R2_ENDPOINT`                                            | both    | `https://<account-id>.r2.cloudflarestorage.com`                                             |
| Variable | `BACKUP_BUCKET`                                          | backup  | Name of the separate, private backup bucket                                                 |
| Secret   | `DATABASE_URL`                                           | cleanup | Neon **direct** connection string (as on Render)                                            |
| Secret   | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`               | cleanup | The API's image-bucket token                                                                |
| Secret   | `BACKUP_DATABASE_URL`                                    | backup  | Neon direct string for a role that can read `public` and `drizzle`                          |
| Variable | `IDENTITY_BACKUP_ENABLED`                                | backup  | `true` to also back up the Supabase `auth` schema                                           |
| Secret   | `IDENTITY_BACKUP_DATABASE_URL`                           | backup  | Supabase **session pooler** string (GitHub runners have no IPv6) that can read `auth`       |
| Secret   | `BACKUP_PASSPHRASE`                                      | backup  | 32+ random characters; store a copy outside GitHub — backups cannot be decrypted without it |
| Secret   | `BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY` | backup  | A token scoped to the backup bucket only                                                    |

**Image cleanup** runs every 6 hours (`17 */6 * * *`): it builds the API and runs `worker:asset-cleanup:once`, which drains due deletion jobs (at most 500 or 8 minutes per run) under the same leases, namespace allowlist and 120-second per-job deadline as the always-on worker, then exits. Deleted images keep their quota reserved until processed. Six-hourly runs keep the private repository within GitHub's free Actions minutes; run it hourly only with a paid plan or a public repository.

**Database backup** runs nightly at 20:41 UTC (02:11 IST): `scripts/backup-database.sh` dumps the Neon `public` and `drizzle` schemas with `pg_dump` 17 (custom format), refuses an archive missing core tables, encrypts it with GPG AES-256 and uploads `database/proofstack-<UTC stamp>.dump.gpg`. With `IDENTITY_BACKUP_ENABLED=true` it also dumps the Supabase Auth `auth` schema (requiring `auth.users` and `auth.identities`) to `database/identity-<UTC stamp>.dump.gpg`; sign-in identities live there, not in Neon. Use libpq TLS settings in these URLs (`sslmode=require`, or `verify-full` with `sslrootcert=system`). Use a dedicated R2 bucket and token so the API's credentials cannot read or delete backups, and add an R2 lifecycle rule deleting `database/` objects after 30 days. Images in R2 are not copied; R2 itself is the durable store for them.

Every CI run exercises the same scripts end to end: it backs up the disposable CI database, restores into an empty database, compares table, migration-ledger and user counts, and confirms a restore into a non-empty database is refused.

### Restoring a backup

1. Download the object from the backup bucket and fetch `BACKUP_PASSPHRASE` from its offline copy.
2. Create an **empty, isolated** PostgreSQL 17 database (never the live one).
3. Run `RESTORE_DATABASE_URL=<empty db> BACKUP_PASSPHRASE=... bash scripts/restore-database.sh proofstack-<stamp>.dump.gpg`. It refuses a database that already has tables and restores in one transaction.
4. Inspect, then reconcile or cut over deliberately. Restoring Supabase's `auth` schema into a different Supabase project needs that project's own migration procedure; the script's target is an isolated database for drills, inspection and selective recovery.

Record each manual restore drill (elapsed time, data loss window) in a checkpoint. The nightly schedule gives a recovery point of up to 24 hours.

## Required staging acceptance

Use independent owner, admin, member, seeker, employer and outsider accounts. Verify sign-up, native MFA, recovery, renewal, revocation; public/private profile/project/org reads; role changes; uploads; job applications and employer-only conversations; repository web commits, clone, reviews, merge conflicts/protected main and releases; intelligence consent, quotas, cancellation, provider failure and worker restart; admin-only operations and stale-MFA denial. Confirm keyboard/mobile behavior, production cookies/CSP and secret-free logs in a real browser.

External Git push/SSH/import, isolated executable CI/CD and conflict-resolution tooling remain unimplemented. Static scan findings are limited heuristics and cannot certify a repository as safe. These are explicit product gaps, not environment settings that can be enabled.
