# Production audit: CI/CD and clean verification

> **Parent validation supersedes the initial blockers below:** the vulnerable
> Firestore dependency, native-platform removals and absent coverage provider
> have now been corrected and locally tested. CI-10 was a configuration helper,
> not an undiscovered test. See the final follow-up section for exact scope.
> Hosted Actions/CodeQL/branch-protection and deployment acceptance remain
> unverified; source workflows are not hosted run evidence.

Audit date: October 15, 2026. Scope: `.github/`, new CI scripts, dedicated
`tests/ci-*.test.ts`, and this report. This is a local audit of a concurrently
edited working tree, not certification of a clean commit or a production release.
No `.env` files were read. No commits, pushes, deployments, branch-protection
changes, secret changes, or production database operations were performed.

## Findings and disposition

| ID    | Priority | Status                                    | Evidence / disposition                                                                                                                                                                                                                                                                                                                                                                                |
| ----- | -------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI-01 | P1       | FIXED LOCALLY                             | Existing actions used mutable `@v4` refs. Both workflows now use full commits verified against the official repositories; annotated tags were dereferenced to commits. Checkout credentials are not persisted.                                                                                                                                                                                        |
| CI-02 | P2       | HARDENED                                  | Existing workflow bootstrapped pnpm before the project's Node version. Setup now installs Node 24 first, then pnpm 11.25.0, with the pnpm action's explicit cache and no implicit install. Frozen-lockfile installation remains mandatory.                                                                                                                                                            |
| CI-03 | P2       | FIXED LOCALLY                             | Code generation previously could silently repair stale committed output. `scripts/ci-check-generated.mjs` now rejects tracked, staged, and untracked drift in both generated API trees, without resetting files.                                                                                                                                                                                      |
| CI-04 | P2       | HARDENED; HOSTED RUN BLOCKED              | CI now runs the migration runner twice against its disposable PostgreSQL service. New inventory tests check journal/SQL coverage, uniqueness, safe tags, contiguous indexes, and increasing checkpoints. This does not prove SQL rollback, deployment upgrade safety, or schema equivalence.                                                                                                          |
| CI-05 | P2       | IMPLEMENTED; HOSTED RUN BLOCKED           | Added a separate JavaScript/TypeScript CodeQL workflow. Only its scanner job gets `security-events: write`; ordinary CI stays `contents: read`. Added weekly Dependabot updates for action pins.                                                                                                                                                                                                      |
| CI-06 | P1       | BLOCKED: EXISTING DEPENDENCY FINDING      | Local `pnpm audit --audit-level moderate` exited 1: one high and one low vulnerability. The high finding is `GHSA-m9gg-hp2v-232j`, transitive `@grpc/grpc-js` through frontend Firebase/Firestore, patched in `>=1.13.6`. Root dependency/lockfile edits are outside this task's ownership; the gate remains fail-closed. Re-audit after the owning agent's dependency changes.                       |
| CI-07 | P1       | BLOCKED: CLEAN LINUX INSTALL NOT PROVEN   | `pnpm-workspace.yaml` contains `'-'` overrides removing Linux native packages, including esbuild, Rollup, Tailwind oxide, and lightningcss variants. These are a confirmed portability hazard for Ubuntu CI; existing Windows `node_modules` cannot prove a clean Linux install. Do not infer a successful hosted build from local tests. Workspace/lockfile remediation belongs to the parent owner. |
| CI-08 | P1       | BLOCKED: NO REMOTE                        | `git remote -v` returned no remotes; `gh repo view` returned `no git remotes found`. No hosted runs, required checks, branch protection, environments, approval reviewers, Code Security entitlement, or code-scanning alerts could be inspected.                                                                                                                                                     |
| CI-09 | P2       | BLOCKED: COVERAGE INFRASTRUCTURE          | Root manifests/configs contain no coverage script, provider, reporting configuration, or thresholds; `@vitest/coverage-v8` was not resolvable. Coverage percentage, branch coverage, and regression thresholds were not measured or invented. Adding provider/lockfile/config requires parent ownership.                                                                                              |
| CI-10 | P2       | OPEN: TEST DISCOVERY                      | Current Vitest include patterns are `tests/**/*.test.ts` and `lib/db/tests/**/*.test.ts`. A file named `tests/profile-projects.vitest.ts` is outside those patterns. Its owner's rename/config decision is required before counting it as covered.                                                                                                                                                    |
| CI-11 | P2       | OPEN: ENVIRONMENT PARITY                  | CI uses PostgreSQL 17; `.replit` declares a PostgreSQL 16 module. Actual production major version and upgrade path are not established. Node 24 and PostgreSQL 17 still float within their major versions; this work pins actions and runner OS, not every tool/container digest.                                                                                                                     |
| CI-12 | P1       | SAFE ABSENCE; RELEASE APPROVAL UNVERIFIED | No deployment or publish job was present or added. Neither workflow requests deployment credentials or OIDC. No deployment can occur through these files. A future deployment workflow requires an owner-approved protected environment and independently verified reviewer rules; a manual trigger alone is not approval.                                                                            |

