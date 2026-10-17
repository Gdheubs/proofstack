# Interrupted audit: retained checkpoint evidence reconciliation

> Later continuation: [Coverage checkpoint — October 17, 2026 (IST)](production-audit-coverage-resume.md) records fresh unit coverage and added MFA/crypto regressions. The historical evidence and limitations below remain unchanged.

## Result and scope

**Retained evidence reconciled; no fresh application tests, builds, browser sessions, servers, or database operations were run for this report.** The only new execution was local report parsing, safe source hashing, read-only Git pathname enumeration, and document validation. No application files, dependencies, Git history/index, environment files, credentials, raw backups, or external resources were changed. `.env.example` was hashed as a manifest-listed example file; actual `.env` files were excluded from the hashing policy.

At **2026-10-15 21:58:02.524355 UTC** (**October 16 in IST**), all **731 manifest-listed files / 4,010,448 bytes** matched the final clean-build snapshot byte-for-byte. There were **0 changed, 0 missing, and 0 safety-excluded manifest entries**. The observed checkout had one additional safe, Git-enumerated file outside the manifest: `docs/production-audit-static-analysis.md` (pathname only; its contents were not inspected). This new report is also outside that earlier snapshot. These observations are point-in-time, not a lock on the concurrently edited checkout.[1][2]

The final clean-build source matches the checked candidate, but the **recovery/performance application snapshot is stale in six explicitly identified source files**. Saved native/browser/coverage reports contain results and timestamps, **not a source fingerprint tying those executions to the clean manifest**. Do not promote them into fresh execution or a single revision-certified end-to-end run.[2][3][8]

## 1. Source identity and comparison method

The retained final run is **`clean-linux-20261015T153154Z`**, started `2026-10-15T15:31:54.675516+00:00`, completed `2026-10-15T15:34:22.567744+00:00`. Its source snapshot was captured `15:31:54.676387–15:31:55.377187 UTC`. Its recorded Git HEAD is `69f563e8c9b3da4d14ba3684474d4a2af4225bd2`; the per-file manifest, not that commit alone, identifies the dirty candidate.[1]

| Check                                             | Result                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| Parsed manifest entries / unique paths            | 731 / 731                                                          |
| Sum of declared manifest bytes                    | 4,010,448                                                          |
| Current files matching recorded bytes and SHA-256 | 731                                                                |
| Changed / missing / blocked entries               | 0 / 0 / 0                                                          |
| Recomputed manifest fingerprint                   | `443c4094a9a6e4ae0d7aa8c868e5cb220904f9e8cf377f374485329617af1e11` |
| Current fingerprint over those same paths         | `443c4094a9a6e4ae0d7aa8c868e5cb220904f9e8cf377f374485329617af1e11` |
| Agreement with clean-run `source.fingerprint`     | Exact                                                              |
| Current `pnpm-lock.yaml` SHA-256                  | `bccbcaa3aafad360d5dc39df803485bf267053a4d09d948cb50d81281d4cb3a5` |

The table is a newly computed comparison to the retained manifest, not a newly executed build.[1][2]

Method: parse the JSON manifest; reject duplicate paths; reject absolute/traversal/drive-qualified paths, symlinks/junctions, paths escaping the repository, environment files other than `.env.example`, private-key/certificate/keystore/backup extensions, credential filenames, and generated/dependency/evidence directories; read only eligible regular files as bytes; compare both size and SHA-256. Recompute SHA-256 over sorted relative-path records formatted `<file SHA-256><two spaces><relative path><LF>`. Enumerate names using read-only `git ls-files --cached --others --exclude-standard -z`, then safety-filter to identify extra files. No ignored-tree sweep was performed, so this is not a claim about ignored files or live configuration. **No generated-file difference was ignored in the current 731-file comparison.**[1][2]

`docs/production-audit-clean-build.md` describes the **older** `clean-linux-20261015T144843Z` run, with 728 files and fingerprint `468d7a1caedea4ac996b8a3440fa70e2495f931713fb6868e54ef59dd266daa1`. Its timings, archive hashes, and source-drift discussion must not be substituted for the final 15:31 run. Its older archive-verification claim does not independently verify the final run's archives.[11]

