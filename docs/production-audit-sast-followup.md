# SAST follow-up: targeted crypto verification and non-i18n triage

## Outcome and acceptance boundary

**The fixed AES-GCM finding is absent from a new, executed, offline scan of the current `artifacts/api-server/src/lib/auth-crypto.ts`.** Semgrep 1.181.0 returned **exit 0, zero findings, zero errors, one scanned file**. An isolated positive control restored only the missing decryption option and returned **exit 1 with exactly the original AES-GCM rule**, proving that the rule was active rather than silently excluded.

**The original full scan remains nonzero, not passing:** 611 raw findings across 238 scanned paths, including four partial-parsing warning records; its recorded exit status is 1. This follow-up neither replaces that result nor claims that the current full tree has 610 findings. Only the crypto file and a synthetic control were rescanned. All 48 original non-i18n findings received source-level triage; the remaining 563 are the original localization recommendations, not 563 demonstrated vulnerabilities.

One additional concrete issue remains open: raw repository-page search parameters can overwrite the route-derived `id` prop. An isolated execution of the actual page source reproduced this behavior. No application files were edited, and no authorization bypass or XSS was demonstrated.

## Executed scan and provenance

Primary follow-up execution: **2026-10-15 21:59:29–21:59:41 UTC**. This was a dirty working-tree review, not a claim about a clean Git commit or deployed release.

- Already-installed image: `semgrep/semgrep@sha256:81474464c1f07483ba0682a44787fd93c91397419762a04abe2bafaae396304b`; local image identity was inspected before use. No image/dependency/rule downloads were performed.
- Scanner-reported version: **1.181.0**.
- Retained provenance names `semgrep/semgrep-rules` commit `9bbf021d0acffa3095fcffd17b2bc7787eb4796d`. The local archive contains **205 applicable JavaScript/TypeScript rule files**, merged into **214 rules**. Rebuilding the bundle in memory using the retained ID-prefixing procedure reproduced its bytes exactly. The original bundle and provenance were not rewritten.
- Rule payload SHA-256: `3c0459de2a0b9f9e73e5bb3463df69b2c77d69538c2dd6e905abce2079a3e6f4`.
- Current crypto source SHA-256: `f37193e17313efa96f02fd8b15e4c98fc292dc24097ccb66150f87b7d4265f8a`.
- Original raw scan SHA-256: `9cbf7580f3a08d109b0d2ad778da0dc95c700b0c3b9662550166d38e0b56a02a`.
- The supplied bundle has 214 rules; the scanner console reports **203 applicable rules actually run** on each TypeScript target: 202 TypeScript rules and one multilang rule. These are not 214 security-only rules.

Local bundle/archive consistency is verified. Remote commit authenticity and release signatures were **not independently re-fetched or verified** in this offline follow-up.

### Isolation and exact command

A new task-owned container was created with `--pull=never --network=none --cpus=1 --memory=1g --pids-limit=128 --cap-drop=ALL --security-opt=no-new-privileges`. It had no bind mounts. Inspection confirmed the network/resource settings. Only a narrow source/rule snapshot was copied into `/snapshot` on the container's native filesystem; neither the repository root nor environment files were mounted. Metrics and version checks were disabled explicitly.

Inside `/snapshot`, the current-source command was:

```sh
semgrep scan --config /snapshot/rules.json \
  --metrics=off --disable-version-check --no-rewrite-rule-ids \
  --no-git-ignore --jobs=1 --timeout=15 --max-memory=512 \
  --error --strict --json artifacts/api-server/src/lib/auth-crypto.ts
```

The second command was identical except the explicit target was `positive-control.ts`. Full Docker argument arrays and exit codes are retained in the manifest. The task-owned container was removed afterward, and a separate container listing confirmed its absence. No shared container was paused or stopped.