## Read-only inventory

Before editing, the only file under `.github/` was
`.github/workflows/ci.yml`. It already had read-only contents permission, a
15-minute timeout, a disposable `postgres:17` service, frozen installation,
migrations, Orval generation, moderate-level dependency audit, lint, format,
typecheck, DB-inclusive tests, and explicit API/frontend builds. Those gates
were retained, not represented as newly added features.

All tracked workspace `package.json` files were inventoried for names, scripts,
and engines. The repository uses root `packageManager: pnpm@11.25.0` and
`engines.node: >=24 <25`; the lockfile is `pnpm-lock.yaml`, with
`pnpm-workspace.yaml` and `.npmrc` controlling workspace/dependency behavior.

- Root `check`: lint, formatting, typecheck, non-integration tests.
- Root `test:all`: sets `RUN_DB_TESTS=1` and runs Vitest, unlike the unit-only
  `test` script. CI retains `test:all`.
- Root `test:embedded`: separate PGlite integration configuration, serial
  execution. This is not a substitute for the PostgreSQL CI service.
- Root `build`: typecheck plus recursive workspace builds. Existing CI explicitly
  builds the production API and Next frontend; the mockup sandbox is not a
  production artifact gate.
- API: `artifacts/api-server/build.mjs` bundles API and intelligence worker;
  runtime start/preflight/admin/worker scripts are separate operations.
- Frontend: Next build/start and `artifacts/proofstack/next.config.ts`. The CI
  production build now supplies a non-secret loopback `API_INTERNAL_ORIGIN` to
  exercise rewrite configuration. It does not start or health-check a server.
- API generation: `lib/api-spec/orval.config.ts` writes
  `lib/api-client-react/src/generated` and `lib/api-zod/src/generated`.
- Database: `lib/db/scripts/migrate-dev.mjs` applies journaled Drizzle SQL and
  rejects `NODE_ENV=production`. It is used only with the disposable CI URL.
- Release configuration found: `.replit` autoscale/application deployment and
  post-build store pruning, `scripts/post-merge.sh`; no tracked Docker,
  Vercel, Railway, or dedicated release workflow was found. No release command
  was executed.
- Root Vitest uses forked Node workers and `tests/setup.ts`; the embedded config
  supplies its own integration database setup. Coverage instrumentation is not
  configured.

## Action-pin provenance

Each ref was read from its official repository with `gh api`; each selected
commit was also fetched directly using `repos/OWNER/REPO/commits/SHA`.
The `pnpm` and `codeql-action` `v4` refs pointed to annotated tag objects, so their
`git/tags/TAG_SHA` objects were resolved before use. No SHA was guessed.

| Official repository / ref    | Verified commit                            |
| ---------------------------- | ------------------------------------------ |
| `actions/checkout`, `v4`     | `11d5960a326750d5838078e36cf38b85af677262` |
| `actions/setup-node`, `v4`   | `49933ea5288caeca8642d1e84afbd3f7d6820020` |
| `pnpm/action-setup`, `v4`    | `b906affcce14559ad1aafd4ab0e942779e9f58b1` |
| `github/codeql-action`, `v4` | `6f2ac81f5cd81fe351a197ba0b00d91d03cd2aee` |

The exact official `pnpm/action-setup` action metadata was inspected to confirm
`cache` and `run_install` inputs, and CodeQL init metadata to confirm
`languages` and `build-mode` inputs. CodeQL results upload for private
repositories requires the appropriate GitHub Code Security availability;
repository eligibility is unknown without a remote. A scanner execution does
not itself prove that alerts are enforced as merge blockers.

## Actual local verification

