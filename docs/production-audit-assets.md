# Asset cleanup production audit

## Outcome and scope

Deletion is now an SQL outbox operation, not a storage call inside the community action transaction. `asset-delete` locks the asset, checks references, captures a canonical bucket/namespace/object name, inserts one durable cleanup job, and sets `community_assets.status='deleting'`. The enclosing audit append and transaction must commit before a separate worker can observe the job. An audit failure rolls back both the job and the status change without cloud I/O.

A deleting asset remains an upload-quota reservation and cannot be completed, served, or reattached, including through the existing-image shortcut. Repeated deletion returns the pending/operator-attention message without inserting another job. The API deliberately reports **pending**, not successful byte deletion.

The runnable worker is `artifacts/api-server/src/asset-cleanup-worker.ts`; its cleanup implementation and supervisor are separate, testable service modules. It is not started by the API or the root dev launcher. No `.env` file or root launcher/configuration was changed in this work.

## Worker protocol

- Atomically claim one due job with `FOR UPDATE SKIP LOCKED`, a random lease token and a five-minute lease. Expired leases are reclaimed; attempts are capped at eight.
- Inspect only the captured target, which must also be in `ASSET_CLEANUP_ALLOWED_NAMESPACES`. Validate canonical UUID object paths, exact namespace/object-name correspondence and generation strings before destructive work.
- Persist the observed generation with a live-lease/token compare-and-set before deleting. A changed generation fails closed; storage deletion carries the exact string `ifGenerationMatch` precondition. It never converts a generation to a potentially lossy JavaScript number.
- Only confirmed numeric provider `404` is absence. Denial, transport failure and malformed metadata retry rather than release quota.
- Acknowledge completion and delete the matching `deleting` asset in one SQL transaction, with another live-lease/token compare-and-set. Failure after an external deletion remains recoverable: a subsequent confirmed absence completes the job. The outbox deliberately has no account/asset foreign key, so already-committed cleanup survives account cascades.
- Retry failures with exponential backoff; retain the pinned generation. At the eighth failed attempt, leave the job failed and quota held for operator review. Persist only fixed error codes, never provider messages or signed URLs.
- A pending upload's job is not due until its `created_at + 1 hour`, beyond the current 15-minute signed PUT lifetime and the completion window. Immediate absence must not release a still-live upload reservation.

The worker does not import HTTP/auth-session initialization. It has no `PORT`, cookie, Firebase or Supabase configuration requirement.

## Explicit deployment, default off

Build the API artifact, then run its dedicated script under an external process supervisor:

```sh
pnpm --filter @workspace/api-server build
pnpm --filter @workspace/api-server worker:asset-cleanup
```

Required environment, supplied by the operator rather than committed into `.env`:

```text
ASSET_CLEANUP_ENABLED=true
ASSET_CLEANUP_ALLOWED_NAMESPACES=/approved-bucket/private-prefix
DATABASE_URL=<explicit migrated PostgreSQL database URL>
```

The allowlist is a comma-separated list of canonical `/bucket/nonempty-prefix` values. Include retired prefixes only after an operator verifies their queued snapshots; there is no wildcard, root namespace, trailing slash or dot-segment support. Missing/false enablement, empty/unsafe allowlists, or a missing/non-PostgreSQL database URL cause a sanitized exit with status 1 **before** database/storage initialization. `PRIVATE_OBJECT_DIR` still configures API uploads and enqueue-time location capture, not worker target resolution.

The current storage adapter uses the repository's existing Replit sidecar credentials. A deployment must actually provide that adapter's identity/sidecar access and least-privilege bucket permissions; generic Google application credentials are not automatically substituted here.

`SIGINT`/`SIGTERM` stop new claims, interrupt the two-second idle wait, drain the current iteration and close the SQL pool. Each iteration has a hard 120-second watchdog, below its five-minute lease; pool shutdown is capped at ten seconds. The entrypoint exits the process on a watchdog failure, because a JavaScript promise timeout alone does **not** cancel an SDK request. `File.delete` does not accept the previously attempted typed `timeout` property; the process deadline is the destructive-operation bound. Configure a supervisor shutdown allowance above 130 seconds, restart/backoff policy and alerting for failed/old pending jobs. Process exit cannot recall a request already accepted by the provider; generation preconditions and idempotent retry remain necessary.

Monitor job state/age and terminal failures on an explicitly approved database. Do not assume a running worker or a successful API deletion response proves that bytes have been removed. For a failed job, verify its captured namespace, generation, provider identity and retention rules before a controlled requeue; never clear the generation to bypass a mismatch. Completed jobs are retained for reconciliation; no outbox-retention/pruning policy was added.

## Executed verification

All SQL execution below used the test-only PGlite adapter, which creates a fresh disposable PostgreSQL-in-WASM engine and applies the exact journaled SQL migrations. Every command used an inert `DATABASE_URL=postgresql://127.0.0.1:1/isolated_no_connection`; the adapter replaces `pg`, so no external PostgreSQL connection is made. No live development database or hosted storage was accessed, and no long-running worker/server was launched.