| Explicit target                                       | Exit | Findings | Errors/warnings in JSON | Scanned paths | Skipped rules |
| ----------------------------------------------------- | ---: | -------: | ----------------------: | ------------: | ------------: |
| Current `artifacts/api-server/src/lib/auth-crypto.ts` |    0 |        0 |                       0 |             1 |             0 |
| Synthetic `positive-control.ts`                       |    1 |        1 |                       0 |             1 |             0 |

The control is a copy of the current file with only `createDecipheriv`'s `{ authTagLength: 16 }` argument removed. It is **not** a historical checkout and was **not** executed as crypto/application code. Its sole finding is `javascript.node-crypto.security.gcm-no-tag-length.gcm-no-tag-length`. The canonical-envelope checks remain in that control, so the result validates scanner sensitivity to the call pattern, not exploitability of the control.

Current source at lines 43–67 requires three canonical nonempty base64url parts, a 12-byte IV and a 16-byte tag, and supplies `authTagLength: 16` to decryption at lines 60–62. Encryption also supplies that option at lines 31–33. This scan establishes removal of the reported pattern, not correctness of every possible cryptographic property. Existing dynamic-test results are documented in `production-audit-static-analysis.md`; those tests were not rerun here.

## Triage of all 48 original non-i18n findings

Counts below are **original raw result counts**, not newly scanned counts or confirmed vulnerability totals. Manual dispositions do not suppress or delete scanner results. The machine-readable triage ledger retains all 48 entries, original result indices, full rule IDs, original line/column locations, current review lines, source hashes and individual rationales. It deliberately preserves multiple findings on the same line.

Paths below are relative to `artifacts/api-server/src/` for backend files and `artifacts/proofstack/` for frontend files.

| Rule suffix                         | Raw count | Current-code disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | --------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gcm-no-tag-length`                 |         1 | **Fixed; targeted scanner verification passed**, with a detecting positive control. Original location `lib/auth-crypto.ts:46`; current option at `:60–62`.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `no-stringify-keys`                 |        14 | **False positives for this rule's claimed key-order problem.** The reported sinks are constant numeric `rows[0]` or `choices[0]` accesses after SQL/AI calls, not object keys built from serialized JSON. JSON strings are payloads/JSONB parameters. See complete location list below.                                                                                                                                                                                                                                                                                                                     |
| `missing-template-string-indicator` |        18 | **False positives for missing interpolation.** Four matches are SQL regex quantifier braces in `services/community-policy.ts:171–202`; five are nested object-literal braces in `components/community/search-view.tsx:53`, two in `components/intelligence/results.tsx:93`, and seven in `components/repositories/repository-view.tsx:17`. The latter expressions already use `${new URLSearchParams(...)}`.                                                                                                                                                                                                |
| `no-replaceall`                     |         6 | **Four server portability hits reviewed against the declared Node 24 runtime; two browser compatibility gaps remain.** Server locations: `services/auth-account.ts:305`, `services/auth-mfa.ts:222,248`, `services/repositories.ts:45`. Client locations: `components/site-header.tsx:171,184`. Node support does not establish browser support.                                                                                                                                                                                                                                                            |
| `detect-redos`                      |         3 | **Context reviewed; capacity/length acceptance remains open.** Locations: `lib/objectStorage.ts:76–78`, `services/asset-cleanup-runtime.ts:24–26`, `services/asset-cleanup-storage.ts:7`. Slash delimiters are excluded from the repeated segment character classes; inspection did not identify ambiguous repeated partitioning. Inputs are namespace configuration or a captured cleanup target, not an established arbitrary public request field. No explicit length cap exists at these checks, and no adversarial timing/load test was performed. Not labeled proven exploitable or universally safe. |
| `react-insecure-request`            |         1 | **Deployment-boundary review required.** `lib/objectStorage.ts:266–276` signs via the fixed `http://127.0.0.1:1106` sidecar (`:13`), with a 30-second timeout; it is not a request-selected external URL. Plain HTTP is real. Sidecar identity, loopback isolation and privileged-process trust cannot be accepted from this source review alone.                                                                                                                                                                                                                                                           |
| `direct-response-write`             |         1 | **Not an HTML-rendering sink in this flow.** `routes/repositories.ts:99` sends a Buffer with an explicit Git upload-pack MIME type (`:89–93`). The route bounds incoming data to 1 MB and passes a 64 MiB output cap; `services/repository-git.ts:122–133` enforces a 15-second deadline/output limit. Global Helmet is registered before routes in `app.ts:50`. No live browser/proxy/header verification was performed. Converting this binary response to HTML rendering is not a suitable remediation.                                                                                                  |
| `react-href-var`                    |         2 | **Conditional on the existing server policy.** `components/community/notifications-view.tsx:69,83` renders `n.href` from the notification API. `services/community-query.ts:178–185` applies `notificationReadWhere()`, whose canonical local destination/title allowlist and resource-access checks are at `services/community-policy.ts:161–204`. The component has no independent URL validator. Keep that policy on every producer/read path; this is not approval of arbitrary future href values.                                                                                                     |
| `react-props-spreading`             |         2 | **One open query-prop override; one authored component wrapper.** `app/(community)/repositories/[id]/page.tsx:11` spreads runtime query properties after `id`; see reproduction below. `components/auth/shared.tsx:93–105` intentionally forwards remaining input props after removing `label`/`hint`; inspected auth callers supply authored props, not a request-object spread. The aliased Input implementation is `src/components/ui/input.tsx`, which forwards props to the native input. This wrapper is not a universal sanitizer.                                                                   |