| Check                                                                                            | Result                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Targeted Vitest suite                                                                            | PASS: 3 files, 12 tests. Initial pin test failed on `actions/checkout@v4`; initial setup-order/rerun/scanner policies failed before changes. Initial generated-check test failed because the script did not exist. Final targeted suite passed.                           |
| Migration inventory                                                                              | PASS as part of the suite; journal references match SQL files. No database connections made by these tests.                                                                                                                                                               |
| Generated drift checker on actual repository                                                     | PASS: generated API output matched the Git index. Code generation itself was not executed locally because it writes outside this task's owned paths.                                                                                                                      |
| Generated checker negative cases                                                                 | PASS: untracked Zod output, staged output, untracked React output, and non-repository target rejected; unrelated worktree edits accepted. Scratch fixture repos were never committed.                                                                                     |
| Actionlint 1.7.12                                                                                | PASS on both workflow files. Official Windows amd64 release archive checked against the official release checksum: `6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9`. ShellCheck and Pyflakes explicitly disabled locally; their checks are not claimed. |
| Scoped ESLint                                                                                    | PASS on all three dedicated test files.                                                                                                                                                                                                                                   |
| Scoped Prettier                                                                                  | PASS on the workflows, Dependabot config, new script, and dedicated tests.                                                                                                                                                                                                |
| Node syntax check                                                                                | PASS: `node --check scripts/ci-check-generated.mjs`.                                                                                                                                                                                                                      |
| Scoped Git whitespace check                                                                      | PASS: `git diff --check`. New untracked files were also explicitly included in lint/format/test commands.                                                                                                                                                                 |
| Dependency audit                                                                                 | FAIL: 1 high and 1 low, exit 1; see CI-06.                                                                                                                                                                                                                                |
| Clean install, full typecheck, full tests, production builds, actual PostgreSQL migration reruns | NOT RUN by this subtask; parent owns broad verification and live startup. Workflow presence is not execution evidence.                                                                                                                                                    |
| Hosted Actions, CodeQL results, required-check enforcement, environment approval, coverage       | BLOCKED / NOT VERIFIED as described above.                                                                                                                                                                                                                                |

The source-policy tests complement actionlint; they are not a general YAML
parser or proof of arbitrary workflow security. Local Node reported v24.18.0
and pnpm reported 11.25.0. No full-suite count from another agent was reused as
this subtask's verification result.

## Coverage investigation and approval proposal

The parent requested actual measured coverage and a critical-path threshold;
that acceptance criterion remains **blocked**, not passed by the 12 CI tests.
Read-only follow-up found neither `@vitest/coverage-v8` nor
`@vitest/coverage-istanbul` resolvable. The repository's installed `.pnpm`
directories contained only `typedoc-plugin-coverage` among coverage-related
packages, not a runtime instrumenter. The active pnpm store is
`C:/Users/ithes/AppData/Local/pnpm/store/v11`; its read-only SQLite
`package_index` query likewise found only `typedoc-plugin-coverage` among
coverage/Istanbul package names. No usable Vitest coverage provider was found
in that installed/store inventory. Nothing was installed or relinked.

Proposal requiring parent approval/ownership:

1. Add the provider matching the installed runner, currently
   `@vitest/coverage-v8@5.0.3` for Vitest 5.0.3, and update the frozen lockfile.
   Verify that exact package's availability before adding it.
2. Configure explicit coverage includes for critical authentication/session,
   authorization/security, storage access, assessment permissions, and
   migration/preflight validation sources. Include unimported critical files
   so they cannot disappear from the denominator.
3. Produce actual text, JSON-summary, and LCOV reports from unit plus isolated
   database integration tests; do not reuse assertion counts as coverage.
4. Proposed initial critical per-file thresholds: 90% statements, lines, and
   functions, 85% branches, with automatic threshold updates disabled. These
   are a proposed policy, **not measured current values or an approved gate**.
   Record the measured baseline and address missing cases rather than silently
   lowering thresholds or excluding difficult critical paths.
5. Add the approved coverage command to required CI and retain reports with a
   bounded artifact lifetime. No coverage action/dependency/configuration was
   added to shared root files by this subtask.

The parent's `scripts/dev*.mjs`, `tests/dev-runtime.test.ts`, root dev scripts,
API bind configuration, and local persistence setup remain outside ownership
and were not changed here.

## Clean verification procedure for the owner

Use a disposable clone/worktree of the exact candidate commit, not a reset or
clean of this dirty working tree. Do not copy `.env` files or production
credentials. Resolve the native-platform override issue before treating Linux
installation as reproducible.