## 2. Final clean Linux build: retained results

The final JSON records **24 steps: 23 exit 0 and 1 exit 1**. The nonzero step is specifically the strict post-build source comparison, not an install/compiler/syntax failure. It reports only `artifacts/proofstack/next-env.d.ts` changed inside the container; the generated Next.js declaration is the explicit exception, and the failed strict comparison remains visible. Recorded host snapshot drift at completion is empty.[1]

| Retained gate                       |  Exit | Seconds |
| ----------------------------------- | ----: | ------: |
| Snapshot secret scan                |     0 |   0.680 |
| Verify copied snapshot              |     0 |   3.870 |
| Cold frozen install                 |     0 |  57.849 |
| Library typecheck                   |     0 |   6.269 |
| API and worker build                |     0 |   1.152 |
| Frontend production build           |     0 |  23.789 |
| Strict post-build source comparison | **1** |   5.034 |
| API syntax check                    |     0 |   0.190 |
| Intelligence-worker syntax check    |     0 |   0.152 |
| Asset-cleanup-worker syntax check   |     0 |   0.143 |

These are saved command outcomes in the final clean-run JSON, not command outcomes from this reconciliation.[1]

Recorded environment: Linux amd64, Node `v24.22.0`, npm `11.19.1`, pnpm `11.25.0`; image `sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5`; 2 CPUs, CPU set `0-1`, memory and memory+swap each 4,294,967,296 bytes, PID limit 512. The source mount was read-only, published ports were empty, and no host dependency directory was mounted. The JSON records zero raw/unreviewed source secret findings and removal of the task-owned container.[1]

The saved artifact summary records **837 files / 43,070,776 bytes**, with API, intelligence worker, asset-cleanup worker, and Next build ID all present. Recorded artifact archive: **9,035,082 bytes**, SHA-256 `65aa7eea1a55dbad93a780a2d8a8e83fd34f221f8f8dbbf3c20bd671a98c1a1d`. Recorded source archive SHA-256: `eb573b32a4039708b4966ff8596e53e8d7eb77117f1bb841ca55ac8909d71ddc`. These are **recorded archive claims only**: archives and detailed artifact logs were outside this reconciliation's inspected report allowlist, and their present existence/content was not independently checked. The summary records scratch-directory archive paths.[1]

This supports retained clean installation and compilation of the fingerprinted source, not deployment, live-provider acceptance, runtime worker processing, hosted CI, or bit-for-bit OS-toolchain reproducibility.[1][11]

## 3. Native, browser, and coverage test results

Counts below were recalculated by flattening each `testResults[].assertionResults[]` array; file count is `len(testResults)`. Runner-declared suite totals are retained separately rather than mislabeled as file counts.[3][4][5]

| Retained report under `.local/production-audit/` | UTC start on October 15, 2026 | Last result UTC, rounded to milliseconds | Result files | Declared suites, all passed | Assertion records | Passed | Failed | Skipped |
| ------------------------------------------------ | ----------------------------- | ---------------------------------------- | -----------: | --------------------------: | ----------------: | -----: | -----: | ------: |
| `native-verified.json`                           | 15:28:39.842                  | 15:29:45.745                             |           63 |                         145 |               725 |    723 |      0 |       2 |
| `browser-final.json`                             | 15:37:41.348                  | 15:38:26.107                             |            1 |                           2 |                 2 |      2 |      0 |       0 |
| `coverage-final.json`                            | 15:36:48.995                  | 15:36:58.584                             |           42 |                         104 |               534 |    534 |      0 |       0 |

All three saved reports have `success: true`; their declared test totals agree with the parsed assertion statuses. The native run's two skipped assertions are precisely the browser scenarios in `tests/assessments-browser.integration.test.ts`: completing the skill-check UI and saving profile results for a **published owner** and an **unclaimed owner**. The dedicated browser report records both as passed. This resolves the retained skip distinction; it does not make them freshly executed.[3][4][5]