### Complete `no-stringify-keys` locations

All are backend `services/` paths. The retained taint rule declares every `JSON.stringify(...)` a source and any `$OBJECT[...]` access a sink; the reviewed hits do not use serialized JSON as the index.

- `assessments.ts:55`: first returned attempt row after a parameterized snapshot JSONB insert.
- `audit.ts:65`: first returned audit ID after a parameterized metadata JSONB insert.
- `careers-actions.ts:76–81,93–98`: first returned job/application ID; skills/project IDs are JSONB values.
- `community-ai.ts:51` and `intelligence-provider.ts:30`: first AI response choice after a JSON request payload, not a key-order-based lookup.
- `community-assets.ts:128,244,251`: first SQL result/existence checks; serialized arrays are JSONB containment parameters.
- `community-project-actions.ts:75,288`: first returned project/entry ID; JSON payloads are bound values.
- `community-social-actions.ts:123,204`: first returned post/comment ID; tags/mentions are bound JSONB values.
- `intelligence-jobs.ts:215–226`: first returned job row after inserting a JSONB input value.

This disposition concerns the reported rule only; it is not a blanket SQL, AI-output or authorization audit. In particular, `services/repositories.ts:45` is deliberate internal placeholder replacement: its inspected caller in `services/pull-policy.ts:37` supplies the fixed SQL expression `latest.reviewer_id`, not request text.

### Open finding: repository query parameters overwrite route props

Current page source ends with:

```tsx
const { id } = await params;
const q = await searchParams;
return <RepositoryView key={id + JSON.stringify(q)} id={id} {...q} />;
```

The TypeScript declaration for `searchParams` is not runtime key filtering. A query object containing `id` wins because its spread follows `id={id}`.

An isolated probe used installed TypeScript and the real React JSX runtime under **Node v24.18.0** to transpile and invoke the actual page source. Only the child `RepositoryView` import was stubbed; no Next server or browser was started. Observations:

- Route ID `11111111-1111-4111-8111-111111111111` plus ordinary `{ branch: "main" }` produced that route ID in the child props.
- The same route ID plus query `{ id: "22222222-2222-4222-8222-222222222222", branch: "main" }` produced the query ID in the child props.
- Probe source hash matched the reviewed page source hash.