Run each validator directly and preserve its exit status. Do not use
`--passWithNoTests`, `continue-on-error`, `|| true`, or success-producing output
pipelines to convert a failed gate into a pass.

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-spec run codegen
node scripts/ci-check-generated.mjs
pnpm audit --audit-level moderate
pnpm lint
pnpm format:check
pnpm typecheck
pnpm exec vitest run tests/ci-workflows.test.ts tests/ci-generated.test.ts tests/ci-migrations.test.ts
```

Then use the workflow's disposable PostgreSQL database and explicit test
`DATABASE_URL`/`NODE_ENV=test`/`PORT` for both migration invocations and
`pnpm test:all`. Never run the development migration command against a
production URL. Build the API and frontend with the workflow's production
build settings. On Windows, use the known native Node executable rather than a
wrapper that requires a TTY; set `TEMP`/`TMP` to the agent's dedicated scratch
folder for local fixture tests.

Before approval, obtain an actual hosted run of the exact candidate, inspect
CodeQL results, resolve the dependency advisory, establish database-version
parity, and agree/install coverage instrumentation and thresholds. Verify
required checks and environment reviewer settings read-only with the repository
owner. No deployment should be added or authorized as part of this audit.

## Parent remediation and fresh local follow-up

The initial subtask snapshot above is preserved as historical evidence, not the
current vulnerability verdict.

| Gate                        | Fresh executed result                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency remediation      | Scoped `@firebase/firestore>@grpc/grpc-js` override to **1.13.7**; backend 1.14.6 retained. Fresh `pnpm audit --audit-level moderate --json` exited 0 with **zero advisories at every severity**. This is a registry advisory result, not a security certification.                                                                                                                                                                                                          |
| Native platform portability | Removed the esbuild/Rollup/Tailwind oxide/lightningcss package-removal overrides. Unrelated ngrok policy retained. Source policy tests passed; Windows frozen-lockfile installation passed. Clean Linux artifact verification is tracked independently.                                                                                                                                                                                                                      |
| Coverage                    | Installed exact `@vitest/coverage-v8@5.0.3`; added `vitest.coverage.config.ts` and required `pnpm test:coverage`. A fresh run passed **528 unit tests**, zero failures/pending, with unchanged per-file policy gates of 80% statements/lines/functions and 75% branches on seven named security/authorization boundaries. Those boundaries reached 100% line coverage and at least 98.71% branch coverage.                                                                   |
| Honest coverage denominator | Instrumented API source plus selected frontend security/navigation libraries: **32.71% lines, 32.30% statements, 46.13% functions, 28.03% branches**. Integration/browser paths are separate; this is not whole-product or complete native-auth coverage. Unimported API files remain in the report.                                                                                                                                                                         |
| Discovery correction        | `tests/profile-projects.vitest.ts` exports a Vitest configuration helper; it contains no tests. Inspection does not support the initial CI-10 claim of missing test discovery. No test was silently counted or renamed.                                                                                                                                                                                                                                                      |
| Secret scan                 | Added a separate read-only CI job and checksum-pinned Gitleaks 8.30.1 Linux scanner. Locally, the checksum-verified Windows scanner reviewed both existing commits with zero unreviewed findings after narrowly scoped, tested nonsecret exceptions. Synthetic canaries proved a real-key-shaped value and an RFC vector outside its intended test still trigger detection; a new key in the historical prose file is not suppressed. No broad docs/tests exclusion is used. |
| Push coverage               | Added the actual **master** branch alongside main to both push triggers; source-policy regression failed before the correction and passed after it. No branch was renamed and no remote was created.                                                                                                                                                                                                                                                                         |
| Workflow validation         | Parent reran actionlint 1.7.12 on both final workflow files successfully, with ShellCheck/Pyflakes explicitly disabled as in the initial run. Dedicated workflow/secret-policy regressions passed **7 tests**.                                                                                                                                                                                                                                                               |
| Runtime setup               | Root `dev`/`dev:check` and secret-isolated HTTPS full-stack startup were exercised; real user sign-in was confirmed and aggregate SQL state read back. See `production-audit.md`; this does not certify hosted deployment.                                                                                                                                                                                                                                                   |

CodeQL remains configured but **not executed on a hosted repository**. No Git
remote, required-check enforcement, environment reviewers, protected promotion or
release/deployment credentials were established. The new Linux-only secret-scan
wrapper has a pinned, independently retrieved release checksum and local native
scanner/canary evidence; a hosted execution is still not claimed.