Do not add these reports into an inflated independent-test total. The browser names overlap the native skips. Coverage is another execution with substantial overlap, not 534 additional independent cases. A raw `(file, fullName)` set comparison finds 12 duplicate identifiers in both native and coverage reports; 520 coverage identifiers overlap native, and two coverage-only strings are timestamp-valued `firebase-provider.test.ts` auth-time cases. Consequently, even naive title-set deduplication is not a reliable semantic test count. Keep the assertion-record counts per run as shown.[3][4][5]

**Provenance limit:** the native run precedes the final clean snapshot; coverage and browser runs follow it. Chronology and today's matching source hashes do not prove the source bytes at those saved test executions. None of these three result JSONs embeds a source manifest/fingerprint. The browser report alone also does not establish live identity-provider configuration, public HTTPS, deployment, or broader browser coverage.[3][4][5]

## 4. Coverage scope and gaps

The coverage directory exists at `.local/production-audit/coverage/` (not repository-root `coverage/`). Its summary contains **82 file entries**, and its raw coverage map is structurally identical to `coverage-final.json`'s embedded `coverageMap`. Re-summing each file's total/covered/skipped counters exactly reproduces the aggregate counters below.[5][6][7]

| Metric     | Covered | Total | Reported percent |
| ---------- | ------: | ----: | ---------------: |
| Lines      |   1,021 | 3,110 |           32.82% |
| Statements |   1,079 | 3,329 |           32.41% |
| Functions  |     253 |   546 |           46.33% |
| Branches   |     787 | 2,783 |           28.27% |

All four metrics report zero skipped counters. The separate `branchesTrue` aggregate has a zero denominator and reports 100%; it must not be presented as branch coverage.[6]

Coverage paths comprise **79 API-server files and 3 frontend-library files** (`artifacts/proofstack/lib/auth-return.ts`, `artifacts/proofstack/lib/navigation.ts`, `artifacts/proofstack/lib/security.ts`). This is a selected coverage surface, not all repository source or all UI components. **14 instrumented files have nonempty line denominators and zero covered lines**, including the asset-cleanup worker entrypoint, managed-auth middleware, auth-account, auth-mfa, careers-actions, community-actions, community-org-actions, community-project-actions, community-query, community-reader, intelligence-worker service, pull-actions, pull-git, and pull-query.[6][7]

A passing 534-assertion coverage execution is therefore not evidence of high coverage, exhaustive failure-path testing, or a coverage threshold gate having passed; no agreed threshold is established by these result files.[5][6]

## 5. Recovery and performance: retained synthetic drill

The backup drill ran `2026-10-15T14:23:48.963Z–14:23:50.455Z`; the final performance drill ran `14:32:22.496Z–14:35:37.532Z`; consolidated verification is timestamped `15:17:25.341Z`. These are local synthetic results, not production SLO/RTO/RPO/PITR or live-provider certification.[8][9][10]

### Backup and restored data

Programmatic comparisons of the retained source/restored arrays confirm **47 tables / 180 total rows**, identical per-table data records, identical catalog schema hashes, sequence states, and migration ledger. There are **12 ledger entries, 61 foreign-key checks (zero recorded orphans), 135 validated constraints, 126 indexes, and 329 columns**. The full-data hash is `4caaa67a864351cda87b500cab594a39ef7cc5e515509484fc5bcdf800963dc4`; catalog schema hash is `60c2d739fc4a8d12228d32634aa7acea555da711838139fdabed7bd80082f795`.[10]

Independent native schema dumps recorded equal SHA-256 `524d1d720bcc237a994f96fd1a7f8c4fc043a17f89f6536ce9d5c73e7415cb8d` after removing only per-invocation random restrict/unrestrict lines. Post-load product comparisons cover **46 non-rate-limit tables / 180 rows**, hash `068c5b219001af045d34ed83d9ef69b76a46dd0fbc4f646aa6a636d709056136`, and match source/restored results. The 47-versus-46 count is a deliberate scope distinction, not a lost table: rate-limit counters were included in full restore verification but excluded from post-load product comparison.[8][10][12]