**Disposition: open correctness/input-boundary hardening issue, not a demonstrated authorization bypass.** `RepositoryView` destructures `id`, `branch`, `path`, `revision` and sends them to the repository query; it does not spread this object onto a DOM element. The backend repository lookup still includes `projectReadWhere()` with bound user/repository parameters (`services/repositories.ts:66–68`). Do not dismiss the original spread warning as purely cosmetic, but do not call this XSS or cross-tenant access without a demonstrated path.

Recommended follow-up, not implemented here: select/validate only supported query fields, pass the route-derived `id` explicitly without a later unrestricted spread, and add route/query collision plus repeated-query-value coverage. HTTP/browser behavior remains unverified by this isolated probe.

## Remaining limitations and acceptance work

1. **No new broad scan.** The original four warning records still limit coverage in `components/careers/workspace.tsx`, `components/community/profile-view.tsx`, `components/repositories/clone-panel.tsx`, and `components/site-header.tsx`. The careers warning record contains two spans. Zero errors on the crypto target does not resolve those parse spans.
2. **No full-tree gate clearance.** All 611 original results remain retained. Of 48 non-i18n entries, the ledger records one targeted-verified fix, 32 rule-specific false positives, four server-runtime-compatible uses, and 11 contextual/open items split by the dispositions above. Review is not rule suppression or a passing full Semgrep run.
3. **Browser support gap:** the two client-side `replaceAll` calls build mobile-navigation IDs from static labels. Their security significance is not demonstrated, but the minimum supported browser/polyfill policy was not exercised. A server Node 24 claim is insufficient.
4. **External controls remain unverified:** sidecar/process isolation, actual deployed headers, upload ingress/decoder safety, storage lifecycle, live provider behavior and hosted security tooling are outside this follow-up. No credentials, `.env` files or provider endpoints were read/contacted.
5. **Static scope and local provenance only:** the scan used the retained OSS rules, not a new registry ruleset, supply-chain audit, secret scan, DAST run or penetration-test certification. Existing auth/notification test claims were not re-executed here; shared tests/builds were intentionally left alone.
6. **Snapshot-bound results:** the manifest hashes all 25 files containing non-i18n findings. They were unchanged during the scan, as were the original raw result and rule payload. Later edits require renewed review. The positive control tests rule matching, not end-to-end crypto security.

## Retained evidence and reproduction

All evidence filenames below are under `.local/production-audit/`:

- Original, unchanged: `semgrep-container-final.json`, `semgrep-container-console.txt`, `semgrep-rule-provenance.json`, `semgrep-official-rules.json`.
- Primary scan evidence prefix: **`sast-followup-20261015T215929Z`**.
  - `-manifest.json`: exact commands, image identity, isolation inspection, source hashes, exit codes and cleanup verification.
  - `-current.json`, `-current.stderr.txt`: current-target raw JSON and scanner console.
  - `-positive-control.json`, `-positive-control.stderr.txt`: detecting control raw JSON and console.
  - `-provenance-check.json`: exact local-archive-to-bundle reproduction result.
  - `-triage.json`: all 48 findings, original indices/locations and per-hit dispositions.
  - `-props-probe.json`, `-props-probe.stderr.txt`: actual isolated page-source execution result.
- `sast-followup-runner.py`: narrow offline scan harness, with assertions on target paths, counts, exits and unchanged inputs. It creates its snapshot under the explicit Hermes scratch directory and removes only its own new container.
- `sast-followup-triage.py`: local provenance verification, per-result ledger generation and isolated page-prop probe. Its evidence prefix intentionally identifies this checkpoint.

An earlier execution with prefix `sast-followup-20261015T215826Z` produced the same scan counts. The host's `TMPDIR` unexpectedly resolved to the system temporary directory; that task-created snapshot was moved into Hermes scratch, and the harness was corrected to use the explicit Hermes scratch path before the primary repeat above. The earlier manifest preserves its original execution-time path; the primary manifest points to the retained corrected location. No application source was changed to obtain either result.

Only this follow-up document and isolated local evidence/scripts were created for this task; the previous audit document, original results, application files and dependency configuration were preserved.
