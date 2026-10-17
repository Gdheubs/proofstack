# Synthetic recovery and performance audit

**Executed October 15, 2026 (UTC). Consolidated readback began at 14:37:51Z; the latest verification timestamp is in the JSON.** All final local drill gates passed. Evidence is synthetic, local, and snapshot-specific; it is not a production SLO, capacity certification, PITR, or live-provider claim.

## Scope and isolation

- Used the existing container `proofstack-production-audit-postgres`, label `proofstack.audit=synthetic-only`, published only at `127.0.0.1:55440`. Discovery confirmed its existing database names: `audit_source`, empty `audit_restore`, and empty `audit_failed_restore`. No database was dropped or setup rerun.
- Ran only task-owned API processes on `127.0.0.1:8098`; `3099` was an origin configuration, not a frontend server. Did not change application/root configuration or contact/stop dev ports `3011`/`8089`, the build database, or user data. Those two dev ports had no listeners in before/after/final observations; this audit does **not** claim their health.
- API child environment was allowlisted, with no inherited provider credentials. A test-only preload rejected outbound TCP except the synthetic database. Both successful API processes reported zero denied connection attempts. No identity emulator/mock identity service was attached to a user UI; no cloud identity, SMS, payment, AI, object-storage, or Git-object requests were exercised.
- Final cleanup: audit API stopped, port `8098` released, container resumed and retained for the parent audit; PostgreSQL activity readback showed no remaining audit API clients.

## Backup, restore, and integrity

Native PostgreSQL **17.11** tools, not an in-memory database, produced a custom-format dump and restored it transactionally into the previously empty disposable target.

| Measurement / verification                                                 | Result                                                                                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Backup wall time, including Docker command overhead                        | 276.064 ms                                                                                                               |
| Restore wall time, including Docker command overhead                       | 288.587 ms                                                                                                               |
| Restore through full integrity readback                                    | 440.622 ms                                                                                                               |
| Backup through full integrity readback                                     | 936.633 ms                                                                                                               |
| Restored API startup through correct project detail, separately measured   | 564.169 ms                                                                                                               |
| Base tables / rows, including migration ledger and seeded role definitions | 47 / 180                                                                                                                 |
| Migration ledger                                                           | 12 entries, identical after restore, through `0011_asset_cleanup_outbox`                                                 |
| Foreign-key orphan checks                                                  | 61 checked; zero orphans                                                                                                 |
| Constraints                                                                | 135 validated; FK/check/unique violations rejected with SQLSTATE `23503`/`23514`/`23505`, each rolled back               |
| Integrity                                                                  | Every table's count and row-content SHA-256, catalog schema hash, sequence state, and ledger matched                     |
| Independent native schema-only dump comparison                             | Equal, including owners/ACLs/policies/functions/triggers; only randomized `\\restrict` / `\\unrestrict` lines normalized |
| Corrupt archive drill                                                      | 64-byte truncated archive rejected, `pg_restore` exit 1; failed target retained zero public tables                       |

Archive: **127,423 bytes**, file mode `600`, containing directory mode `700`, SHA-256 `4f78836883301e42717c62cb6e193026108c60ada8d2bf3b05c106897ec9f4b5`. It remains inside the isolated container at `/audit-backups/recovery-synthetic.dump`; no real-user backup was created. Synthetic archive is not encrypted; these permissions are not a production encryption/retention/offsite-restore policy.

Final native schema SHA-256: `524d1d720bcc237a994f96fd1a7f8c4fc043a17f89f6536ce9d5c73e7415cb8d`. After API/outage exercises, all **46 non-rate-limit tables / 180 rows** still matched both the original product fingerprint and the restored target. Rate-limit counters were deliberately excluded only from this post-load comparison; they were included in the initial full restore verification.

These are measured local recovery-stage bounds on already provisioned infrastructure, **not an uninterrupted production RTO**. Infrastructure provisioning, incident detection, operator response, DNS/cutover, offsite durability, scheduled backup freshness/RPO, WAL/PITR, large datasets, and object/Git storage recovery were not tested.

## Bounded API load and overload

Fixture: 8 fake users, 28 projects (24 public / 4 private), contributors, milestones, repository metadata/branches; no images or Git objects. Anonymous responses were checked for correct synthetic identifiers, populated data, visibility, and pagination—not just HTTP success.

Default protection remained **120 requests/IP per 60 seconds**, pool maximum 10. Four warmups were followed by **64 measured requests at concurrency 4** in a fresh fixed window; database counter readback confirmed exactly 64 hits. A separate fresh window tested bounded limiter overload at concurrency 12.

| Read endpoint                                          | Samples |           p50 |           p95 |           p99 |
| ------------------------------------------------------ | ------: | ------------: | ------------: | ------------: |
| `/api/community?view=projects`                         |      16 |     22.788 ms |     47.144 ms |     47.144 ms |
| `/api/community?view=search&q=Synthetic&type=all`      |      16 |     34.505 ms |     67.156 ms |     67.156 ms |
| `/api/community?view=project&handle=audit-project-1`   |      16 |     20.865 ms |     53.825 ms |     53.825 ms |
| `/api/community?view=profile&handle=audit-developer-1` |      16 |     38.347 ms |     88.643 ms |     88.643 ms |
| **Combined**                                           |  **64** | **31.959 ms** | **48.136 ms** | **88.643 ms** |