| Saved measurement                                    | Milliseconds |
| ---------------------------------------------------- | -----------: |
| Backup                                               |      276.064 |
| Restore                                              |      288.587 |
| Restore through full integrity readback              |      440.622 |
| Backup through full integrity readback               |      936.633 |
| Separate restored API startup through correct detail |      564.169 |

These timings exclude infrastructure provisioning, incident detection, operator response, DNS/cutover, and production-scale restoration.[8][10]

All three rejection probes matched expected SQLSTATE: FK `23503`, check `23514`, unique `23505`. The deliberately corrupt restore exited **1**, with **0 public tables** left in the failed target; this is an expected negative test, not a hidden successful restore. The original backup harness failure occurred before dump/restore (`name[]` decoding), and is retained separately. No raw archive or database was opened during reconciliation.[10]

### Load, overload, and actual database pause

Parsing final-run request records gives **218 HTTP attempts**, exactly matching the consolidated phase counts: startup 9, warmup 4, benchmark 64, overload 132, post-overload 2, pre-outage warm 1, database-paused 3, recovery-poll 1, recovered-read 1, restored-api 1. Only **64** belong to the normal benchmark. This does not count retained prior attempts again.[8][9]

| Saved final measurement                     | Result                                              |
| ------------------------------------------- | --------------------------------------------------- |
| Normal benchmark                            | 64/64 HTTP 200; concurrency 4                       |
| Recomputed nearest-rank p50 / p95 / p99     | 31.959 / 48.136 / 88.643 ms                         |
| Recorded sample duration / short-burst rate | 533.432 ms / 119.978 requests per second            |
| Overload, concurrency 12                    | 132 requests: 120 HTTP 200, 12 HTTP 429             |
| Recomputed overload p50 / p95 / p99         | 14.940 / 77.417 / 94.119 ms                         |
| Paused-DB readiness                         | HTTP 503 in 35,015.038 ms                           |
| Paused-DB protected read                    | HTTP 503 in 35,015.617 ms; `RATE_LIMIT_UNAVAILABLE` |
| Paused-DB liveness                          | HTTP 200 in 4.359 ms                                |
| Readiness after unpause                     | 19.785 ms                                           |
| Readiness plus correct read after unpause   | 47.964 ms; same API process, no restart             |

Request status counts and percentiles were recomputed from saved request records and agree with the final summaries. The unchanged default limiter is 120 requests/IP/60 seconds, pool maximum 10. The short burst is not sustained capacity. The roughly 35-second failure response is not fast circuit-breaking.[8][9]

The consolidated summary has **15/15 local gates true**; the performance report has **9/9 true** for its narrower gate set. Prior attempts remain visible: two startup failures, plus a confounded outage attempt with **22,157.352 ms** combined recovery and `recoveryUnder10Seconds: false` after the same IP had exhausted its limiter. The final separate-window drill does not erase that earlier behavior. Selected provider fixtures report **76 discovered, 15 passed, 0 failed, 61 skipped by selection**; they are not cloud-provider outage/login evidence.[8][9][12]

### Why the recovery/performance snapshot is stale

The drill used the immutable **2026-10-15T14:05:19.435Z** application snapshot, Node `v24.18.0`, source hash `da820ab894e6ad2791b632f7d2f754b637c8f8773fc9c897f20f3b0118dde6a8`, bundle hash `fd407e3447be9026eb02bef8384863330aca3f1bf26e92957638e152f5f71133`. Its source inventory covered 107 repository files, not the later whole-tree clean-build manifest.[8][9]

For every listed drift path below, the recovery summary's `currentSha256` equals the final clean manifest hash **and** the newly computed checkout hash; each differs from the recovery `snapshotSha256`. Exact before/after hashes remain in `recovery-summary.json` under `applicationSnapshot.sourceDrift`.[2][8]

