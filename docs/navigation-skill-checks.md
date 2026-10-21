# Grouped navigation and platform skill checks

## Navigation ownership

There is one shared navigation model in `artifacts/proofstack/lib/navigation.ts`.
Desktop dropdown menus and the mobile expandable menu both use it. The old
horizontal community-wide link bar is removed.

| Main section     | Tools                                                                          |
| ---------------- | ------------------------------------------------------------------------------ |
| Overview         | Product overview                                                               |
| Community        | Projects, repositories, organizations, search, writing assist                  |
| Talent           | Talent directory, skill checks, my profile                                     |
| Career workspace | Career preferences, applications and hiring inbox, opportunities, intelligence |
| Build log        | Latest updates, bookmarks, notifications                                       |

Account/security and sign-in remain separate header utilities. Repository,
project, application and post detail routes highlight their owning section.
Existing public URLs are preserved. `/career/applications` is the dedicated
applications/inbox destination.

## Skill-check behavior

Open **Talent → Skill checks** (`/assessments`). The initial platform-curated
library contains JavaScript foundations and web accessibility. Each has a bank
of 24 four-option questions across six topics, and each attempt draws eight.
The duration is an estimate, not an enforced timer.

- Every attempt gets a new question set built from the account's history: each
  topic appears once, the two remaining questions go to the topics missed most
  in the last three attempts, unseen questions are preferred, and the previous
  attempt's questions are not repeated. Answer options are shuffled and get new
  random ids each attempt, so answer positions and ids cannot be memorized.
- After completing a check, the same check can be retaken after 24 hours. An
  open attempt can always be resumed.
- Results show the score per topic and up to two topics to practice next, and
  profiles show how many attempts the latest score took.
- Signed-in accounts start or resume their own open attempt.
- Questions are shown one at a time with previous/next controls and progress.
- All answers must be valid before submission; the server independently enforces
  completeness and grades against the attempt's stored question-bank snapshot.
- Clients cannot supply scores or remarks. Answer keys are never returned.
- A completed attempt cannot be regraded. The UI reads the exact attempt back
  before showing success; reloading a completed attempt shows the saved result.
- Unsubmitted answer selections are tab-local and reset on reload. The attempt
  itself is persisted. This limitation is stated next to the questions.
- Profiles show the latest completed result per assessment, including score,
  correct answer count, completion date and a talent-oriented foundation remark.
  Incomplete retries do not replace previous completed results.
- Public results follow existing profile publication and active-user rules.
  Owners can read their own results through the `me` alias. Attempt details and
  answers remain private.

Remarks distinguish strong foundations (80% or more), developing foundations
(60% or more), and foundations needing practice (below 60%). These are explicitly
self-directed knowledge checks, **not proctored identity checks, professional
seniority ratings, or verified employment**. Practical challenges, a platform
admin question editor and proctoring are not implemented here. The rotating
question sets, retake cooldown and visible attempt count limit score gaming but
do not stop someone from looking answers up during an attempt.

## Database and API

Tracked migration: `lib/db/drizzle/0010_skill_checks.sql`, with Drizzle schema,
snapshot and journal entry. It adds assessment attempts, saved question versions,
completion consistency constraints, an owner foreign key with deletion cascade,
and a unique open attempt per owner/assessment.

The migration must be included in the target database's approved migration
rollout before enabling the feature. No hosted schema/data changes were made.
Do not use the development migration command on a production target.

Endpoints:

- `GET /api/assessments`: catalog without questions or answer keys.
- `POST /api/assessments/start`: `{ assessmentId }`.
- `GET /api/assessments/attempts/:id`: private attempt.
- `POST /api/assessments/attempts/:id/submit`: `{ answers: { questionId: optionId } }`.
- `GET /api/assessments/results?handle=...`: published profile or authenticated `me`.

Mutations use the existing account, CSRF, origin and rate-limit protections.

## Reproducing checks

Normal repository scripts are preferred when its configured package manager and
native dependencies are available. Equivalent directly invoked feature checks:

```bash
node node_modules/vitest/vitest.mjs run tests/navigation.test.ts tests/assessment-ui.test.ts tests/assessments-api.test.ts
RUN_DB_TESTS=1 node node_modules/vitest/vitest.mjs run --config vitest.embedded.config.ts tests/assessments.integration.test.ts
```

The embedded configuration executes tracked migration SQL in disposable
PostgreSQL/WASM. It does not verify native PostgreSQL concurrency, wire protocol,
production grants/RLS, real identity-provider login or deployed TLS.

### Real browser flow

Requires Python Playwright/Chromium and a Next development server at
`https://127.0.0.1:3100`, rewriting `/api` to `http://127.0.0.1:3101`. Use Next's
`--experimental-https` with a disposable self-signed local certificate; do not
change production HTTPS/CSRF requirements or install an OS trust certificate.
The test browser alone accepts that local certificate.

From `artifacts/proofstack`, start the test-only Next server:

```bash
API_INTERNAL_ORIGIN=http://127.0.0.1:3101 node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3100 --experimental-https --experimental-https-key /absolute/path/to/test-key.pem --experimental-https-cert /absolute/path/to/test-cert.pem
```

Then, from the repository root:

```bash
RUN_DB_TESTS=1 RUN_BROWSER_TESTS=1 node node_modules/vitest/vitest.mjs run --config vitest.embedded.config.ts tests/assessments-browser.integration.test.ts
```

This opt-in harness starts the real API on loopback with disposable database
fixtures, substitutes only the external identity/provider-settings boundary,
and exercises production routes, CSRF, scoring, persistence and profile queries.
It checks every submenu destination, six responsive widths, question review,
completion/reload, and actual profile rendering; the stored SQL result is compared
with the browser's read-back. Screenshots and `report.json` are written to
`TEMP/proofstack-browser-checks`. The API and fixtures are cleaned up after the run.

## Workspace-wide validation boundaries

The subsequent complete menu/authentication/storage audit fixed the missing
Firebase configuration/session routing and identity types, removed the remaining
embedded applications inbox and duplicate account organization editor, and added
safe skill-check sign-in returns. Workspace-wide lint, formatting, type checking,
unit/database tests and both application builds were exercised. See
[menu-auth-storage-audit.md](menu-auth-storage-audit.md) for exact evidence and
remaining live-provider/storage release blockers. Local green checks are not a
production-readiness claim.