- All 64 measured reads returned correct HTTP 200 responses; zero benchmark errors. Total sample duration 533.432 ms, **119.978 requests/second during that short burst**. This cannot be sustained from one IP at the unchanged 120/minute limit and is not a production capacity estimate. Percentiles use nearest-rank; small endpoint samples make p95/p99 equal their maximum.
- Overload: **132 `/api/assessments` requests**, exactly **120 HTTP 200 + 12 HTTP 429**, in 313.080 ms. Rejections had `RATE_LIMITED`, remaining `0`, and `Retry-After: 59`. Health and readiness remained HTTP 200. This tests application rate-limit behavior, not CPU/memory exhaustion or distributed attack resistance.
- The final run recorded **218 HTTP attempts** across startup polling, warmups, benchmark, overload, failure/recovery, and restored-API probes; only 64 comprise the normal-latency benchmark.

## Actual database outage and recovery

After a separate fresh rate-limit window and successful pre-outage read, PostgreSQL activity was checked: only this isolated API/controller used the target. The real container was paused, verified paused, and unpaused in `finally`.

| Probe                  | During pause                                                                                  | After unpause                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `/api/healthz`         | HTTP 200 in 4.359 ms                                                                          | Process stayed alive                                                          |
| `/api/readyz`          | HTTP 503 / `database: unavailable` in 35,015.038 ms                                           | Ready after 19.785 ms                                                         |
| Protected project list | HTTP 503 / `RATE_LIMIT_UNAVAILABLE` in 35,015.617 ms; generic error, no SQL/stack/credentials | Correct HTTP 200 response; both readiness and read completed within 47.964 ms |

Pause/drill wall duration was 35,317.715 ms. The **same API PID recovered without restart**. Approximately 35-second failure responses are consistent with the configured database query timeout, not fast circuit-breaking; deployments with shorter proxy deadlines need a separately agreed timeout/error budget.

An earlier completed attempt intentionally overloaded the same IP immediately before pausing PostgreSQL: readiness recovered in 17.221 ms, but a protected read waited **22,157.352 ms** for the exhausted rate-limit window. This failed the proposed 10-second combined gate for a confounded reason. That attempt is retained in `recovery-performance.json` / `recovery-summary.json`; the final independent-window drill above isolates DB recovery rather than hiding the rate-limit effect.

Proposed **local** gates were declared before measurement: read p95 <250 ms, p99 <500 ms, no normal-read errors; paused-DB errors <40 s; recovery <10 s; restore plus integrity verification <5 s. All final gates passed. Production SLOs still require workload, dataset, infrastructure, and dependency budgets agreed by the owner.

## Provider boundary evidence and source qualification

- Targeted existing Firebase boundary-fixture tests: **15 passed, 0 failed, 61 skipped by selection** (76 discovered). Fourteen SDK error mappings exercise verification/user/session boundaries; one verifies the safe adapter. This is unit-fixture evidence, **not an actual cloud-provider outage**, login, or delivery test.
- Benchmarked immutable API snapshot: **2026-10-15T14:05:19.435Z**, Node **v24.18.0**, bundle SHA-256 `fd407e3447be9026eb02bef8384863330aca3f1bf26e92957638e152f5f71133`; verified unchanged before/after. All 12 migration-file fingerprints still matched at final readback. This harness applied no migrations to any database.
- Six of 107 repository source files embedded in that snapshot changed concurrently: `lib/db/src/schema/asset-cleanup.ts`; API `services/community-query.ts`, `services/community-policy.ts`, `services/community-assets.ts`, `lib/objectStorage.ts`, and `services/community-actions.ts`. Exact before/current hashes are in `recovery-summary.json`. Results therefore certify the recorded snapshot only; rerun against the final merged snapshot before treating them as current-code evidence. Public HTTPS/TLS/browser gates belong to the parent audit and are not claimed here.

## Reproduction, artifacts, and harness issues

From the repository root, exact successful entry commands were:

```bash
"C:/Program Files/nodejs/node.exe" .local/production-audit/recovery-backup.mjs
"C:/Program Files/nodejs/node.exe" .local/production-audit/recovery-performance.mjs
"C:/Program Files/nodejs/node.exe" .local/production-audit/recovery-provider-fixtures.mjs
"C:/Program Files/nodejs/node.exe" .local/production-audit/recovery-verify.mjs
```

**Do not blindly rerun backup setup:** the backup harness refuses nonempty restore targets. Preserve completed evidence and prepare separately authorized, new disposable targets for another restore; never drop/reuse user databases. Performance replays wait for independent default rate-limit windows and touch only the synthetic database.

- Consolidated sanitized measurements: `.local/production-audit/recovery-summary.json`.
- Full command timings, table digests, constraints, ledger, corrupt-restore output: `recovery-backup.json`.
- Per-attempt HTTP status/latency/selected safe headers, prior failures, PID/cleanup/default-budget verification: `recovery-performance.json`.
- Selected unit-test command/result and assertions: `recovery-provider-fixtures.json` and `.raw.json`.
- Reusable scoped harnesses: `recovery-backup.mjs`, `recovery-performance.mjs`, `recovery-provider-fixtures.mjs`, `recovery-verify.mjs`, and `recovery-network-guard.mjs`; local process logs are `recovery-api-audit_source.log` / `recovery-api-audit_restore.log`.
- Original backup helper exited 1 before any dump/restore: catalog `name[]` columns were not decoded as JS arrays. The scoped replacement explicitly casts attribute names to `text` and completed real verification.
- Two API startup attempts exited before readiness because the relocated bundle could not resolve external `@google-cloud/storage`. `NODE_PATH` and a test-only `node_modules` junction were insufficient for ESM. The preload resolves only those SDK imports through the actual API package while preserving bundle bytes; it also blocks non-fixture outbound TCP. A failed `cmd mklink` attempt returned `Invalid switch - "Users"`; Node's junction API created the isolated link instead. No application dependencies/configuration were rewritten.