1. `lib/db/src/schema/asset-cleanup.ts`
2. `artifacts/api-server/src/services/community-query.ts`
3. `artifacts/api-server/src/services/community-policy.ts`
4. `artifacts/api-server/src/services/community-assets.ts`
5. `artifacts/api-server/src/lib/objectStorage.ts`
6. `artifacts/api-server/src/services/community-actions.ts`

All **12** migration fingerprints in the recovery summary also match the current manifest-listed SQL files under `lib/db/drizzle/`, through `0011_asset_cleanup_outbox.sql`. This preserves the migration-file identity distinction, but it does **not** make the older executable snapshot current or prove the six changed code paths were exercised by the recovery drill.[2][8]

## 6. Unresolved gaps and reporting boundaries

- **Recovery replay against final source is absent.** Existing recovery results must stay labeled as belonging to the older immutable snapshot. A final-source drill requires separately authorized disposable targets; do not rerun setup against the now-populated restore targets.[8][12]
- **Native/browser/coverage source binding is absent.** Their saved assertions passed as reported, but there is no embedded per-run source digest. Matching the build manifest today cannot retroactively supply that chain of custody.[3][4][5]
- **Final archives were not reverified.** Final-run artifact/source hashes are retained JSON fields, not new archive validation. The older build document's archive verification covers a different run.[1][11]
- **Coverage remains limited.** Report the actual 32.82% lines / 28.27% branches and selected 82-file denominator, not an inferred repository-wide or full-integration percentage.[6][7]
- **Listener evidence is internally inconsistent.** `recovery-summary.json.observedRelevantListeners` lists `127.0.0.1:3011` and `127.0.0.1:8089`, while that file's `cleanup.devPorts` prose and the recovery document say no listeners in before/after/final observations. The performance report's own `listenersBefore`/`listenersAfter` arrays are empty. The fields could reflect different observation times, but the listed listener entries lack timestamps sufficient to reconcile them; do not claim dev-port absence/health from this evidence.[8][9][12]
- **No live state claim.** Saved `containerPaused: false`, API-port release, and container-removal fields describe their original observations, not present process/container state. This task intentionally performed no service/DB commands.[1][8]
- **No production acceptance claim.** TLS/public HTTPS, live identity/storage/provider behavior, sustained production load, encrypted/offsite backups, scheduled freshness/RPO, WAL/PITR, object/Git recovery, infrastructure reprovisioning, and production timeout/error budgets remain outside this evidence. The synthetic archive's recorded permissions do not establish encryption or retention controls.[8][12]
- **Documentation naming:** `docs/recovery-performance.md` was not found; the existing relevant report is `docs/production-audit-recovery-performance.md`. The parent-owned `docs/production-audit.md` and fresh checks were not edited or represented as this task's work.

## Sources

Source references below identify local retained reports; they are not web citations. All dates and saved execution results above come from these reports. Fresh comparison claims are explicitly timestamped and described separately.

[1] file:///C:/Users/ithes/proofstack/.local/production-audit/clean-linux-20261015T153154Z.json
[2] file:///C:/Users/ithes/proofstack/.local/production-audit/clean-linux-20261015T153154Z-source-manifest.json
[3] file:///C:/Users/ithes/proofstack/.local/production-audit/native-verified.json
[4] file:///C:/Users/ithes/proofstack/.local/production-audit/browser-final.json
[5] file:///C:/Users/ithes/proofstack/.local/production-audit/coverage-final.json
[6] file:///C:/Users/ithes/proofstack/.local/production-audit/coverage/coverage-summary.json
[7] file:///C:/Users/ithes/proofstack/.local/production-audit/coverage/coverage-final.json
[8] file:///C:/Users/ithes/proofstack/.local/production-audit/recovery-summary.json
[9] file:///C:/Users/ithes/proofstack/.local/production-audit/recovery-performance.json
[10] file:///C:/Users/ithes/proofstack/.local/production-audit/recovery-backup.json
[11] file:///C:/Users/ithes/proofstack/docs/production-audit-clean-build.md
[12] file:///C:/Users/ithes/proofstack/docs/production-audit-recovery-performance.md