Commands were executed with `C:/Program Files/nodejs/node.exe` on this Windows host:

```sh
DATABASE_URL=postgresql://127.0.0.1:1/isolated_no_connection \
  node node_modules/vitest/vitest.mjs run \
  tests/community-assets.test.ts tests/community-regression.test.ts \
  tests/asset-cleanup-runtime.test.ts tests/asset-cleanup-worker-import.test.ts \
  tests/asset-cleanup-storage.test.ts tests/asset-cleanup-metadata.test.ts \
  tests/asset-upload-availability.test.ts tests/ci-migrations.test.ts
# 8 files, 47 tests passed

DATABASE_URL=postgresql://127.0.0.1:1/isolated_no_connection RUN_DB_TESTS=1 \
  node node_modules/vitest/vitest.mjs run --config vitest.embedded.config.ts \
  tests/asset-cleanup.integration.test.ts tests/preflight-schema.integration.test.ts \
  tests/community-visibility.integration.test.ts tests/community-feed.integration.test.ts
# 4 files, 19 tests passed (13 cleanup SQL tests, 4 preflight, 2 existing community)

node node_modules/typescript/bin/tsc -p artifacts/api-server/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p tests/tsconfig.json --noEmit
# Both exited 0; scoped ESLint and owned-file Prettier checks also passed.

# From artifacts/api-server:
node build.mjs
# Built index.mjs, intelligence-worker.mjs and asset-cleanup-worker.mjs.
```

Regression coverage includes real SQL audit rollback/no job/no cloud access, delayed pending cleanup, duplicate requests, quota held/released at acknowledgement, retry/backoff, lease expiry/reclaim, stale-token pre-delete fencing, generation mismatch/attempt exhaustion, loss of lease after successful external deletion, failed SQL acknowledgement followed by confirmed absence, account cascades, target traversal constraints and namespace snapshots across post-enqueue configuration rotation. Storage SDK boundaries are fakes; the SQL transactions are not mocks. The obsolete immediate-abandoned-upload-deletion unit test now asserts canonical namespace capture, pending outbox insertion, delayed availability, retained reservation and no cloud access before commit.

The initial partial work failed the upload-configuration regression and API typecheck (`File.delete.timeout`); both were corrected. Standalone import was also red on missing `PORT`, then passed after removing the worker's auth-session transaction dependency. Read-only preflight initially failed only because its expected inventory still said 45; it now expects 46.

Migration `0011_asset_cleanup_outbox.sql` executes successfully, its new-table metadata exactly matches the declared Drizzle schema, and its snapshot adds exactly one table to the unchanged `0010` table metadata. Latest public table inventory is **46**, not 45. No historical `0010` edit or extra migration was needed. Separate child-process smoke checks of the built worker verified five startup guards (default disabled, explicit disabled, missing allowlist, traversal allowlist, missing database): each exited 1 with the same sanitized message and never started the worker.

## Remaining release blockers / non-claims

1. **Native concurrency remains unverified here.** PGlite validates PostgreSQL SQL/constraints/rollback, but this single-connection adapter cannot prove two simultaneous native transactions, wire-protocol behavior, pool failure behavior, TLS or `SKIP LOCKED` scheduling. Run the native fixture suite and a simultaneous-claim race on a dedicated fresh database before release; never use the persistent dev database for this.
2. **Hosted storage acceptance was not performed.** Confirm actual private-bucket IAM/public-access denial, generation preconditions, numeric 404 semantics, object versioning/soft-delete/retention behavior and worker identity permissions on disposable objects in an explicitly approved namespace. An allowlist is application defense, not an IAM policy.
3. **This outbox does not solve upload ingress safety.** A signed PUT still needs enforced byte/content-type limits at the storage ingress, private quarantine, expiration/lifecycle policy and rate/quota abuse controls. Completion currently checks metadata and magic bytes, not a full image decoder/dimension/decompression-bomb policy. These remain release gates, not successful outcomes of these tests.
4. **Promotion/orphan reconciliation is separate.** Upload completion still performs copy/ACL I/O before its SQL/audit commit. A rollback or crash can orphan a promoted object; successful promotion also leaves staging bytes. Account deletion without a previously enqueued asset-delete job is not covered by this outbox. Lifecycle/reconciliation and account-removal cleanup must be independently addressed.
5. **Namespace rotation before enqueue is not solved.** Existing asset rows store relative `/objects/...` paths. The job captures current API configuration at enqueue, not an immutable upload-time bucket/prefix. Do not rotate `PRIVATE_OBJECT_DIR` for existing live assets without verified mapping/backfill; the tested guarantee is stability after a job has captured its target.
6. **Deployment integration is opt-in and operationally incomplete until configured.** The default launcher intentionally does not start this worker. External process supervision, restart policy, per-namespace IAM, backlog/failure alerts, completed-job retention and approval to enable it remain operator responsibilities. Disabled/misconfigured workers safely retain quota rather than silently claiming cleanup succeeded.
