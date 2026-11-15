# ProofStack Skill Check platform: final specification

Date: 2026-11-15. Status: specification only. Nothing in the repository was changed apart from adding this file. No migration was run and nothing was deployed.

**Basis.** Three designs were judged. Two of three judges chose design A (integrity-first), so this specification is built on A. It takes the authoring experience, the build-plan mechanics and the cookie credential from design B, and sealed keys, per-attempt snapshots, tenant scoping and upload tickets from design C. Every "mustFix" and every flaw the judges recorded against A is resolved here; section 14.5 maps each one to the rule that fixes it.

**Section order.** The sixteen sections are the same as in the three designs. The build plan is placed last (section 16) and the owner decisions before it (section 15), because parallel builders read the build plan as the final word.

**Checked in code for this document (read-only).**

| Fact                                                                                                                                                                                      | Where                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Readiness compares only tables exported from `@workspace/db/schema`; a second barrel is invisible to it                                                                                   | `artifacts/api-server/src/services/health.ts` lines 6-13                                                                                    |
| drizzle-kit has one schema path today                                                                                                                                                     | `lib/db/drizzle.config.ts`                                                                                                                  |
| `DIRECT_PATHS` has exactly three entries                                                                                                                                                  | `artifacts/api-server/src/lib/client-ip.ts` lines 34-38                                                                                     |
| The global limiter runs before `cookieParser` and body parsing, and already reads the session cookie from the raw header by regex                                                         | `app.ts` lines 114 and 131; `middlewares/rate-limit.ts` lines 14-24                                                                         |
| `readSession` locks the session row and calls the identity provider on every request; `privileged` is a platform role or an owner/admin membership                                        | `services/auth-sessions.ts` lines 452-539                                                                                                   |
| `requireCsrf` checks origin and a signed nonce only; it does not bind to a session                                                                                                        | `services/auth-sessions.ts` lines 188-202                                                                                                   |
| Sealed values survive only one secret rotation (`SESSION_SECRET_PREVIOUS`)                                                                                                                | `lib/auth-crypto.ts` lines 33-43                                                                                                            |
| The cleanup worker's last statement deletes from `community_assets` only                                                                                                                  | `services/asset-cleanup-worker.ts` lines 63-67                                                                                              |
| The export already strips `correctOptionId` from nested JSON (`NOT_EXPORTED_NESTED`, `redact`); it still runs `SELECT *` per foreign key to `users`; erase queues only `community_assets` | `services/account-data.ts` lines 36-52, 87-136                                                                                              |
| One header entry on `/:path*` sets `Permissions-Policy: camera=(), microphone=()`                                                                                                         | `artifacts/proofstack/next.config.ts` lines 39-55                                                                                           |
| `postReadWhere` is a synchronous SQL fragment used by notifications, the event feed, the reader and social actions                                                                        | `community-policy.ts` 33, 184, 272; `community-query.ts` 130; `community-reader.ts` 258; `community-social-actions.ts` 28                   |
| The first-super-admin script refuses outside development                                                                                                                                  | `artifacts/api-server/scripts/bootstrap-admin.mjs` line 5                                                                                   |
| Last migration is `0021_retired_handles` (`when` 1794315700884); there is no `.gitattributes`; the table count 54 is pinned in two tests                                                  | `lib/db/drizzle/meta/_journal.json`; `tests/preflight-schema.integration.test.ts` 21, 39; `tests/asset-cleanup.integration.test.ts` 429-433 |
| The embedded test database replays every journal file with PGlite 0.5.8                                                                                                                   | `tests/embedded-db.ts`; root `package.json`                                                                                                 |

**Not verified. Each is proven in a named early chunk and has a fallback that does not weaken production enforcement.**

| Assumption                                                                                                   | Proven in                | Fallback                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| drizzle-kit accepts a schema array                                                                           | DB-1                     | A kit-only barrel file that re-exports both barrels; the API never imports it                                             |
| PL/pgSQL triggers with `WHEN (pg_trigger_depth() = 0)` run under PGlite                                      | DB-1                     | Triggers still ship in migration 0028; the embedded harness skips that one tag and guard tests run on PostgreSQL 17 in CI |
| A later `headers()` entry overrides the same key on the Cloudflare runtime                                   | WIRE-1                   | `proxy.ts` sets the header for the two exam paths                                                                         |
| orval generates usable types for per-action `oneOf`                                                          | integration after wave 0 | Flat request object with an `action` enum; server zod stays the strict validator                                          |
| Worker R2 multipart with signed receipts; Durable Object ticket gate                                         | MEDIA-2                  | Single-PUT uploads capped at 95 MiB; playback tickets remain 5-minute bearer links, each audited                          |
| Video provider direct upload, signed playback, webhook shape; raw webhook bytes survive the web-tier rewrite | MEDIA-3                  | Reconcile polling replaces the webhook; video posting stays off if signed playback is unavailable                         |
| Object lock on the ledger anchor bucket                                                                      | LEDGER-1                 | Checkpoints are also written to `audit_logs` and printed by the release gate for off-site copy                            |
| A parser sandbox with no network on the worker host                                                          | REC-1                    | Recorded answers stay off (`SKILLS_RECORDED_ENABLED=false`)                                                               |

---

## 1. Scope and principles

### 1.1 Principles (each one is a build rule)

1. **The server is the only authority.** Timers, draws, option order, scores and state changes are computed and stored on the server. Nothing the client reports is trusted except as an integrity signal.
2. **A published test never changes.** Content is versioned and frozen at publish, including the exact questions each slot may draw. Attempts and assignments pin a version, and every attempt keeps a frozen copy of what the candidate saw.
3. **Answer keys have no path to a candidate.** Keys, rubric descriptors, anchors and interview plans are sealed at rest under a dedicated key ring, live in tables with no foreign key to `users`, and are read by one module that an import rule and a response scanner protect.
4. **No single person or model decides a high-stakes score.** Two-person publishing, blind double human grading with adjudication, two-person item rulings. An AI read is never a recorded score and is never shown to a grader.
5. **Signals are evidence, never verdicts.** A flagged attempt gets a human decision before any organisation sees it. No signal changes a score.
6. **Nobody gains from failure.** No item is dropped from a candidate's maximum because a provider failed or a budget ran out. Late or missing media goes to the incident path, never to a silent zero.
7. **Everything that matters is on a tamper-evident ledger** that holds digests and pseudonyms only, so it survives account erasure.
8. **Honest labels.** Every result states issuer, conduct, grading method, form mode, attempt number, incident time and approval mode. "Monitored" is never called "proctored". Live capture is stated as not verified.
9. **Organisations never grade or read platform test content.** Organisation-authored tests never produce ProofStack credentials.
10. **Privacy by construction.** No face or voice recognition, no continuous webcam proctoring, no keystroke content. Recording, AI evaluation and monitoring each need a separate, versioned, recorded consent. Retention is fixed and enforced by jobs.
11. **Additive and off by default.** No existing table gains a column. New tables live in a second schema barrel, so code can deploy before the owner approves a migration and only the new areas are off. Every area that needs a key or a service is off until configured.
12. **Core code never names a module table while its migration is pending.** Every touch point in existing code has a readiness branch and a test that runs with the module tables absent.
13. **Authoring speed is a requirement.** Template to draft in under ten minutes; keyboard-first editing; 500-question import; anchors shared across question variants.

### 1.2 In v1

| Area             | In v1                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access           | Owner-granted platform capabilities; organisation type and verification with domain proof; per-member organisation capabilities; entitlements with atomic seats (granted by the owner team)                                                                                                                                                  |
| Authoring        | Twelve built-in templates plus saved templates; series, tests, sections, slots, pools; six formats (single choice, multi-select, long-form, coding, recorded audio/video, AI interview); rubric families with shared anchors; block builder; bulk import; review with diff; two-person publish; AI drafting that always needs human approval |
| Attempts         | Reproducible per-candidate draw with a sealed random seed; common-paper and fixed-form modes; server timers; in-memory autosave; per-attempt HttpOnly credential; single active client; supervised sittings with an admit list; accommodations with oversight                                                                                |
| Grading          | Automatic for objective items; blind double human grading; adjudication; calibration gates; hidden validity anchors; AI reader as a non-deciding extra read; item statistics; pretest items; item rulings                                                                                                                                    |
| Trust            | Hash-chained ledger with signed daily checkpoints; signed credentials with a public verification page; two-level appeals; human integrity review; public methodology page                                                                                                                                                                    |
| Recorded answers | Capture on the exam route only; multipart upload while recording through a dedicated media Worker to a private evidence bucket; original kept with its digest ledgered; derived seekable and audio-only renditions; machine transcripts                                                                                                      |
| AI interview     | Structured, turn-based; verbatim core prompts; scripted fallback so it always completes; text first, push-to-talk voice gated                                                                                                                                                                                                                |
| Colleges         | Verified college organisations, cohorts, one-step roster import, hashed invite tokens, join codes, assignments with windows, per-assignment sharing consent, dashboards with small-cell suppression                                                                                                                                          |
| Hiring           | Hosted check or third-party link on a job; manager-initiated invitations; candidates attach platform credentials                                                                                                                                                                                                                             |
| Social           | Posts with up to four images or one native video; Shorts; topics; repost and quote; daily routine posts; any-aspect-ratio grid; reports, reversible restrictions, blocks                                                                                                                                                                     |

### 1.3 Deferred, with reasons

| Deferred                                                           | Reason                                                                                                                                                                                                                        |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server-side code execution with hidden tests                       | It is the largest new attack surface. Coding items are graded by rubric in v1; the existing sandboxed runner is the candidate's own test bench and is never trusted for scoring. The content model keeps an `execution` hook. |
| Webcam proctoring, face matching, identity clips, lockdown browser | Biometric processing contradicts the published privacy position and needs legal review. Supervised sittings and recorded answers give lawful assurance.                                                                       |
| Realtime full-duplex voice                                         | Puts provider credentials and turn control in the browser. Push-to-talk keeps the server state machine.                                                                                                                       |
| Online checkout                                                    | Selling triggers consumer and e-commerce duties and needs the owner's provider and pricing decisions. v1 sells by invoice and owner grant.                                                                                    |
| Under-18 accounts                                                  | Needs verifiable parental consent. Every college invite states the 18+ rule.                                                                                                                                                  |
| Statistical equating and adaptive testing                          | Needs response volume. v1 uses single-stratum slots, pretest items and an empirical tolerance band, and labels randomised results as not statistically equated.                                                               |
| AI-text detectors                                                  | Unreliable and biased against non-native writers.                                                                                                                                                                             |
| Ranked feed, direct messages, live streaming                       | Not required; each adds abuse surface.                                                                                                                                                                                        |
| College single sign-on, LMS integration, Open Badges export        | After the core is proven.                                                                                                                                                                                                     |

### 1.4 New infrastructure (the current stack keeps working without any of it)

| Addition                                                                         | Used for                                                            | When absent                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Always-on API instance and one work-worker service                               | Grading jobs, sweeper, mail, retention, checkpoints                 | Jobs drain on request, as the intelligence queue does today         |
| Media Worker on its own origin, private evidence bucket with its own credentials | Recorded answers and voice clips                                    | Recorded and voice formats are off                                  |
| Media-processor image (probe, antivirus, remux) with no network                  | Validation and renditions                                           | Recorded answers are off; recordings are never playable unvalidated |
| Hosted video provider with signed playback                                       | Post video and Shorts                                               | Video posting is off; links to external players still work          |
| Mail sender                                                                      | Invites and notices                                                 | In-app notices only; roster import by email is off                  |
| AI provider models per task                                                      | Interview follow-ups, AI reader, drafting, transcription, screening | Interviews run scripted; grading is human only                      |
| Object-locked bucket                                                             | Ledger checkpoints                                                  | Checkpoints stay in the database and the release gate output        |
| Paid Workers plan and larger database pool                                       | Bundle size and exam-day load                                       | Works at small scale                                                |

---

## 2. Roles and access matrix

### 2.1 How access is modelled

Five mechanisms, all additive.

1. **Platform roles (unchanged).** `users.platform_role` stays `moderator | admin | super_admin`. No enum value is added, because `assertPlatformManagement` treats any unknown role as admin. A platform role alone gives no access to assessment content, keys, responses or results.

2. **Platform capability grants (`platform_grants`).** This is "authoring access granted by the owner".

   | Capability           | Allows                                                                                                                                             |
   | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `skills.author`      | Create and edit platform questions, rubrics, anchors, pools, templates, series and tests; submit for review                                        |
   | `skills.publisher`   | Approve question and rubric versions, publish and retire test versions, propose and approve item rulings. Never on content they authored or edited |
   | `skills.grader`      | Take blind grading tasks for platform tests after passing calibration                                                                              |
   | `skills.adjudicator` | Resolve grader disagreement and decide score appeals. Never on an item they graded                                                                 |
   | `skills.integrity`   | Review integrity cases, grant platform incident time and resume grants, approve accommodations above 25 percent, decide conduct appeals            |

   Rules: only a `super_admin` grants or revokes, with step-up (`requireFresh(session, true)`). The target must hold a verified factor. Nobody can grant to themselves (API check and a database CHECK). No capability is implicit for any role, including `super_admin`. Revocation ends the target's sessions in the same transaction. Every change writes an audit row and an `access` ledger entry. One helper, `requirePlatformCapability(db, session, capability, {stepUp})`, re-reads the grant in SQL joined to the live session row.

3. **Organisation capabilities.** Five permission keys are seeded and granted to `organization_owner` and `organization_admin`. Plain members can receive the same keys one by one through `organization_member_grants` (owner-only action with step-up; the target must be an active member with a verified factor). No new role rows are added.

   | Key                           | Allows                                                                    |
   | ----------------------------- | ------------------------------------------------------------------------- |
   | `skills.organization.author`  | Author the organisation's own private question sets and tests             |
   | `skills.organization.assign`  | Create assignments and invitations, open sittings, request accommodations |
   | `skills.organization.results` | Read results that candidates consented to share with this organisation    |
   | `skills.organization.grade`   | Grade responses to the organisation's own tests (blind until final)       |
   | `education.cohort.manage`     | Manage cohorts, rosters and invitations                                   |

   One helper decides: `orgCapability(db, session, orgId, key, {stepUp, kind})` is true when the role grant holds, or when the user is an active member with an active member grant; it also checks organisation verification and kind where required.

4. **Organisation identity (`organization_accounts`).** `kind` is `company | college | community`; a missing row means `community`, unverified. Verification is a decision by a platform `admin` or `super_admin` with step-up, after domain proof (a DNS TXT record or a code mailed to an address at the claimed domain) and one document checked offline. A verified legal name is unique per kind. Cohorts, assignments, hosted job checks, organisation authoring and result access all need a verified organisation of the right kind. An unverified organisation keeps today's abilities and may attach external test links only. `suspended` removes everything in this document at once.

5. **Entitlements (`entitlements`).** A time-boxed right held by a user or an organisation.

   | Feature                | Holder       | Effect                                                                                                                                |
   | ---------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
   | `skills.premium`       | user         | May start premium platform series                                                                                                     |
   | `skills.seats`         | organisation | N seats; a student's first start under an assignment consumes one, atomically                                                         |
   | `skills.org_authoring` | organisation | May author and run its own question sets; `limits` holds the monthly AI budget and whether recorded and interview formats are allowed |
   | `education.cohorts`    | organisation | May manage cohorts                                                                                                                    |

   The check runs inside the start transaction. A seat is consumed with one conditional statement (`UPDATE entitlements SET seats_used = seats_used + 1 WHERE id = $1 AND seats_used < seats ... RETURNING`) after inserting the `entitlement_uses` row, so concurrent starts by different students can never oversubscribe.

**MFA.** `readSession` treats any active platform grant or organisation member grant as `privileged`, so those holders are forced onto MFA. That query runs only when the platform module is ready. Step-up stays at the house five-minute rule everywhere; bulk work is one step-up-protected action, never a widened window.

**Students are not organisation members.** Enrolment (`edu_enrollments`) grants nothing in `hasPermission`, so a student never sees the roster, teams or private projects. `profiles.kind` is never an authorisation input.

### 2.2 Separation of duties, minimum staffing and the one break-glass

Enforced in SQL, not in the interface:

- **Sitting a test.** At start, the attempt is refused when `skill_content_access` links the caller (as author, reviewer, publisher or key viewer) to any question version in the version's frozen set, or when the caller graded or adjudicated any item of that test. Preview attempts by authors are a separate, unscored context.
- **Publishing.** The publisher must not have authored or edited the version or any question version in it.
- **Grading.** A grader cannot claim a task whose question version they authored, whose candidate shares an organisation or cohort with them, or that they already graded in another pass. The adjudicator of an item must not have graded it.
- **Appeals and integrity.** Nobody who graded the item or made the contested decision can handle the appeal.
- **Item rulings and standards.** A ruling that rescores candidates, and every pass mark or band, needs a proposer and a different approver.

Minimum distinct people:

| Work                                    | People                                                                                                                                             |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Objective-only test, two-person content | 2 (author, publisher)                                                                                                                              |
| Human-graded test, policy `single`      | 3 (author, publisher who may also grade, one more for audit reads and appeals)                                                                     |
| Policy `double`                         | 4 (author, two graders of whom one may be the publisher, adjudicator)                                                                              |
| Score appeal on a double-marked item    | 2 more who never touched the item (fresh grader, adjudicator); if none exist the appeal stays open and visible until the owner appoints a reviewer |

**Break-glass for a one-person team.** A sole owner cannot grant to themselves in the product. A host-confirmed operator script (`grant-owner-capabilities.mjs`, same target-host confirmation as `migrate:release`) may give the only active `super_admin` the `skills.author` and `skills.publisher` grants for 90 days, with `source = 'break_glass'`. Content approved or published under it is stored with `approval_mode = 'single_approver'`, and every result and credential from it shows "Single-approver content". It never allows one person to grade and adjudicate the same item, and that person still cannot sit the test.

**Support access.** A `super_admin` may open one identified result through a dedicated action that needs step-up and a typed reason, writes an audit row and an attempt-ledger entry the candidate can see, and notifies the organisation owner when organisation-private content is involved.

### 2.3 Matrix

"Own" means rows whose `user_id` is the caller. "Consented" means an active `data_sharing_grants` row for that candidate, organisation and object. Denials are 404 where existence must not leak, 403 otherwise.

| Actor                                     | Author content                     | Publish                 | Sit tests                      | Grade                        | See results                | See responses and recordings | See integrity detail     | Assign                       | Moderate social |
| ----------------------------------------- | ---------------------------------- | ----------------------- | ------------------------------ | ---------------------------- | -------------------------- | ---------------------------- | ------------------------ | ---------------------------- | --------------- |
| Super admin                               | With grant only                    | With grant only         | Yes                            | With grant only              | Support view only, audited | Support view only            | With grant only          | No                           | Yes             |
| Platform admin                            | No                                 | No                      | Yes                            | No                           | No                         | No                           | No                       | No                           | Yes             |
| Moderator                                 | No                                 | No                      | Yes                            | No                           | No                         | No                           | No                       | No                           | Queue           |
| Granted author                            | Platform content                   | No                      | Yes, never a test they touched | No                           | No                         | No                           | No                       | No                           | No              |
| Granted publisher                         | Review only                        | Yes, not own work       | As above                       | No                           | No                         | No                           | No                       | No                           | No              |
| Granted grader                            | No                                 | No                      | Yes, never a test they graded  | Platform tests, blind        | No                         | Blind task view only         | No                       | No                           | No              |
| Adjudicator                               | No                                 | No                      | As above                       | Disagreements, score appeals | Case scope                 | Blind task view              | No                       | No                           | No              |
| Integrity reviewer                        | No                                 | No                      | Yes                            | No                           | Case scope                 | Case scope                   | Yes                      | Incident time, resume grants | No              |
| College or company owner/admin (verified) | Own private sets, with entitlement | Own sets, second author | Yes                            | Own tests, blind until final | Consented                  | Own tests only               | Reviewed category only   | Yes                          | No              |
| Staff with member grant                   | Per grant                          | Per grant               | Yes                            | Per grant                    | Consented, per grant       | Own tests only               | Reviewed category only   | Per grant                    | No              |
| Student or candidate                      | No                                 | No                      | Yes                            | No                           | Own                        | Own                          | Own events and decisions | No                           | Report          |
| Visitor                                   | No                                 | No                      | No                             | No                           | Public credentials         | No                           | No                       | No                           | No              |

---

## 3. Data model

### 3.1 Two schema barrels (code can deploy before a migration is approved)

`schemaGuard` answers 503 for the whole API in production when any table exported from `lib/db/src/schema/index.ts` lacks a column. So:

- New tables live in `lib/db/src/modules/<module>.ts` and are exported from `lib/db/src/modules/index.ts` as namespaces: `platform`, `media`, `social`, `skillsContent`, `distribution`, `skillsAttempts`, `skillsGrading`. `lib/db/src/schema/index.ts` and `services/health.ts` are not changed.
- `lib/db/package.json` gains the export `"./modules"`. `lib/db/drizzle.config.ts` sets `schema` to both barrels so migrations, snapshots and `ops:preflight` cover everything. Fallback: a kit-only file `lib/db/src/kit-schema.ts` that re-exports both barrels, used only by drizzle-kit.
- DB-1 creates every module file as an empty stub. Each later schema chunk fills its own file, so the modules barrel never changes again.
- `services/module-ready.ts` runs the same column check per module (cached 300 s when ready, 5 s when not; a module with no tables is never ready) and exposes:
  - `moduleGuard(...modules)`: router middleware; answers `503 FEATURE_UNAVAILABLE` when a module is missing or the area's flag is off.
  - `modulesWarm`: one middleware after `schemaGuard` that refreshes the cache when stale, so synchronous readers are always current.
  - `moduleReadySync(module)`: a boolean for shared code that builds SQL strings.
  - `guardsReady()`: true when the triggers of migration 0028 exist. Starting an attempt requires it.
- Existing code touches module tables in exactly five places, each behind `moduleReadySync` and each with a test that runs against a database holding only migrations 0000-0021: `readSession` (grants), `postReadWhere` and the event feed (restrictions), `notificationReadWhere` (new titles), `eraseAccount` (media queue, ledger entries, sanctions), and the asset cleanup worker (media rows).
- No existing table gains a column. Every extension is a side table.

`ops:preflight` still fails until the migrations are applied. That is the intended release gate.

### 3.2 Conventions

- `id uuid primary key default gen_random_uuid()` unless stated; `timestamptz`; snake_case; explicit index and constraint names; text plus `CHECK` for states (no new pg enums); `created_at timestamptz not null default now()` on every table and omitted below.
- Foreign keys: `-> table C` (CASCADE), `SN` (SET NULL), `R` (RESTRICT). **Every key to `users` is C or SN.** C means the row is that person's own data. SN marks an actor column (who did something to someone else's data).
- **Proof survives erasure.** Wherever a control depends on an actor (approved, published, decided), a companion timestamp column is the constraint target and the ledger holds the actor's pseudonym. Actor columns can then become NULL when that person is erased.
- **Export.** `services/export-policy.ts` holds one entry per `table.column` that references `users`: `full`, a column list, or `none`. The 54 existing tables keep today's behaviour through a frozen baseline list. For every later foreign key a missing entry fails `tests/export-policy.integration.test.ts`. All actor columns are `none`. The member's skill data is exported by one contributor with explicit columns (section 14.3). The existing `NOT_EXPORTED_NESTED` redaction stays and is the only mechanism for nested keys.
- "No user key" marks tables that must never gain a foreign key to `users`.
- **Sealed columns** hold AES-256-GCM output from `lib/skill-crypto.ts` and are paired with `key_id text`. The key ring (`SKILL_KEY_RING`) keeps retired keys readable for as long as any row names them; preflight checks that every `key_id` in the database is in the ring.
- **Tenant scope** on content tables: `owner_kind text CHECK in ('platform','organization')`, `owner_org_id uuid -> organizations SN`, `CHECK (owner_kind = 'organization' OR owner_org_id IS NULL)`. A row with `owner_kind = 'organization'` and a NULL owner is orphaned: nobody can manage or start it, but results that reference it stay verifiable. "owner scope" below means `coalesce(owner_org_id, '00000000-0000-0000-0000-000000000000')`.
- Migrations run under PGlite in tests: no extensions, no `CREATE INDEX CONCURRENTLY`. `.gitattributes` forces LF on `lib/db/drizzle/**`, because preflight compares hashes of the raw files.

| Migration                  | Module file             | New tables | Public tables after |
| -------------------------- | ----------------------- | ---------- | ------------------- |
| `0022_platform_foundation` | `platform.ts`           | 12         | 66                  |
| `0023_media_social`        | `media.ts`, `social.ts` | 14         | 80                  |
| `0024_skill_content`       | `skills-content.ts`     | 21         | 101                 |
| `0025_distribution`        | `distribution.ts`       | 9          | 110                 |
| `0026_skill_attempts`      | `skills-attempts.ts`    | 12         | 122                 |
| `0027_skill_grading`       | `skills-grading.ts`     | 9          | 131                 |
| `0028_skill_guards`        | custom SQL              | 0          | 131                 |

Each migration is one serial build chunk. Journal `when` values increase strictly after 1794315700884. The two pinned table counts are updated by the integrator after each schema chunk.

### 3.3 Migration 0022_platform_foundation

**platform_grants**: `user_id -> users C`; `capability text CHECK in ('skills.author','skills.publisher','skills.grader','skills.adjudicator','skills.integrity')`; `source text default 'grant' CHECK in ('grant','break_glass')`; `reason text CHECK (char_length between 3 and 500)`; `granted_by -> users SN`; `expires_at`; `revoked_at`; `revoked_by -> users SN`. `CHECK (granted_by IS NULL OR granted_by <> user_id)`. Unique `(user_id, capability) WHERE revoked_at IS NULL`; index `(capability) WHERE revoked_at IS NULL`.

**organization_accounts**: `organization_id uuid primary key -> organizations C`; `kind text default 'community' CHECK in ('company','college','community')`; `verification text default 'unverified' CHECK in ('unverified','pending','verified','rejected','suspended')`; `legal_name`; `website_domain`; `verified_domains jsonb default '[]'`; `domain_proof_digest text`; `evidence_note text CHECK (char_length <= 1000)` (reviewers only); `requested_by SN`; `requested_at`; `verified_by SN`; `verified_at`; `updated_at`. `CHECK (verification <> 'verified' OR (verified_at IS NOT NULL AND legal_name IS NOT NULL AND kind <> 'community'))`. Unique `(kind, lower(legal_name)) WHERE verification = 'verified'`; index `(kind, verification)`.

**organization_member_grants**: `organization_id -> organizations C`; `user_id -> users C`; `capability text CHECK in (the five keys of 2.1)`; `granted_by SN`; `revoked_at`. Unique `(organization_id, user_id, capability) WHERE revoked_at IS NULL`; index `(user_id) WHERE revoked_at IS NULL`.

**entitlements**: `user_id -> users C null`; `organization_id -> organizations C null`; `CHECK (num_nonnulls(user_id, organization_id) = 1)`; `feature text CHECK in ('skills.premium','skills.seats','skills.org_authoring','education.cohorts')`; `seats integer null CHECK (seats > 0)`; `seats_used integer not null default 0 CHECK (seats_used >= 0)`; `CHECK (seats IS NULL OR seats_used <= seats)`; `CHECK (seats IS NULL OR organization_id IS NOT NULL)`; `limits jsonb default '{}'`; `starts_at default now()`; `ends_at not null CHECK (ends_at > starts_at)`; `source text CHECK in ('comp','invoice','purchase')`; `external_ref`; `granted_by SN`; `revoked_at`. Indexes `(user_id, feature)`, `(organization_id, feature)`.

**entitlement_uses**: `entitlement_id -> entitlements C`; `user_id -> users C`; `first_used_at default now()`. Primary key `(entitlement_id, user_id)`.

**work_jobs** (no user key): `kind text CHECK (kind ~ '^[a-z][a-z0-9-]{2,40}$')`; `dedupe_key text not null unique`; `ref_id uuid`; `payload jsonb default '{}' CHECK (octet_length(payload::text) <= 8192)`; `sealed_payload text`; `key_id text`; `state text default 'queued' CHECK in ('queued','running','done','failed','cancelled')`; `attempts integer default 0 CHECK (attempts between 0 and 5)`; `available_at default now()`; `lease_id uuid`; `lease_until`; `provider_started_at`; `error text`; `finished_at`. Indexes `(state, available_at, created_at)`, `(state, lease_until)`. Kinds in v1: `finalize`, `grade-ai`, `transcribe`, `media-validate`, `media-reconcile`, `provider-delete`, `similarity`, `pattern-analysis`, `item-stats`, `form-check`, `ledger-checkpoint`, `mail`, `retention`.

**hook_receipts** (no user key): `event_hash text primary key`; `source text CHECK in ('video','mail')`; `status text CHECK in ('accepted','ignored')`; `received_at default now()`. Pruned after 7 days.

**mail_suppressions** (no user key): `email_digest text primary key`; `reason text CHECK in ('bounce','complaint','manual')`.

**skill_ledger** (no user key, append-only): `id bigint generated always as identity primary key`; `chain text not null CHECK (chain ~ '^(access|content|grading|moderation|attempt:[0-9a-f-]{36})$')`; `seq integer not null CHECK (seq > 0)`; `prev_hash text not null`; `entry_hash text not null unique`; `type text not null CHECK (type ~ '^[a-z][a-z0-9_.]{2,60}$')`; `actor_ref text` (HMAC pseudonym, never a user id); `at timestamptz not null default now()`; `payload jsonb not null CHECK (octet_length(payload::text) <= 8192)` (ids, digests, codes and numbers only). Unique `(chain, seq)`.

**skill_ledger_checkpoints** (no user key): `at`; `entries_through bigint unique`; `chain_count integer`; `merkle_root text`; `signature text`; `key_id text`; `anchor_ref text`.

**ai_usage** (no user key): `purpose text CHECK in ('grading','interview','transcription','speech','drafting','moderation','calibration','screening')`; `scope_org_id -> organizations SN`; `ref_type text`; `ref_id uuid`; `model`; `prompt_version`; `input_units bigint default 0`; `output_units bigint default 0`; `cost_micros bigint default 0`; `status text CHECK in ('reserved','ok','failed','unknown')`; `started_at`; `finished_at`. Indexes `(purpose, started_at)`, `(ref_type, ref_id)`. Column and metadata names avoid the word "token" because audit metadata rejects it.

**ai_budgets** (no user key): primary key `(scope text, period text)`; `limit_micros bigint`; `reserved_micros bigint default 0`; `spent_micros bigint default 0`; all `>= 0`.

Seed, hand-appended with `ON CONFLICT DO NOTHING`: the five organisation permission keys and their ten `role_permissions` rows for `organization_owner` and `organization_admin`. Nothing for `organization_member`. The three `community.organization.*` keys are untouched, so `inspectCommunityGrants` still passes.

### 3.4 Migration 0023_media_social

**media_objects**: `owner_id -> users C null`; `content_owner_kind text null CHECK in ('platform','organization')`; `content_org_id -> organizations SN`; `created_by -> users SN`; `kind text CHECK in ('image','video','audio')`; `purpose text CHECK in ('post','answer','interview','question','anchor')`; `CHECK ((purpose IN ('question','anchor')) = (owner_id IS NULL))` (content media belongs to the test, not to its uploader, so erasing an author never deletes a question image); `storage text CHECK in ('r2_social','r2_evidence','stream')`; `namespace text` (bucket directory captured at reservation); `object_path text null CHECK (object_path ~ '^/objects/ready/[0-9a-f-]{36}$')`; `external_id text null`; `CHECK ((storage = 'stream') = (external_id IS NOT NULL))`; `CHECK ((storage <> 'stream') = (object_path IS NOT NULL))`; `state text CHECK in ('reserved','uploading','processing','ready','failed','deleting')`; `content_type`; `declared_bytes bigint CHECK (declared_bytes between 1 and 314572800)`; `bytes bigint`; `width integer`; `height integer`; `duration_ms integer`; `sha256 text` (manifest digest of the original); `thumbhash text`; `scan text default 'pending' CHECK in ('pending','clean','infected')`; `moderation text default 'pending' CHECK in ('pending','clear','held','removed')`; `upload_expires_at`; `ready_at`. Indexes `(owner_id, created_at)`, `(state, upload_expires_at)`; unique `(external_id) WHERE external_id IS NOT NULL`; unique `(object_path) WHERE object_path IS NOT NULL`.

Every R2 object, including recordings and renditions, is one object at `/objects/ready/<uuid>`. That shape satisfies the existing `OBJECT_PATH` rule and the `asset_cleanup_jobs` constraint, so the existing deletion outbox is reused, with the worker change in section 7.9.

**media_uploads**: `media_id uuid primary key -> media_objects C`; `encrypted_payload text` (sealed upload reference; the column name is already in `NOT_EXPORTED`); `part_bytes integer`; `max_bytes bigint`; `parts jsonb default '[]'` (`[{n, etag, sha256, bytes, at}]`); `state text CHECK in ('open','completed','aborted','expired')`; `expires_at`.

**media_renditions**: `media_id -> media_objects C`; `kind text CHECK in ('playback','audio','poster','transcript')`; `object_path text unique CHECK (same pattern)`; `namespace`; `content_type`; `bytes bigint`; `state text default 'ready' CHECK in ('ready','deleting')`. Unique `(media_id, kind)`.

**media_cleanup_jobs** (external provider deletions; no keys by design): `provider text CHECK in ('stream','ai')`; `external_id text`; `state text default 'pending' CHECK in ('pending','leased','failed','complete')`; `attempts integer CHECK (attempts between 0 and 8)`; `available_at`; `lease_token uuid`; `leased_until`; `last_error`; `completed_at`. Unique `(provider, external_id)`; index `(state, available_at)`.

**community_post_details**: `post_id uuid primary key -> community_posts C`; `kind text CHECK in ('post','routine','short','video')`; `quote_post_id -> community_posts SN`. Indexes `(kind, created_at, post_id)`, `(quote_post_id)`. A post without a row is `kind = 'post'`.

**community_post_media**: primary key `(post_id -> community_posts C, position smallint CHECK (position between 0 and 3))`; `media_id -> media_objects C unique`; `alt text CHECK (char_length <= 500)`.

**community_reposts**: primary key `(user_id -> users C, post_id -> community_posts C)`. Indexes `(post_id)`, `(user_id, created_at)`.

**community_topics**: `slug text unique CHECK (slug ~ '^[a-z0-9][a-z0-9_]{1,49}$')`; `label`; `status text default 'active' CHECK in ('active','blocked')`.

**community_post_topics**: primary key `(post_id -> community_posts C, topic_id -> community_topics C)`. Index `(topic_id, post_id)`.

**community_routines**: `post_id uuid primary key -> community_posts C`; `author_id -> users C`; `day date`; `items jsonb CHECK (octet_length(items::text) <= 4096)` (up to 12 `{label, done}`); `minutes integer CHECK (minutes between 0 and 1440)`. Unique `(author_id, day)`.

**community_blocks**: primary key `(blocker_id -> users C, blocked_id -> users C)`; `CHECK (blocker_id <> blocked_id)`. Index `(blocked_id)`. Export: `blocker_id` full, `blocked_id` none.

**content_reports**: `reporter_id -> users SN`; `target_type text CHECK in ('post','comment','media','profile','job','job_check')`; `target_id uuid`; `reason text CHECK in ('illegal','sexual','child_safety','harassment','hate','violence','spam','impersonation','privacy','intellectual_property','cheating','other')`; `details text CHECK (char_length <= 2000)`; `state text default 'open' CHECK in ('open','triaged','actioned','dismissed')`; `due_at not null`; `handled_by SN`; `handled_at`. Unique `(reporter_id, target_type, target_id) WHERE state = 'open'`; indexes `(state, due_at)`, `(target_type, target_id)`.

**content_restrictions**: `target_type text`; `target_id uuid`; `action text CHECK in ('hidden','removed')`; `reason_code text`; `actor_id -> users SN` (NULL means an automated hold); `report_id -> content_reports SN`; `lifted_at`; `lifted_by SN`. Unique `(target_type, target_id) WHERE lifted_at IS NULL`; index `(target_type, target_id)`. Restoring is lifting the row; the post row is never deleted and re-inserted.

**content_suspensions**: `user_id -> users C`; `reason_code`; `actor_id SN`; `starts_at`; `ends_at`. Index `(user_id, ends_at)`.

### 3.5 Migration 0024_skill_content

All content tables carry the tenant scope columns of 3.2 ("scope"). Author columns are SN.

**skill_templates**: scope; `kind text CHECK in ('test','section','rubric','question')`; `key text`; `title`; `description`; `category`; `blueprint jsonb CHECK (octet_length(blueprint::text) <= 262144)`; `version integer`; `status text CHECK in ('draft','active','retired')`; `created_by SN`; `updated_at`. Unique `(owner scope, kind, key, version)`.

**skill_series**: scope; `slug text CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')`; `title`; `summary`; `skill`; `level text CHECK in ('foundation','intermediate','advanced')`; `access text CHECK in ('free','premium','private')`; `status text CHECK in ('draft','published','retired')`; `created_by SN`; `updated_at`. `CHECK ((owner_kind = 'organization') = (access = 'private'))`. Unique `(slug) WHERE owner_kind = 'platform'`; unique `(owner_org_id, slug) WHERE owner_kind = 'organization'`.

**skill_tests**: `series_id -> skill_series R`; `position integer`; `slug`; `title`; `legacy_assessment_id text null unique`. Unique `(series_id, position)`, `(series_id, slug)`.

**skill_test_versions**: `test_id -> skill_tests R`; `version integer CHECK (version > 0)`; `status text CHECK in ('draft','in_review','published','retired')`; `retire_reason text null CHECK in ('superseded','pool_depth','manual')`; `duration_seconds integer CHECK (duration_seconds between 60 and 21600)`; `integrity_level text CHECK in ('open','monitored','supervised')`; `grading_policy text CHECK in ('auto','single','single_sampled','double','ai_practice')`; `form_mode text CHECK in ('pooled','fixed')`; `max_attempts smallint CHECK (max_attempts between 1 and 10)`; `cooldown_hours integer CHECK (cooldown_hours >= 0)`; `pass_percent numeric(5,2) null`; `bands jsonb null`; `standard_method text default 'none' CHECK in ('none','expert_panel','modified_angoff','bookmark','norm_referenced')`; `standard_note text`; `standard_set_by SN`; `standard_approved_by SN`; `standard_approved_at`; `reveal_level text default 'topics' CHECK in ('score','topics','items')`; `audio_only_review boolean default true`; `instructions text`; `conduct_notice text not null`; `approval_mode text default 'two_person' CHECK in ('two_person','single_approver')`; `content_digest text`; `created_by SN`; `submitted_by SN`; `published_by SN`; `published_at`; `updated_at`. Unique `(test_id, version)`; unique `(test_id) WHERE status = 'published'`; unique `(test_id) WHERE status IN ('draft','in_review')`. Checks: `(status IN ('published','retired')) = (content_digest IS NOT NULL AND published_at IS NOT NULL)`; `status IN ('draft','in_review') OR (pass_percent IS NULL AND bands IS NULL) OR (standard_method <> 'none' AND standard_approved_at IS NOT NULL)`; `grading_policy <> 'ai_practice' OR integrity_level = 'open'`; `reveal_level <> 'items' OR (form_mode = 'fixed' AND integrity_level = 'open')`.

**skill_sections**: `test_version_id -> skill_test_versions C`; `position`; `title`; `duration_seconds integer null`; `navigation text CHECK in ('free','forward_only')`; `instructions`. Unique `(test_version_id, position)`.

**skill_section_slots**: `section_id -> skill_sections C`; `position`; `pool_id -> skill_pools R null`; `question_id -> skill_questions R null`; `CHECK (num_nonnulls(pool_id, question_id) = 1)`; `draw_count smallint CHECK (draw_count between 1 and 50)`; `CHECK (question_id IS NULL OR draw_count = 1)`; `topic text null`; `difficulty smallint null CHECK (difficulty between 1 and 5)`; `format text null`; `CHECK (pool_id IS NULL OR (topic IS NOT NULL AND difficulty IS NOT NULL AND format IS NOT NULL))` (a pool slot fixes one topic, one difficulty stratum and one format); `scored boolean default true` (false is a pretest slot); `points numeric(6,2) CHECK (points >= 0)`; `CHECK (scored = (points > 0))`. Unique `(section_id, position)`.

**skill_slot_items** (the frozen draw set, written at publish): primary key `(slot_id -> skill_section_slots C, question_version_id -> skill_question_versions R)`.

**skill_pools**: scope; `name`; `skill`; `description`; `created_by SN`. Unique `(owner scope, lower(name))`.

**skill_questions**: scope; `format text CHECK in ('mcq_single','mcq_multi','long_form','coding','recorded','interview')`; `topic text`; `difficulty smallint CHECK (difficulty between 1 and 5)`; `rubric_id -> skill_rubrics R null`; `CHECK ((format IN ('mcq_single','mcq_multi')) = (rubric_id IS NULL))`; `status text CHECK in ('draft','pretest','active','retired','retired_leaked')`; `current_version_id uuid null` (no key; checked in code); `ai_drafted boolean default false`; `created_by SN`. Index `(owner_org_id, format, status, topic, difficulty)`.

**skill_pool_questions**: primary key `(pool_id -> skill_pools C, question_id -> skill_questions C)`.

**skill_question_versions** (candidate-visible content only): `question_id -> skill_questions R`; `version integer`; `body jsonb not null CHECK (octet_length(body::text) <= 65536)`; `state text CHECK in ('draft','approved','retired')`; `approval_mode text null CHECK in ('two_person','single_approver')`; `content_digest text`; `created_by SN`; `approved_by SN`; `approved_at`. Unique `(question_id, version)`; unique `(question_id) WHERE state = 'draft'`. `CHECK ((state = 'draft') = (approved_at IS NULL))`.

**skill_question_keys** (no user key): `question_version_id uuid primary key -> skill_question_versions C`; `sealed_key text not null`; `key_id text not null`; `key_digest text not null`; `rubric_version_id -> skill_rubric_versions R null`.

**skill_question_media**: primary key `(question_version_id -> skill_question_versions C, media_id -> media_objects R)`. A candidate reaches a question image only through an attempt item that references this version.

**skill_rubrics** (a rubric family; anchors and calibration attach here): scope; `title`; `skill`; `created_by SN`.

**skill_rubric_versions**: `rubric_id -> skill_rubrics R`; `version integer`; `summary jsonb not null` (candidate-visible: `[{id, title, weight, maxLevel}]`); `sealed_criteria text not null` (level descriptors and marker notes); `key_id text`; `max_score numeric(7,3)`; `state text CHECK in ('draft','approved','retired')`; `content_digest`; `created_by SN`; `approved_by SN`; `approved_at`. Unique `(rubric_id, version)`.

**skill_anchor_sets** (no user key): `rubric_id -> skill_rubrics R`; `purpose text CHECK in ('calibration','validity','ai_gate')`; `title`; `state text CHECK in ('draft','approved','retired')`. Index `(rubric_id, purpose, state)`.

**skill_anchors** (no user key): `anchor_set_id -> skill_anchor_sets C`; `rubric_version_id -> skill_rubric_versions R`; `format text CHECK in ('long_form','coding','recorded','interview')`; `sealed_prompt text not null`; `sealed_response text null`; `media_id -> media_objects R null`; `CHECK (num_nonnulls(sealed_response, media_id) = 1)`; `sealed_gold text not null` (gold levels and rationale); `key_id text`; `level_band smallint` (overall level, for spread checks).

**skill_reviews**: `subject_type text CHECK in ('question_version','rubric_version','test_version','template','anchor_set')`; `subject_id uuid`; `reviewer_id -> users SN`; `decision text CHECK in ('approved','changes_requested')`; `comment text CHECK (char_length <= 4000)`. Index `(subject_type, subject_id)`.

**skill_content_access**: primary key `(question_version_id -> skill_question_versions C, user_id -> users C, role text CHECK in ('author','reviewer','publisher','key_viewer'))`; `first_at default now()`. Index `(user_id)`. This is what the start-time exclusion reads.

**skill_item_stats** (no user key): `question_version_id uuid primary key -> skill_question_versions C`; `exposures integer default 0`; `scored_exposures integer default 0`; `mean_score numeric(6,4)`; `discrimination numeric(6,4)`; `median_seconds integer`; `calibrated_at`; `drift_flagged_at`; `updated_at`.

**skill_item_rulings**: `question_version_id -> skill_question_versions R`; `kind text CHECK in ('void','accept_all','rekey','retire_leaked')`; `sealed_detail text null` (a corrected key); `key_id text`; `reason text CHECK (char_length between 20 and 2000)`; `state text CHECK in ('proposed','approved','applied','rejected')`; `proposed_by SN`; `proposed_at`; `approved_by SN`; `approved_at`; `applied_at`. `CHECK (state IN ('proposed','rejected') OR approved_at IS NOT NULL)`. Indexes `(question_version_id)`, `(state)`.

### 3.6 Migration 0025_distribution

**edu_cohorts**: `organization_id -> organizations C`; `name`; `program`; `term`; `starts_on date`; `ends_on date`; `status text CHECK in ('active','archived')`; `join_code_hash text null`; `join_requires_approval boolean default true`; `allowed_email_domains jsonb default '[]'`; `created_by SN`; `updated_at`. Unique `(organization_id, name)`; unique `(join_code_hash) WHERE join_code_hash IS NOT NULL`.

**edu_enrollments**: `cohort_id -> edu_cohorts C`; `user_id -> users C null` (set on acceptance); `email_digest text not null` (keyed HMAC of the lower-cased address); `encrypted_payload text null` (sealed address and name hint; cleared on acceptance, decline and expiry); `token_hash text null` (digest of a 256-bit single-use token; cleared on use); `roll_no text CHECK (char_length <= 40)` (set by staff only); `state text CHECK in ('invited','pending_approval','active','declined','removed','left','expired')`; `invited_by SN`; `invited_at`; `responded_at`; `expires_at`. Unique `(cohort_id, email_digest)`; unique `(cohort_id, user_id) WHERE user_id IS NOT NULL`; unique `(token_hash) WHERE token_hash IS NOT NULL`; index `(user_id, state)`.

**data_sharing_grants** (the consent record for an organisation to read something): `user_id -> users C`; `organization_id -> organizations C`; `scope text CHECK in ('enrollment','assignment','credential')`; `ref_id uuid not null`; `notice_version text not null`; `granted_at default now()`; `revoked_at`. Unique `(user_id, organization_id, scope, ref_id) WHERE revoked_at IS NULL` (a grant can be given again after revocation and the history is kept); index `(organization_id, scope, ref_id)`.

**skill_assignments**: `organization_id -> organizations C`; `test_version_id -> skill_test_versions R`; `context text CHECK in ('cohort','job','direct')`; `cohort_id -> edu_cohorts C null`; `job_id -> career_jobs C null`; `CHECK ((context = 'cohort') = (cohort_id IS NOT NULL))`; `CHECK ((context = 'job') = (job_id IS NOT NULL))`; `title`; `opens_at`; `closes_at CHECK (closes_at > opens_at)`; `start_window_minutes smallint null CHECK (start_window_minutes between 5 and 15)`; `attempts_allowed smallint CHECK (attempts_allowed between 1 and 5)`; `paper_mode text CHECK in ('randomized','common')`; `supervised boolean default false`; `CHECK (paper_mode = 'randomized' OR supervised OR start_window_minutes IS NOT NULL)`; `result_release text CHECK in ('on_final','after_close','manual')`; `released_at`; `entitlement_id -> entitlements SN`; `sealed_seed text null`; `key_id text` (common paper only); `state text CHECK in ('draft','open','closed','cancelled')`; `opened_at`; `created_by SN`; `updated_at`. Indexes `(organization_id, state, closes_at)`, `(cohort_id)`, `(job_id)`.

**skill_assignment_candidates**: `assignment_id -> skill_assignments C`; `user_id -> users C`; `application_id -> career_applications SN null`; `state text CHECK in ('invited','accepted','declined','started','completed','expired','excused')`; `invited_at`; `responded_at`. Unique `(assignment_id, user_id)`; index `(user_id, state)`.

**skill_accommodations**: `user_id -> users C`; `assignment_candidate_id -> skill_assignment_candidates C null`; `test_id -> skill_tests R null`; `CHECK (num_nonnulls(assignment_candidate_id, test_id) = 1)`; `time_multiplier numeric(3,2) CHECK (time_multiplier between 1.00 and 2.00)`; `alt_format boolean default false`; `state text CHECK in ('pending','active','rejected')`; `approval text CHECK in ('single','second_staff','platform')`; `requested_by SN`; `requested_at`; `approved_by SN`; `approved_at`. `CHECK (state <> 'active' OR approved_at IS NOT NULL)`. Unique `(assignment_candidate_id) WHERE assignment_candidate_id IS NOT NULL`; unique `(user_id, test_id) WHERE test_id IS NOT NULL`. No reason is stored.

**skill_sittings**: `assignment_id -> skill_assignments C`; `label`; `opens_at`; `closes_at`; `encrypted_payload text not null` (sealed rotating-code secret); `venue_network_refs jsonb default '[]'` (keyed digests of allowed network prefixes); `invigilator_id -> users SN`; `expected_count integer`; `attestation jsonb`; `attestation_digest text`; `attested_at`; `state text CHECK in ('scheduled','open','closed','attested','downgraded')`.

**skill_sitting_admits**: primary key `(sitting_id -> skill_sittings C, user_id -> users C)`; `admitted_by SN`; `admitted_at default now()`.

**career_job_checks**: `job_id uuid primary key -> career_jobs C`; `mode text CHECK in ('hosted','external')`; `test_version_id -> skill_test_versions R null`; `external_url text null CHECK (external_url ~ '^https://' AND char_length(external_url) <= 2000)`; `external_label text CHECK (char_length <= 80)`; `instructions text CHECK (char_length <= 2000)`; `invite_cap integer default 500 CHECK (invite_cap between 1 and 500)`; `CHECK ((mode = 'hosted') = (test_version_id IS NOT NULL))`; `CHECK ((mode = 'external') = (external_url IS NOT NULL))`; `created_by SN`; `updated_at`.

### 3.7 Migration 0026_skill_attempts

**skill_attempts**: `user_id -> users C`; `test_id -> skill_tests R`; `test_version_id -> skill_test_versions R`; `assignment_candidate_id -> skill_assignment_candidates SN`; `entitlement_id -> entitlements SN`; `sitting_id -> skill_sittings SN`; `session_id -> sessions SN`; `context text CHECK in ('self','assignment','preview')`; `issuer_kind text CHECK in ('platform','organization')`; `issuer_org_id -> organizations SN`; `issuer_name text not null`; `context_org_id -> organizations SN`; `context_org_name text`; `meta jsonb not null` (series title, test title, version number, content digest); `attempt_no smallint CHECK (attempt_no > 0)`; `state text CHECK in ('in_progress','submitted','grading','finalized','invalidated','voided')`; `started_at default now()`; `deadline_at not null`; `submitted_at`; `submit_reason text null CHECK in ('candidate','deadline','forced')`; `time_multiplier numeric(3,2) default 1.00`; `extra_seconds integer default 0 CHECK (extra_seconds between 0 and 3600)`; `conduct_label text CHECK in ('self_directed','monitored','supervised')`; `paper_mode text CHECK in ('randomized','common','fixed')`; `seed_commitment text not null`; `form_digest text not null`; `draw_digest text not null`; `client_lease uuid not null`; `lease_changes smallint default 0`; `resume_grants smallint default 0`; `sync_seq bigint default 0`; `device_ref text`; `network_ref text`; `agent_ref text`; `last_network_ref text`; `last_agent_ref text`; `client_events integer default 0`; `server_events integer default 0`; `consents jsonb default '{}'`. `CHECK ((state = 'in_progress') = (submitted_at IS NULL))`. Unique `(user_id, test_id) WHERE state = 'in_progress'`; indexes `(user_id, started_at)`, `(state, deadline_at)`, `(assignment_candidate_id)`, `(test_version_id, state)`.

The issuer and context are stored as a kind plus a denormalised name. A NULL organisation never means ProofStack, so deleting an organisation cannot change who issued or graded a result.

**skill_attempt_draws** (no user key): `attempt_id uuid primary key -> skill_attempts C`; `sealed_seed text not null`; `key_id text not null`; `draw_record jsonb not null CHECK (octet_length(draw_record::text) <= 262144)` (algorithm version and, per slot: slot id, digest of the frozen set, excluded question version ids with reasons, drawn ids in order).

**skill_attempt_sections**: primary key `(attempt_id -> skill_attempts C, section_id -> skill_sections R)`; `position`; `opened_at`; `deadline_at`; `closed_at`.

**skill_attempt_items**: `attempt_id -> skill_attempts C`; `section_id -> skill_sections R`; `slot_id -> skill_section_slots R`; `question_version_id -> skill_question_versions R`; `position integer`; `scored boolean`; `points numeric(6,2)`; `body jsonb not null CHECK (octet_length(body::text) <= 65536)` (frozen candidate-visible snapshot with per-attempt public option ids); `revealed_at`; `answer_deadline_at`; `ruling_id -> skill_item_rulings SN`; `ruling_effect text null CHECK in ('void','accept_all','rekey')`. Unique `(attempt_id, position)`, `(attempt_id, question_version_id)`.

**skill_attempt_item_keys** (no user key; objective items only): `attempt_item_id uuid primary key -> skill_attempt_items C`; `sealed_key text not null` (public-id to key map, correct public ids, scoring policy); `key_id text not null`.

**skill_responses**: `attempt_item_id uuid primary key -> skill_attempt_items C`; `answer jsonb not null CHECK (octet_length(answer::text) <= 262144)`; `revision integer default 0`; `client_at` (untrusted); `saved_at`; `final boolean default false`; `answer_digest text`; `transcript jsonb null` (machine transcript, with source and model); `transcript_note text null CHECK (char_length <= 6000)` (the candidate's correction; never replaces the transcript).

**skill_response_media**: primary key `(attempt_item_id -> skill_attempt_items C, take_no smallint CHECK (take_no between 1 and 3))`; `media_id -> media_objects C unique`; `started_at`; `ended_at`; `chosen boolean default false`; `status text CHECK in ('recording','complete','truncated','late','rejected')`.

**skill_integrity_events**: primary key `(attempt_id -> skill_attempts C, seq integer)`; `source text CHECK in ('client','server','staff')`; `type text CHECK in ('focus_lost','focus_returned','fullscreen_exit','paste','copy','display_extended','lease_changed','network_changed','device_changed','agent_changed','heartbeat_gap','fast_answer','similarity','answer_pattern','clock_skew','injection_suspected','self_identification','media_mismatch','media_late','sitting_joined','sitting_network','incident_time','resume_granted','evidence_viewed','support_viewed')`; `at default now()`; `client_at`; `batch_no integer`; `detail jsonb CHECK (octet_length(detail::text) <= 2048)`.

**skill_integrity_cases**: `attempt_id -> skill_attempts C`; `rule_version text`; `flags jsonb default '[]'`; `state text CHECK in ('open','cleared','noted','invalidated')`; `reviewer_id -> users SN`; `decided_at`; `reason_code text`; `note text CHECK (char_length <= 4000)`. `CHECK (state = 'open' OR decided_at IS NOT NULL)`. Unique `(attempt_id) WHERE state = 'open'`; index `(state, created_at)`.

**skill_incidents**: `assignment_id -> skill_assignments C null`; `sitting_id -> skill_sittings C null`; `attempt_id -> skill_attempts C null`; `CHECK (num_nonnulls(assignment_id, sitting_id, attempt_id) = 1)`; `kind text CHECK in ('venue_fault','platform_fault','resume_grant','fresh_attempt','media_late')`; `extra_seconds integer default 0 CHECK (extra_seconds between 0 and 1800)`; `reason_code text`; `granted_by SN`; `granted_at`.

**skill_interview_sessions**: `attempt_item_id uuid unique -> skill_attempt_items C`; `mode text CHECK in ('text','voice')`; `delivery text default 'model' CHECK in ('model','mixed','scripted')`; `state text CHECK in ('ready','awaiting_candidate','awaiting_ai','completed','expired')`; `plan jsonb not null` (ordered core prompt ids only); `core_index smallint`; `followups_used smallint`; `turn_count smallint`; `candidate_ms bigint default 0`; `turn_lease uuid`; `model`; `prompt_version`; `started_at`; `ended_at`; `updated_at`.

**skill_interview_turns**: `session_id -> skill_interview_sessions C`; `seq smallint`; `role text CHECK in ('interviewer','candidate','notice')`; `kind text CHECK in ('core','followup','answer','notice','close')`; `source text CHECK in ('verbatim','model','scripted','candidate')`; `text text CHECK (char_length <= 6000)`; `correction text null CHECK (char_length <= 6000)`; `media_id -> media_objects SN`; `client_key uuid`; `latency_ms integer`. Unique `(session_id, seq)`; unique `(session_id, client_key) WHERE client_key IS NOT NULL`.

### 3.8 Migration 0027_skill_grading

**skill_grading_tasks**: `attempt_item_id -> skill_attempt_items C null`; `anchor_id -> skill_anchors C null`; `CHECK (num_nonnulls(attempt_item_id, anchor_id) = 1)`; `question_version_id -> skill_question_versions R null`; `rubric_id -> skill_rubrics R` (the queue key); `pass text CHECK in ('first','second','ai','adjudication','audit','appeal','calibration','validity')`; `round smallint default 1`; `blind_ref uuid not null default gen_random_uuid() unique`; `pool text CHECK in ('platform','organization')`; `pool_org_id -> organizations SN`; `state text CHECK in ('queued','claimed','done','void')`; `grader_id -> users SN`; `claimed_at`; `lease_until`; `done_at`; `release_count smallint default 0`. Unique `(attempt_item_id, pass, round) WHERE attempt_item_id IS NOT NULL`; unique `(anchor_id, grader_id, pass, round) WHERE anchor_id IS NOT NULL` (one anchor can be issued to many graders); indexes `(state, pool, pool_org_id, rubric_id, created_at)`, `(grader_id, state)`. A task with `pool = 'organization'` and a NULL `pool_org_id` can never be claimed; it never falls into the platform queue.

**skill_grades**: `task_id uuid unique -> skill_grading_tasks C`; `source text CHECK in ('auto','human','ai')`; `rubric_version_id -> skill_rubric_versions R null`; `scores jsonb not null` (`[{criterionId, level, evidence:[{start,end}]}]`); `total numeric(7,3)`; `max numeric(7,3)`; `CHECK (total >= 0 AND total <= max)`; `feedback text CHECK (char_length <= 2000)` (may be released to the candidate); `private_note text CHECK (char_length <= 2000)`; `model`; `prompt_version`; `run_digest`; `seconds_spent integer`.

**skill_item_scores**: `attempt_item_id uuid primary key -> skill_attempt_items C`; `score numeric(7,3)`; `max numeric(7,3)`; `resolution text CHECK in ('auto','single','agreed','adjudicated','appeal','void','accept_all','rekey')`; `version smallint`; `finalized_at`.

**skill_results** (versioned): `attempt_id -> skill_attempts C`; `version smallint`; `state text CHECK in ('provisional','final','superseded','withdrawn')`; `cause text CHECK in ('initial','appeal','ruling','integrity')`; `score numeric(8,3)`; `max numeric(8,3)`; `percent numeric(5,2)`; `band text`; `passed boolean null`; `sections jsonb`; `topics jsonb`; `attempt_no smallint`; `conduct_label text`; `grading_method text`; `form_mode text CHECK in ('randomized','common','fixed')`; `equating_statement text`; `incident_seconds integer default 0`; `approval_mode text`; `integrity_status text CHECK in ('none','cleared','noted','under_review','invalidated')`; `issuer_kind text CHECK in ('platform','organization')`; `issuer_org_id -> organizations SN`; `issuer_name text not null`; `graded_by_label text`; `appeals_by_label text`; `methodology_version text`; `result_digest text`; `released_at`. Unique `(attempt_id, version)`; unique `(attempt_id) WHERE state = 'final'`.

**skill_credentials**: `result_id -> skill_results C`; `user_id -> users C`; `public_code text unique` (26 base32 characters, 130 bits); `visibility text default 'private' CHECK in ('private','link','profile')`; `disclose text default 'band' CHECK in ('band','score')`; `statement jsonb not null`; `signature text not null`; `key_id text not null`; `issued_at`; `revoked_at`; `revoke_reason`. Index `(user_id, visibility)`.

**skill_appeals**: `attempt_id -> skill_attempts C`; `user_id -> users C`; `ground text CHECK in ('score','integrity','technical','procedural')`; `item_ids jsonb default '[]'`; `statement text CHECK (char_length between 20 and 4000)`; `state text CHECK in ('open','in_review','upheld','partly_upheld','rejected','withdrawn')`; `level smallint default 1 CHECK (level between 1 and 2)`; `assigned_to SN`; `decided_by SN`; `decision_note text`; `decided_at`. Unique `(attempt_id, ground) WHERE state IN ('open','in_review')`; index `(state, created_at)`.

**skill_calibrations**: `subject text CHECK in ('human','ai')`; `grader_id -> users C null`; `rubric_id -> skill_rubrics C`; `anchor_set_id -> skill_anchor_sets SN`; `model`; `prompt_version`; `agreement jsonb` (n, exact, adjacent, weighted kappa, lower bound); `passed boolean`; `valid_until`. `CHECK ((subject = 'human') = (grader_id IS NOT NULL))`. Index `(rubric_id, subject, created_at)`.

**skill_sanctions**: `user_id -> users SN`; `email_digest text not null`; `phone_digest text null`; `reason_code text`; `case_ref uuid` (plain value); `starts_at`; `ends_at not null`; `lifted_at`. Indexes `(email_digest)`, `(phone_digest)`, `(user_id)`. Rows are deleted at `ends_at`.

**career_application_credentials**: primary key `(application_id -> career_applications C, credential_id -> skill_credentials C)`; `shared_at default now()`.

### 3.9 Migration 0028_skill_guards (custom SQL)

Purpose: a database insider or a service bug cannot quietly rewrite frozen content, evidence or scores, and account erasure still works.

**Mechanism, stated exactly.** Each guarded table gets row triggers of the form `BEFORE UPDATE OR DELETE ON t FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION skill_guard_<t>()`. The `WHEN` clause is evaluated before the function is entered, so the depth is 0 only for a statement issued directly. A foreign-key cascade or SET NULL runs inside PostgreSQL's own referential trigger, at depth 1 or more, and passes untouched. The check is never written as `pg_trigger_depth() > 0` inside a function body, where it is always true. The function allows a short list of column changes and raises otherwise.

| Table                                                       | Direct change allowed                                                                                                                   |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `skill_ledger`, `skill_ledger_checkpoints`                  | None. These triggers have no `WHEN` clause and also block `TRUNCATE`. The tables have no foreign keys, so no cascade ever reaches them. |
| `skill_question_versions`, `skill_rubric_versions`          | While `draft`: anything. Afterwards only `state` approved to retired                                                                    |
| `skill_question_keys`, `skill_question_media`               | Only while the parent version is `draft`                                                                                                |
| `skill_test_versions`                                       | While `draft` or `in_review`: anything. Afterwards only `status` published to retired with `retire_reason` and `updated_at`             |
| `skill_sections`, `skill_section_slots`, `skill_slot_items` | Only while the parent test version is `draft` or `in_review` (insert, update and delete)                                                |
| `skill_anchors`                                             | Only while the anchor set is `draft`                                                                                                    |
| `skill_content_access`                                      | Insert only                                                                                                                             |
| `skill_item_rulings`                                        | Until `applied`; then nothing                                                                                                           |
| `skill_attempt_draws`, `skill_attempt_item_keys`            | None                                                                                                                                    |
| `skill_attempt_items`                                       | `revealed_at` and `answer_deadline_at` from NULL; `ruling_id` and `ruling_effect`                                                       |
| `skill_responses`                                           | While `final` is false: anything. Afterwards only `transcript` and `transcript_note`                                                    |
| `skill_integrity_events`                                    | No update. Delete is allowed (the retention job reduces events to counts; the ledger keeps the batch digests)                           |
| `skill_interview_turns`                                     | Only `correction` from NULL                                                                                                             |
| `skill_grades`                                              | None                                                                                                                                    |
| `skill_item_scores`                                         | Only with `version = OLD.version + 1`                                                                                                   |
| `skill_results`                                             | `state` (provisional to final, final to superseded or withdrawn) and `released_at` from NULL                                            |
| `skill_credentials`                                         | `visibility`, `disclose`, `revoked_at`, `revoke_reason`                                                                                 |

No trigger rejects a delete on any table that cascades from `users`. DB-7's test proves this on PostgreSQL 17 by erasing a candidate, an author, a publisher and a grader who each have rows in every one of the 77 new tables, and by deleting an organisation. The same rules are also enforced in the services and by re-verifying `content_digest` at every attempt start, so the triggers are a second line, not the only one.

### 3.10 Existing tables and data

| Existing object                                              | Change                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assessment_attempts` and the five `/api/assessments` routes | None. They continue as "Practice checks". Their tests keep passing.                                                                                                                                                                                                                                                                                           |
| Legacy bank                                                  | `scripts/import-legacy-checks.mjs` (idempotent, operator-run, not a migration) imports the 48 questions into a free platform series; the two tests carry `legacy_assessment_id`. New results and legacy results are listed side by side, clearly labelled. With `SKILLS_LEGACY_START=off` the legacy start answers `410 ASSESSMENT_MOVED`; legacy reads stay. |
| `consent_records`                                            | No schema change. New purposes `recording`, `ai_evaluation`, `integrity_monitoring`, each versioned and withdrawable.                                                                                                                                                                                                                                         |
| `asset_cleanup_jobs`                                         | No schema change. Reused for every R2 object. `ASSET_CLEANUP_ALLOWED_NAMESPACES` gains the evidence namespace.                                                                                                                                                                                                                                                |
| `notifications`, `audit_logs`, `events`                      | No schema change.                                                                                                                                                                                                                                                                                                                                             |
| Account export                                               | Driven by `export-policy.ts`; the existing nested redaction is kept.                                                                                                                                                                                                                                                                                          |
| Account erase                                                | Queues media, writes `candidate_erased` on each attempt chain, carries an active sanction over as keyed digests. Each step is skipped when its module is not ready.                                                                                                                                                                                           |

---

## 4. Authoring

### 4.1 Structure

A **series** is the catalogue unit and what an entitlement names. It holds ordered **tests**. A test has **versions**. A version holds ordered **sections**; a section holds ordered **slots**. A slot names one fixed question, or draws `draw_count` questions from a **pool** for one topic, one difficulty stratum and one format. Questions live in a bank scoped to the platform or to one organisation and have versions; the confidential half of each version is sealed in `skill_question_keys`. Constructed-response questions belong to a **rubric family** (`skill_rubrics`); anchors and calibration attach to the family, not to each question.

Platform tests may use only platform questions, and an organisation's tests only that organisation's questions. This is checked on every save and again at publish; a cross-tenant reference is a 400, and a foreign id or slug is always 404.

### 4.2 One canonical content file and the six formats

`services/skills-content.ts` (zod v4, strict) defines every body, key, rubric, anchor, blueprint and settings shape. The authoring API, the attempt engine, graders and the web import its types, so the four can never drift.

| Format       | Candidate-visible `body`                                                                    | Sealed key                                                                                                                    | Scoring                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `mcq_single` | Prompt, 2 to 6 options, up to 2 images                                                      | One option key                                                                                                                | Automatic, all or nothing                                                                                                   |
| `mcq_multi`  | Prompt, 3 to 8 options, "select all" or "select N"                                          | Set of option keys; `exact` or `partial`                                                                                      | Automatic. `partial`: `max(0, (correct chosen - incorrect chosen) / correct total)` times points                            |
| `long_form`  | Prompt, word range, optional reference text, `allowPaste`                                   | Marker notes; rubric version                                                                                                  | Blind human rubric grading; optional AI extra read                                                                          |
| `coding`     | Prompt, language, starter code, up to 5 public samples, size limit                          | Reference notes; rubric version; reserved `execution` hook                                                                    | Blind human rubric grading. The in-browser runner is the candidate's own test bench and is labelled as not used for scoring |
| `recorded`   | Prompt, audio or video, `prepSeconds` 0 to 120, `answerSeconds` 30 to 300, `retakes` 0 to 2 | Marker notes; rubric version                                                                                                  | Blind human rubric grading; machine transcript as an aid                                                                    |
| `interview`  | Introduction and topic names, mode (`text`, `voice`, `candidate_choice`)                    | 2 to 8 core prompts, up to 2 scripted follow-ups each, follow-up guidance, rubric version, optional written fallback question | Human grading of the transcript on the rubric                                                                               |

Prompts are plain text with a small safe subset (paragraphs, emphasis, lists, inline and fenced code) rendered as React elements by a tokenizer. HTML is never accepted, stored or injected. Images are content media (`purpose = 'question'`) linked through `skill_question_media` and served to candidates only through attempt-scoped tickets.

### 4.3 Templates

A template is a JSON blueprint: sections with timing and navigation, slots with topic, difficulty and points, grading policy, integrity level, rubric skeletons with level descriptors, question stubs with writing hints, and the conduct notice.

- **Built-in templates** are reviewed, unit-tested code constants in `services/skills-templates/`. They need no migration to improve. The starter set of twelve: Screening (20 objective, 25 minutes); Campus placement aptitude; Frontend developer screen; Backend developer screen; Data structures and algorithms (coding); SQL and data; Technical writing (long-form); Communication (three recorded answers); Behavioural interview (AI interview, 15 minutes); DevOps fundamentals; Foundations (objective plus two long-form); Full check (all six formats).
- **Saved templates** (`skill_templates`): any author can save a test, a section, a rubric or a question as a template, scoped to the platform or to their organisation.
- "Create from template" produces a complete draft in one action: series, test, draft version, sections, slots, rubric families and placeholder questions.

### 4.4 Fast paths (target: template to reviewable draft in under ten minutes)

| Path                                 | How                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Block builder                        | Left: outline of sections and slots, drag to reorder. Centre: block editor. Right: live candidate preview built by the same projection the exam uses. Blocks: section, question (six formats), pool, instructions                                                                                                         |
| Keyboard                             | `Mod+Enter` add the next question of the same format; `Mod+D` duplicate; `Alt+Up/Down` move; `Mod+K` insert from the bank; `Mod+S` save. Drafts autosave after 3 seconds                                                                                                                                                  |
| Bulk import                          | Paste or upload CSV, JSON, or a plain text format (question, options A to H, `ANSWER: B,C`, optional `TOPIC:`, `DIFFICULTY:`). Parsed in the browser for preview, validated strictly on the server. 500 questions and 1 MiB per import; dry run with per-row errors; all-or-nothing commit; objective and long-form stubs |
| Variants                             | "Add variant" copies topic, difficulty, rubric family and settings into a new question so pools deepen quickly                                                                                                                                                                                                            |
| Reusable sections and rubric presets | Insert a saved section in one action. Presets: communication, problem solving, code quality, system design                                                                                                                                                                                                                |
| Shared anchors                       | Anchor sets belong to the rubric family. A family with one approved calibration set and one validity set covers every question variant that uses it, so the pool-depth rule does not multiply anchor writing or grader calibration                                                                                        |
| AI drafting (optional)               | "Draft 10 questions on a topic at difficulty 3", distractors, or rubric descriptors. Output is validated against the content schema and saved as drafts marked `ai_drafted`. A draft cannot be approved by the person who requested it and never enters a pool without human approval                                     |
| Meters and checklist                 | Per slot: eligible, calibrated and required counts. The publish checklist mirrors every server refusal code                                                                                                                                                                                                               |
| Review diff                          | The reviewer sees what changed between two versions, question by question                                                                                                                                                                                                                                                 |
| Preview                              | `preview-start` gives an author an unscored attempt (`context = 'preview'`) that can never produce a result                                                                                                                                                                                                               |

### 4.5 Pools, randomisation and form equivalence

**Calibration life cycle of a question.** `draft`, then `pretest` once a version is approved, then `active` once that version is calibrated. A version is calibrated when it has at least 50 exposures and its mean score sits inside its difficulty stratum's band, with a margin of 0.05:

| Difficulty      | 1            | 2            | 3            | 4            | 5            |
| --------------- | ------------ | ------------ | ------------ | ------------ | ------------ |
| Mean score band | 0.85 to 1.00 | 0.70 to 0.85 | 0.50 to 0.70 | 0.30 to 0.50 | 0.00 to 0.30 |

- **Pretest slots** (`scored = false`) carry new questions inside live tests and free practice series. They never count toward a score and candidates are not told which they are. At most one fifth of a section.
- **Scored pool slots** of a platform test draw only `active` questions. A slot fixes one topic and one difficulty stratum, so every candidate receives the same structure from items that have been shown to behave alike.
- A nightly job (`item-stats`, `form-check`) promotes pretest items, flags items that drift out of their band over the last 200 exposures, flags issued forms whose expected score deviates from the version median by more than 5 points, and flags items whose mean differs by more than 0.15 between organisations with at least 30 responses each (a bias screen). Flags go to publishers and integrity reviewers; nothing is rescored automatically.
- Every result from a randomised form carries the statement "Randomised form; questions matched by topic and measured difficulty; not statistically equated." The claim "equal by construction" is not made.
- Organisation-owned tests may pool uncalibrated questions; their results stay inside the organisation and say "Randomised form, uncalibrated questions".

**Three paper modes.**

| Mode         | What candidates get                                                                                                                                     | Where it is allowed                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `randomized` | A seeded draw per candidate from the frozen pools                                                                                                       | Pooled versions                                                                                                                                           |
| `common`     | One draw per assignment (seed sealed on the assignment); every candidate gets the same questions; question and option order still shuffle per candidate | An assignment or job invitation that is supervised or has a start window of 5 to 15 minutes. Long windows with an identical paper are refused at creation |
| `fixed`      | A version with no pools (`form_mode = 'fixed'`)                                                                                                         | Self-directed practice (`integrity_level = 'open'`), or through an assignment under the same rule as `common`                                             |

Launch sequence that follows from these rules: free practice and assigned common papers first (both carry pretest slots), then pooled premium tests once their pools are calibrated. Section 15 puts this to the owner.

**The draw** is specified in 5.2. Option order shuffles per candidate unless the question sets `fixedOrder`.

### 4.6 Review, publishing and versioning

1. **Questions and rubrics.** `draft` to `approved` by a different user who holds `skills.publisher` (organisation content: a second user with `skills.organization.author`). A one-author organisation, or the platform break-glass of 2.2, approves alone and the version is stored as `single_approver`. Approved versions are immutable; an edit creates the next version. Every author, reviewer, publisher and key read is recorded in `skill_content_access`.
2. **Test version.** The author moves `draft` to `in_review`. Publish runs a validator and refuses, each with its own code:

   | Code                   | Rule                                                                                           |
   | ---------------------- | ---------------------------------------------------------------------------------------------- |
   | `POOL_DEPTH`           | A pool slot has fewer than `draw_count * 3` eligible questions (a warning below `* 5`)         |
   | `ITEM_UNCALIBRATED`    | A scored pool slot of a platform test contains a question that is not `active`                 |
   | `ITEM_OUT_OF_BAND`     | A pooled question's measured mean is outside its stratum band                                  |
   | `RUBRIC_MISSING`       | A constructed-response question has no approved rubric version                                 |
   | `ANCHORS_MISSING`      | A rubric family used with human grading has no approved calibration and validity sets          |
   | `AI_GATE_MISSING`      | An AI extra read is enabled without a passing gate for the current model and prompt            |
   | `STANDARD_MISSING`     | A pass mark or bands exist without a recorded `standard_method` and a second person's sign-off |
   | `TIMING_INVALID`       | Section times do not fit the duration, or a recorded or interview item lacks limits            |
   | `REVEAL_LEVEL_INVALID` | Item-level review is requested on a version that is not fixed-form and self-directed           |
   | `CROSS_TENANT_CONTENT` | A question or rubric from another scope                                                        |
   | `SEPARATION_REQUIRED`  | The publisher authored or edited the version or one of its questions                           |

3. **Publish**, in one transaction with step-up: resolve each slot's eligible question versions into `skill_slot_items`; compute `content_digest` (SHA-256 of the canonical JSON of settings, sections, slots, and the sorted digests of every frozen question, key and rubric version); set `published`; retire the previous version (`retire_reason = 'superseded'`); append a `content` ledger entry.
4. Nothing in a published version can change (service checks plus the guards of 3.9). "New version" deep-copies into a draft.
5. Attempts and assignments pin `test_version_id`. A retired version accepts no new starts; attempts in progress finish on it. `content_digest` is recomputed and compared at every attempt start.

### 4.7 Defective and leaked questions (two separate procedures)

**Defective** (wrong key, ambiguous wording, broken media). A `skills.publisher` proposes an item ruling and a different publisher or an adjudicator approves it, both with step-up:

| Ruling       | Published rule                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| `void`       | The item's points leave everyone's maximum                                                                        |
| `accept_all` | Everyone who received the item gets full points                                                                   |
| `rekey`      | The corrected key is applied to everyone. Scores may go up or down; the rule is published on the methodology page |

Application is mechanical: `skill_attempt_items.ruling_effect` is set on every attempt that received the version, results are superseded by a new version with `cause = 'ruling'`, credentials are reissued, every affected candidate is notified, and the ruling is ledgered and listed in the test's public change log. Nobody chooses candidate by candidate.

**Leaked** (`retire_leaked`). The question's status becomes `retired_leaked`; it leaves future draws at once, and an integrity review opens for attempts that show signals on it. Nothing is rescored automatically, so honest candidates are not penalised.

**Pool depth after a retirement.** The frozen set is never edited. Retired questions are excluded at draw time and the exclusion is written into each attempt's draw record. If a slot's remaining eligible count falls below `draw_count * 3`, the version is retired for new starts (`retire_reason = 'pool_depth'`) and a new version must be published.

---

## 5. Attempt engine

### 5.1 Start

`POST /api/skills/action {action: 'start', testId, assignmentCandidateId?, sittingCode?, consents}` with CSRF, `requireAccount`, a rate limit and the bot check when configured (never the only control). One transaction, under `pg_advisory_xact_lock(hashtext('skill:' || userId || ':' || testId))`:

1. If an `in_progress` attempt exists, return it (resume, 5.4).
2. Load the published version; recompute and compare `content_digest`; require `guardsReady()`.
3. **Exclusions, in SQL.** Refuse when the caller appears in `skill_content_access` for any frozen question version, or graded or adjudicated any item of this test, or has an active row in `skill_sanctions`.
4. **Eligibility.** Series published; for self-source: free, or `skills.premium`; cooldown and `max_attempts`. For an assignment: verified organisation, state `open`, inside the window (and inside the start window when one is set), candidate row present, attempts left, seat available. For `supervised`: a current sitting code, an admit row for this candidate, and the network check of 5.9. A fixed-form version whose integrity level is not `open` can be started only through an assignment with `paper_mode = 'common'` (`409 FIXED_PAPER_ASSIGNMENT_ONLY` otherwise).
5. **Consent.** The version's conduct notice; `integrity_monitoring` for monitored and supervised; `recording` when the form can contain recorded or voice items; `ai_evaluation` when an AI read or a model-worded interview is used; and, for an assignment, the sharing notice for that assignment (a `data_sharing_grants` row with `scope = 'assignment'`). Each is stored with its version. A missing one answers `409 CONSENT_REQUIRED` with the list.
6. Consume the seat atomically (2.1). Draw the form (5.2). Insert the attempt with its denormalised issuer and context, the draw record, sections, items with frozen bodies, and sealed per-attempt keys for objective items.
7. `deadline_at = started_at + duration_seconds * time_multiplier`. With a start window the deadline is not cut by `closes_at`; otherwise it is capped at `closes_at` plus the multiplier allowance.
8. Append `attempt_started` to the attempt chain (content digest, seed commitment, form digest, draw digest, conduct label, paper mode).
9. Set the attempt credential cookie (5.3) and return the attempt view with `seedCommitment`, `formDigest` and `serverNow`. The web then does a full page navigation to the exam route.

### 5.2 Draw (reproducible from what is stored)

- The seed is 32 random bytes from the system generator, sealed under the key ring into `skill_attempt_draws.sealed_seed` with its `key_id`. `seed_commitment = SHA-256(seed)`. For a common paper the seed is the assignment's sealed seed, generated when the assignment opens.
- For each pool slot the eligible set is the frozen `skill_slot_items` minus (a) question versions this candidate received in earlier attempts on the test, when the pool stays at or above the minimum depth, and (b) questions retired since publish. The set's digest and both exclusion lists go into `draw_record`.
- A generator keyed by the seed (HMAC-SHA256 in counter mode) drives a Fisher-Yates shuffle of each eligible set sorted by id, then question order within the section, then option order. There is no exposure preference and no other input, so the stored record is everything the draw depended on.
- `form_digest` is the SHA-256 of the ordered question version ids and public option ids. `draw_digest` is the SHA-256 of `draw_record`.
- `scripts/verify-attempt-draw.mjs` unseals the seed, checks the commitment, re-runs the draw from the record and compares the form. It passes for attempts started before a later retirement, because the exclusions in force at start are in the record. Sealed seeds stay readable across secret rotations because the ring keeps retired keys by `key_id`.
- The candidate receives the seed commitment and form digest at start and again on the receipt, so the paper cannot be swapped afterwards without detection.

### 5.3 Attempt credential and the hot path

`readSession` takes a row lock and calls the identity provider on every request. It cannot carry autosave traffic, and a provider outage would end tests in progress. In-attempt calls therefore use a narrow credential.

- **Carrier.** A cookie `__Host-ps-at-<attemptId, 32 hex>`: HttpOnly, Secure, SameSite=Strict, Path=/, expiring 10 minutes after the deadline. Page script cannot read it, a reload keeps it, and each attempt has its own cookie, so two open attempts on different tests do not collide.
- **Value.** `v1.<attemptId>.<sessionRowId>.<clientLease>.<expiry>.<mac>`, with an HMAC-SHA256 from the key ring (purpose `attempt-credential`). It is issued only by `start` and `resume`, which run the full session, MFA and agreement checks.
- **Every hot-path call requires all of:** `requireCsrf`; a credential whose MAC and expiry verify; the session cookie; and one SQL join proving that the `sessions` row with that id has the handle digest of the presented session cookie and is unrevoked and unexpired, the user is active, the attempt belongs to that user, is `in_progress`, its `client_lease` equals the credential's lease, and `now() <= deadline_at + interval '5 seconds'`. No provider call, no row lock on `sessions`.
- A credential copied to another machine is useless without the bound session cookie. A request that fails any check writes nothing to any attempt; it is counted in metrics only.
- On each call the server compares keyed digests of the network prefix (/24 or /64) and the user agent with the values stored at start, and appends a server signal when either changes.
- Revoking a session or disabling a user stops the attempt on the next call. Stated trade-off: a ban applied only at the identity provider takes effect at the next `resume` or at submit; every ProofStack disable path already revokes sessions.
- **Rate class.** The global limiter runs before cookies and bodies are parsed. For paths under `/api/skills/attempts/<uuid>/` it reads that attempt's cookie from the raw header and verifies the MAC with no database work. A valid credential is charged to `api:attempt:<attemptId>` (180 per minute) and not to the shared address ceiling, so a campus lab behind one address is not throttled as a group. A missing or forged credential is charged to the address bucket as today.
- `MAINTENANCE_MODE` exempts `/skills/attempts/` paths, as it exempts `/auth/`, so maintenance cannot strand a candidate. New starts stay blocked.

### 5.4 Single active client and resume

- A reload or a second tab in the same browser still holds the cookie and simply reads state. It is not a hand-over and records nothing.
- `resume` (full session) from a browser without the cookie rotates `client_lease`, increments `lease_changes`, records `lease_changed` and sets a new cookie. The previous browser's next call fails with `409 ATTEMPT_MOVED` and its screen locks.
- After five lease changes `resume` is refused (`409 ATTEMPT_RESUME_LIMIT`). The clock keeps running. A platform integrity reviewer, or the invigilator of a supervised sitting, can grant one more (`resume_grants`, step-up, ledgered), and the incident path can add time.

### 5.5 Timers and one-shot reveal

- Only the server clock counts. Every response carries `serverNow`, `deadlineAt` and the open section's deadline.
- A timed section starts when opened (`open-section`). `forward_only` sections cannot be reopened.
- **Recorded and interview items are revealed one at a time.** `reveal-item` stamps `revealed_at` and returns the body. Preparation and answer windows are measured on the server from that stamp; `answer_deadline_at` is stored. The candidate cannot see the prompt early and cannot re-record after extra thinking time (section 7.2).
- The clock does not stop for disconnection. Incident time is the only remedy (5.10).
- A write after the deadline plus 5 seconds answers `409 ATTEMPT_CLOSED`.

### 5.6 Autosave

One batched call, `sync`, carries the next `seq`, changed answers `[{itemId, revision, answer}]`, queued integrity signals and part receipts. The client sends it 3 seconds after a change, at least every 15 seconds while there are unsent changes, and on `visibilitychange`.

- The server accepts `seq = sync_seq + 1` only and returns the current value on mismatch, so replays and reordering are harmless. Each answer is validated against the item's format and public option ids and upserted with `revision` as a compare-and-set.
- Body limit 256 kb on this path. Long-form answers up to 20,000 characters; coding answers up to 100,000 characters over at most 10 files.
- **Nothing persists in the browser.** Answers, recorded chunks and the credential are never written to `localStorage`, `sessionStorage` or IndexedDB, so nothing is left on a shared lab machine. Unsent work is held in memory; a `beforeunload` warning appears while changes are unsent. A test asserts the three stores stay empty during an attempt.

### 5.7 Answer confidentiality

- The attempt view is built by one projection from `skill_attempt_items.body` and `skill_responses`. Items of a section are returned only after it is opened; one-shot items only after reveal.
- `services/skills-keys.ts` is the only module that reads or unseals `skill_question_keys`, `skill_rubric_versions.sealed_criteria`, `skill_anchors` and `skill_attempt_item_keys`. An ESLint `no-restricted-imports` rule and a source scan allow it to be imported only by: `skills-question-*`, `skills-rubric-*`, `skills-anchor-*`, `skills-publish`, `skills-rulings`, `skills-rulings-apply`, `skills-attempt-start`, `skills-autograde`, `skills-grading-*`, `skills-calibration-*`, `skills-ai-reader` and `skills-interview-engine`.
- An author reads keys only for drafts they created or that were shared with them; a publisher only for content under review; a grader only the rubric of the task they hold. Every key read writes an audit row and a `skill_content_access` row. Key reads are limited to 30 per minute, with an alert on an unusual number of distinct versions in a day.
- A response scanner test walks every candidate, organisation and public endpoint and fails on any key, rubric-criteria, gold, seed, option-map or sealed field.
- Correct answers and marker notes are never returned, including after grading. Item-level correctness is never shown for pooled tests (`reveal_level = 'items'` exists only for fixed-form self-directed practice).
- Attempt responses are `private, no-store`. Only the anonymous catalogue and credential verification are cacheable.

### 5.8 Submission and finalisation

`submit`, or the deadline. One transaction with the attempt row locked:

1. Mark responses final; compute each `answer_digest` and a response-set digest.
2. Set `submitted`, `submitted_at`, `submit_reason`.
3. Call the finalisation seam: score objective items from the sealed per-attempt keys; create grading tasks under the version's policy; enqueue `grade-ai`, `transcribe`, `similarity` and, for common papers, `pattern-analysis`.
4. Append `attempt_submitted` with the response-set digest.
5. Return a **receipt**: attempt id, submission time, response-set digest, seed commitment, form digest and the ledger entry hash. A second submit returns the same receipt.

Expired attempts are finalised lazily by any read that touches them and by the `finalize` job. The candidate can open "Verify my attempt", which recomputes their attempt chain and reports whether it is intact.

### 5.9 Integrity signals and conduct levels

| Signal                                                                                          | Source          | Stored detail                                                                                                             |
| ----------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Focus lost and returned, fullscreen exit, extended display                                      | Client          | Duration only                                                                                                             |
| Paste, copy                                                                                     | Client          | Character count and item; never content                                                                                   |
| Lease changed                                                                                   | Server          | Count                                                                                                                     |
| Network, device or browser changed                                                              | Server          | A boolean against keyed digests; no raw address                                                                           |
| Heartbeat gap                                                                                   | Server          | Seconds without a sync beyond 45                                                                                          |
| Fast answer                                                                                     | Server          | Seconds against the item's median                                                                                         |
| Similarity                                                                                      | Server job      | Shingle overlap above 0.8 with another response to the same question version; stores the other response's blind reference |
| Answer pattern                                                                                  | Server job      | Identical wrong-answer patterns inside one common-paper cohort                                                            |
| Injection suspected, self-identification                                                        | Server          | The item only                                                                                                             |
| Media mismatch, media late                                                                      | Server          | Seconds                                                                                                                   |
| Sitting joined, sitting network, incident time, resume granted, evidence viewed, support viewed | Server or staff | Ids and seconds                                                                                                           |

- Events arrive with `sync` (at most 50 per call). **Caps are separate:** client events are stored up to 1,500 per attempt and only counted after that; server-observed and staff events have their own allowance of 500, so flooding focus events can never suppress server evidence.
- **Tamper evidence.** Each stored batch is hashed and the digest is appended to the attempt chain (`integrity_batch`). Rows are cascade-deletable for erasure and are reduced to counts 180 days after finalisation; the ledger keeps the digests.
- At submit a versioned rule set turns events into flags. A high flag, or a medium total above a threshold, opens an integrity case (6.7). **No signal changes a score or a state by itself.** No AI-text detector is used.

Conduct levels and their exact labels:

| Level        | Collected                                               | Label on every result                                                            |
| ------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `open`       | Nothing                                                 | "Self-directed. Not monitored. Identity not verified."                           |
| `monitored`  | All signals; fullscreen requested; single active client | "Monitored: integrity signals reviewed. Live capture and identity not verified." |
| `supervised` | Monitored, plus a sitting                               | "Supervised, attested by [organisation]. Not verified by ProofStack."            |

**Supervised sittings.** Staff with `skills.organization.assign` open a sitting. The room screen shows a six-digit code that rotates every 60 seconds (HMAC of the sealed secret and the time step). A relayed code is not enough: the invigilator must also **admit** each present candidate from the roster (`skill_sitting_admits`), and a start needs both. The server compares each start's network digest with the sitting's allow-list (`venue_network_refs`) when one is set, and otherwise with the majority of the sitting; an outlier gets a `sitting_network` signal. At the end the invigilator attests the headcount and incidents. The attestation digest and the invigilator's pseudonym go on the ledger. If the attested headcount does not match the attempts started, the sitting is `downgraded` and its attempts are labelled Monitored until an integrity reviewer decides.

Client signals can be suppressed by a determined cheat. The labels say what was and was not verified, and the strongest claims rest on server facts and supervision.

### 5.10 Accommodations and incident time

Both are partiality paths, so both have oversight.

- **Accommodations** (`skill_accommodations`): `time_multiplier` 1.00 to 2.00 and `alt_format` (a written answer in place of a recorded or voice answer). Requested by staff with `skills.organization.assign` before the attempt starts, always with step-up. On a platform-issued test a multiplier above 1.25 stays `pending` until a second staff member with the same capability, or a platform integrity reviewer, approves. For self-source platform attempts only a platform integrity reviewer grants. Every grant is ledgered. No reason is stored. Graders never see it; the candidate's report says "Approved adjusted timing".
- **Oversight.** The operations report shows, per organisation, the share of candidates with a multiplier above 1 and flags outliers to platform integrity reviewers.
- **Incident time** (`skill_incidents`): a venue fault applies to the **whole sitting**, never to selected students; the invigilator grants it with step-up, capped at 30 minutes per sitting. A platform fault is granted by a platform integrity reviewer for an attempt or an assignment. Organisation staff cannot add time to an individual. Every grant writes an `incident_time` event and a ledger entry, and the total appears on the result and the credential.
- The exam interface follows the site's accessibility conventions (keyboard operation, visible focus, reduced motion, 44 px targets, no colour-only state).

---

## 6. Grading and fairness

### 6.1 Policies

| `grading_policy` | Meaning                                                                                                                                                            | Label                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `auto`           | Objective items only                                                                                                                                               | "Scored automatically against the key"                                                       |
| `single`         | One blind human grader per constructed response, plus a 5 percent blind audit sample                                                                               | "Human-scored"                                                                               |
| `single_sampled` | One blind human grader plus a blind second read on 20 percent chosen at random                                                                                     | "Human-scored with quality sampling"                                                         |
| `double`         | Two independent blind human graders on every constructed response; adjudication on disagreement. Required for every platform test assigned by a college or company | "Double-blind human-scored"                                                                  |
| `ai_practice`    | AI scoring only, `open` practice series only                                                                                                                       | "AI-scored practice, not human-reviewed". Never a credential, never shown to an organisation |

Recorded and interview items on platform tests always use `double`. An AI extra read can be enabled per rubric family under any human policy; it never replaces a required human read.

### 6.2 Blind human grading

- Queues are per rubric family and question, not per candidate, so a grader does not build a picture of one person. `claim-next` lets the server pick; graders cannot browse or choose. A grader holds at most 10 claims; a lease lasts 30 minutes and renews with activity.
- **Conflict rules at claim time, in SQL.** Excluded: tasks whose candidate shares an active organisation or cohort with the grader; question versions the grader authored; items the grader graded in another pass; rubric families on which the grader has no current calibration. A grader can also `declare-conflict`, which releases the task.
- **The task view** holds only `blind_ref`, the prompt, the rubric and the response. `blind_ref` is random and never shown to the candidate; candidates only ever see attempt and item ids, so they cannot tell a colluding grader which response is theirs.
- **Self-identification.** Before a text response is queued it is screened for names, handles, emails and phone numbers; matches are masked in the grader view and a signal is raised. A grader who still recognises the candidate uses `identity-revealed`: the task is released and reassigned, and a signal is raised.
- **Recorded answers** cannot be visually blind. Controls: mandatory `double`, the conflict rules, structured rubrics, and audio-only review. With `audio_only_review` (the default unless the rubric needs video) the grader receives a ticket for the separate audio rendition and the transcript only, never for the video. This is enforced by which rendition the ticket names.
- Each grade records a level per criterion and at least one evidence span for any level above the lowest. Interviewer turns can never be cited as evidence.
- Grades are immutable. A correction is a new task in a new `round`. A grade entered in under 20 percent of the family's median time is kept, counts as a grader-quality signal, and triggers a second read.
- Platform tests are graded only by platform graders. Organisation tests are graded by that organisation's graders, and every report says so. An organisation can never grade, edit or influence a platform result.
- Every view of evidence by someone other than the candidate writes an `evidence_viewed` entry on the attempt chain.

### 6.3 Calibration and drift

- A grading task references either an attempt item or an anchor (`skill_grading_tasks.anchor_id`), so calibration and validity work have a real row shape and one anchor can be issued to many graders. Anchors may be text or recorded media (content media, with consent and de-identified, or staged by the team).
- **Gate.** Before a grader receives live tasks for a rubric family they score its calibration set (at least 10 anchors). They pass at 80 percent adjacent and 60 percent exact agreement on criterion levels. The outcome is a `skill_calibrations` row valid for 90 days.
- **Hidden validity anchors** are mixed into live queues at about one in fifteen tasks and look like live tasks. A grader whose rolling agreement on the last 20 falls below threshold is paused for that family and their recent grades are queued for a second read.
- A weekly report gives each grader's severity against co-graders, release counts and fast-grade counts. It goes to adjudicators and integrity reviewers, never to organisations.

### 6.4 AI reader (an extra read, never a mark)

- **Gate per rubric family, model and prompt version:** at least 30 anchors spanning every level; quadratic weighted kappa of at least 0.70 with a lower 95 percent bound of at least 0.60; adjacent agreement of at least 90 percent. A model or prompt change invalidates the pass. The gate is re-run monthly and whenever validity-anchor agreement drifts.
- **Input:** the prompt, the rubric and the response as delimited data (per-request random delimiter, delimiter stripped from the text, Unicode normalised). No identity, organisation or attempt data.
- **Output:** validated JSON with a level per criterion and evidence spans as character offsets. The server verifies every span lies inside the candidate's own text. Two runs with shuffled criterion order must agree within one level on every criterion. Anything else discards the read.
- **Use.** Under `double` the AI read only prioritises adjudication and audit sampling. Under `single` and `single_sampled`, agreement within tolerance changes nothing and disagreement creates a second blind human task. The AI score is never written to `skill_item_scores`, is never averaged into a score, and is never shown to a grader or adjudicator during live grading; it appears only in calibration reports.
- When the budget is exhausted or the provider fails, AI tasks are voided and human grading proceeds unchanged.

### 6.5 Resolution

Tolerance: one level on every criterion and 15 percent of the item maximum in total.

- Within tolerance: the mean of the two human totals (`agreed`).
- Outside: an `adjudication` task for a `skills.adjudicator` (organisation tests: a third organisation grader) who did not grade the item and sees both mark sheets without knowing whose is whose. The adjudicator's score is final (`adjudicated`).

When every scored item is resolved and no integrity case is open, the engine writes `skill_results` version 1 as `final`, with every label of 6.9, section and topic breakdowns and a `result_digest`, and appends a ledger entry.

### 6.6 Standards, statistics and reliability

- **Standard setting.** Every pass mark and band stores a method (`standard_method`), a note, who set it and a second person's sign-off; publish refuses without them.
- **Item statistics** are computed nightly into `skill_item_stats` (exposure, mean, item-rest discrimination, median time). Items with at least 50 exposures and negative discrimination or an extreme mean are flagged to publishers.
- **Reliability.** Once a test has 200 final results, the methodology page shows its grader agreement (exact and adjacent), the adjudication rate and a score precision figure.
- **Group differences** are screened as described in 4.5.

### 6.7 Integrity review

A flagged attempt gets a **human decision before any organisation-visible release**. A `skills.integrity` holder sees the flags, the event timeline, answer timing and, where consented, recorded evidence, with identity shown only when needed. Decisions: `cleared`, `noted` (a category on the report), `invalidated` (result marked invalid, credential revoked, sanction created). The candidate is told the decision and the category of evidence and can appeal. Until the decision the result shows "Under integrity review" to the candidate and nothing to an organisation beyond "in review".

### 6.8 Appeals

- One open appeal per ground per attempt, within 14 days of release: `score` (named items), `integrity`, `technical` (platform fault), and `procedural` (organisation-owned tests).
- **Score.** One fresh blind grader who never touched the item marks it without seeing earlier scores, then an adjudicator who never touched it decides with all mark sheets in front of them. The adjudicated outcome is final, whether higher or lower; the candidate is told this before submitting. A double-marked score is never replaced by one reader's mark.
- **Integrity and technical.** Level 1: a `skills.integrity` holder who did not make the original decision. Level 2: a different one; that decision is final. A technical appeal can grant a fresh attempt that does not consume one.
- **Organisation-owned tests.** Score appeals go to the organisation's graders under the same independence rules, and the result states "Appeals handled by [organisation]". The candidate can ask the platform for a procedural review, which checks that the process was followed and can require the organisation to re-run it.
- Nobody who graded the item or made the contested decision can be assigned (SQL). Decisions need step-up and a reason shown to the candidate. Targets: acknowledgement in 2 working days, decision in 10; overdue appeals appear on the operations report. While open, the result shows "Under appeal".
- Recordings, transcripts and events tied to an open appeal or case are exempt from retention and from consent-withdrawal deletion until it closes.

### 6.9 Score reports and credentials

**The candidate's report** shows: score, percentage, band, pass state, section and topic breakdown, criterion levels and released feedback, attempt number, conduct label, grading method, issuer, form mode with its equating statement, incident time added, approval mode when single-approver, integrity status with the recorded events and any decision, time used, test version, methodology version, the receipt and appeal controls.

**Credentials** are issued only when all hold: the test is platform-issued; the conduct level is monitored or supervised; the result is not AI-scored (objective key scoring and blind human grading both qualify); integrity status is none, cleared or noted. Organisation-authored or organisation-graded tests never produce a credential, a profile badge or a talent-directory match; their results are visible only inside the assigning organisation and labelled "Organisation-authored, not reviewed by ProofStack".

- The statement is compact JSON signed with Ed25519: credential id, series and test title, version and content digest, completion date, band (and score when the holder discloses it), **attempt number, conduct label, grading method, issuer, form mode, equating statement, incident seconds, approval mode**, integrity status, result digest and the ledger checkpoint reference. Public keys by `key_id` are served at `/.well-known/proofstack-keys.json`.
- Visibility is `private` (default), `link` or `profile`; disclosure is band only (default) or band and score. `/verify/<code>` shows the statement and a live status (valid, superseded, revoked, under appeal). The holder's name appears only when the credential is listed on their profile. Unknown codes get the same page shape and timing class.
- Nothing is published automatically. The attempt number is always shown, so a retake cannot pass as a first sitting.
- The talent filter and profile badges count only these credentials. Self-directed and legacy results appear as clearly labelled practice results.

### 6.10 What organisations see

| Data                                                    | College or company, platform test                                                                          | Organisation that owns the test                                    |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Status, score, band, pass, section and topic breakdown  | Yes, with consent                                                                                          | Yes                                                                |
| Conduct label, grading method, form mode, incident time | Yes                                                                                                        | Yes                                                                |
| Integrity                                               | A reviewed category only (clear, noted, invalidated, in review); never unreviewed flags, reasons or events | Counts by type after review                                        |
| Responses, recordings, transcripts                      | **Never, under any scope**                                                                                 | Yes, for their graders; identity joined only when grades are final |
| Other attempts or results of the candidate              | Only credentials the candidate attaches                                                                    | No                                                                 |
| Accommodation                                           | Only the staff who requested or approved it                                                                | Same                                                               |
| Grader identity, private notes, AI reads                | No                                                                                                         | No                                                                 |

Sharing is per candidate, per organisation and per assignment, shown at start, and its terms cannot be widened after the assignment opens. Revocation takes effect on the next read because every results query joins `data_sharing_grants ... WHERE revoked_at IS NULL`. Dashboards suppress any cell with fewer than 5 students.

### 6.11 Sanctions and erasure

An invalidation for cause creates a `skill_sanctions` row for 180 days: no premium or assigned starts. If the account is erased during a sanction, only keyed digests of the verified email and phone are kept, until the sanction ends (the existing deleted-account window is also 180 days). A new account whose verified email or phone matches is refused the same starts until then. Nothing else about the person survives.

### 6.12 Grading capacity

- **Targets.** First human read within 5 working days of an assignment closing; final results within 10.
- **Ceiling.** Creating or opening an assignment of a platform test with human-graded items is refused with `409 GRADING_CAPACITY` when open human tasks would exceed `SKILL_GRADING_MAX_OPEN_TASKS` (default 2,000). The owner raises it as graders are added; objective-only tests are unaffected. Mandatory double grading for cohorts of thousands is therefore switched on by staffing, not by hope.
- **Staffing guide.** One calibrated grader clears about 60 constructed responses a day. The operations report shows backlog by age, projected completion against the targets, and alerts at 50 and 100 percent of target.

---

## 7. Recorded answers

### 7.1 Capture

- `getUserMedia` then `MediaRecorder`, on the exam route only (13.4). Format by `MediaRecorder.isTypeSupported`, in order: `video/webm;codecs=vp9,opus`, `video/webm;codecs=vp8,opus`, `video/mp4`; audio: `audio/webm;codecs=opus`, `audio/mp4`.
- At most 1280x720 at 30 frames per second, video about 1.2 Mbit/s, audio 64 kbit/s mono. The device check measures the uplink and steps down to 600 kbit/s, or to audio-only when the question allows.
- A device check page records and plays back a 5-second sample that is never uploaded.
- Per item: reveal, preparation countdown, automatic start, hard stop at `answerSeconds`, review, then keep or retake when retakes remain. Tracks stop when the item closes; a visible indicator shows while recording.

### 7.2 The server bounds every take by its own clock

- `reveal-item` stamps `revealed_at`. `record-start` is accepted only between `revealed_at` and `revealed_at + prepSeconds + 15 seconds`; it stamps `skill_response_media.started_at` and fixes `answer_deadline_at = started_at + answerSeconds`.
- Parts upload **while recording**, and every part receipt carries the Worker's own time, so arrival times corroborate the window. A receipt dated after `answer_deadline_at + 120 seconds` (the upload allowance) is refused. A second receipt for a part number already recorded is refused and raises `media_mismatch`; completion uses exactly the receipted parts, so a part overwritten after its receipt makes completion fail instead of substituting content.
- `ended_at` is the time of the last accepted receipt. The processor then checks the measured duration against the window with 10 seconds of tolerance.
- **Late, missing or failed media is never a silent zero.** The take is marked `late`, `truncated` or `rejected`, a `media_late` incident opens, and a platform integrity reviewer decides: accept what arrived with a note, or grant a retake.
- Takes beyond the question's limit are refused. A replaced take is queued for deletion and counted on the ledger.
- Every report states: "Recorded on the candidate's own device. Live capture is not verified; a prepared file or a virtual camera cannot be ruled out."

### 7.3 Upload path

Bytes never pass through the API or the web Worker. A **media Worker** (`artifacts/media`, own origin, separate bindings for the evidence and social buckets) handles them. It has no database and no session knowledge.

1. `record-start` (hot path): the API creates `media_objects` (`storage = 'r2_evidence'`, `reserved`) and the take row, and returns the media id and a create ticket.
2. `POST <MEDIA_ORIGIN>/u/<mediaId>/create`: the Worker creates the multipart upload itself and returns an opaque, signed upload reference. The client forwards it to the API, which stores it sealed in `media_uploads.encrypted_payload` so a reload can continue.
3. For each 5 MiB part the client asks the API for a part ticket (`record-ticket`) and sends `PUT <MEDIA_ORIGIN>/u/<mediaId>/part/<n>` with the ticket and upload reference in headers, retrying a failed part up to 5 times. The Worker refuses a `Content-Length` above the ticket's maximum before reading, streams the body into the part while hashing it, and returns a signed receipt `{mediaId, n, etag, sha256, bytes, at}`. The client forwards each receipt with its next `sync` (`record-part`).
4. `POST <MEDIA_ORIGIN>/u/<mediaId>/complete` with the receipts the API holds: the Worker verifies its own receipts, completes the upload and returns a signed completion receipt with the manifest digest (SHA-256 over the ordered part digests).
5. `record-complete` (hot path): the API verifies the receipt, **performs its own HEAD** on the object with credentials scoped to the evidence bucket, compares size and tag, stores the manifest digest in `media_objects.sha256`, sets `processing`, enqueues `media-validate` and appends `recording_stored` with the digest to the attempt chain.
6. After a reload, `record-status` returns the stored upload reference and receipts. A recording interrupted by a crash is completed with the parts received and marked `truncated`; the retake rule or the incident path then applies. Recorded bytes are held in memory only (at most two parts).

Audio answers and voice turns are small, so they use one `PUT <MEDIA_ORIGIN>/u/<mediaId>/object` with a single ticket and the same receipt and HEAD.

**Tickets** are HMAC values minted by the API with `MEDIA_TICKET_SECRET`: single purpose (`create`, `part`, `put`, `complete`, `play`), bound to the media id, the owner pseudonym, one part number, an exact maximum byte count and an expiry of at most 10 minutes that never passes `answer_deadline_at + 120 seconds`. They travel in a header, never in a URL. CORS on the Worker allows only the site origin, without credentials.

### 7.4 Storage layout

| Bucket                                                                                       | Holds                                            | Credentials                                                                                                             |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Evidence (default `proofstack-evidence`, `EVIDENCE_OBJECT_DIR=/proofstack-evidence/private`) | Answer recordings, voice turns, their renditions | Its own R2 token, used by the API for HEAD and cleanup and by the media-processor; bound to the media Worker separately |
| Existing bucket                                                                              | Images (existing key shape), Git bundles, demos  | Unchanged                                                                                                               |
| Ledger anchors                                                                               | Daily checkpoints, object-locked                 | Its own token                                                                                                           |

Every object is `<namespace>/ready/<uuid>`, one object per original and one per rendition. The demos Worker gains nothing.

### 7.5 Limits

| Limit                   | Value                                                               |
| ----------------------- | ------------------------------------------------------------------- |
| Answer length           | 30 to 300 seconds, per question                                     |
| Bytes per take          | 150 MiB video, 8 MiB audio                                          |
| Takes per item          | 1 to 3                                                              |
| Recorded items per test | 10                                                                  |
| Part ticket lifetime    | At most 10 minutes, never past the answer deadline plus 120 seconds |
| Abandoned uploads       | Aborted and queued for deletion after 2 hours                       |

### 7.6 Validation and renditions (isolated)

Nothing that parses candidate media runs on the API. The `media-validate` job runs in the **media-processor** image (`artifacts/media-processor`: the work-worker plus pinned `ffprobe`, `ffmpeg` and an antivirus daemon). The outer process fetches the object with the evidence credentials; every tool then runs through a launcher with no network namespace, an empty environment, a non-root user, a read-only input, a tmpfs work directory and limits on CPU time, memory and file size. A start-up self-test proves that an outbound connection fails inside the sandbox; if it does not, the worker refuses to process.

- **Checks:** magic bytes and container header against the declared type; exactly one optional video stream and at most one audio stream in the allowed codecs (VP8, VP9, H.264, Opus, AAC); no attachments, subtitles or data streams; bytes within the cap; duration within the window; antivirus scan.
- **Renditions**, by remux only (stream copy, no re-encode): `playback` (seekable: WebM with cues, or MP4 with the index first) and `audio` (the audio stream alone). The original is never modified; its digest is the evidence on the ledger. Graders use the renditions, so raw recorder output that lacks a duration or seek index is not a problem, and no "use a supported browser" instruction is needed.
- **A recording has no playback ticket until `scan = 'clean'` and `state = 'ready'`.** When the processor is not deployed (`MEDIA_PROCESSOR_ENABLED` unset or no fresh heartbeat), recordings stay unplayable, and tests whose form can contain recorded items cannot be started.
- Failure sets `failed`, marks the take `rejected` and opens an incident.

### 7.7 Playback

- `POST /api/media/action {action: 'playback-ticket', mediaId, rendition, context}` with a full session. Authority is computed in SQL from the referencing row: the candidate (their own recording); a grader holding a claimed task for that item; the adjudicator or appeal grader assigned to it; the integrity reviewer of its open case; a grader of the organisation that owns the test. Everything else is 404. Organisation result viewers never qualify for a platform test.
- With audio-only review the grader's ticket names the `audio` rendition; a request for the video is refused.
- A ticket names one object, lasts at most 5 minutes and is bound to the first browser that presents it (a Durable Object records a nonce and the Worker sets a `__Host-` cookie on the media origin; a second browser is refused). Each mint writes an audit row with the task or case id and, for anyone but the candidate, an `evidence_viewed` ledger entry.
- `GET <MEDIA_ORIGIN>/o/<mediaId>` supports `Range` and returns 206 with the ticket's content type, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`.
- There is no download control and graders are never offered the original. Screen capture cannot be prevented; the grader agreement and the audit trail are the control.

### 7.8 Transcripts

A `transcribe` job sends the audio rendition to the speech-to-text model under the `ai_evaluation` consent. The result is stored in `skill_responses.transcript` marked machine-generated, shown to graders as an aid and to the candidate in their report. The candidate can add one note (`transcript_note`) that sits beside the transcript; it never replaces it, and the recording remains the evidence.

### 7.9 Deleting media (the existing outbox, with the missing step added)

The existing worker's last statement deletes only from `community_assets`, so a media row would stay in `deleting` forever. The change:

- Deleting a media object or rendition sets its state to `deleting` and inserts an `asset_cleanup_jobs` row (its id as `asset_id`, the captured bucket, namespace and object name) in the same transaction.
- After the object is gone, the worker's final transaction also runs, when the media module is ready: `DELETE FROM media_objects WHERE id = $1 AND state = 'deleting' AND object_path = $2` and the same for `media_renditions`. The `community_assets` statement is unchanged.
- Quota is a sum over the owner's rows, so the delete releases it.
- The cleanup storage boundary picks credentials by bucket, and `ASSET_CLEANUP_ALLOWED_NAMESPACES` gains the evidence namespace.
- Hosted video is deleted through `media_cleanup_jobs` by the `provider-delete` handler.
- Tests cover retention deletion and account erasure, not only erasure.

### 7.10 Retention and erasure

| Data                                             | Rule                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recordings, voice clips, renditions, transcripts | Deleted 180 days after the result is final, or 30 days after the last appeal or integrity case closes, whichever is later. Scores, criterion levels and the ledger digests remain                                                                                                           |
| Replaced takes, rejected or abandoned uploads    | 24 hours                                                                                                                                                                                                                                                                                    |
| Integrity events                                 | Reduced to counts 180 days after finalisation                                                                                                                                                                                                                                               |
| Account erasure                                  | Every media object and provider asset is queued before the cascade; the ledger keeps digests only                                                                                                                                                                                           |
| Withdrawal of `recording` consent                | Stops new recording. Existing recordings of a final result are deleted within 30 days, **but only once no appeal or integrity case is open**; the result is then annotated "evidence deleted at the holder's request", which closes score appeals for those items. The consent text says so |

Each area contributes a step under `services/retention/`; one `retention` job, scheduled from the operations workflow, runs them daily.

---

## 8. Live AI interview

### 8.1 Why it is structured

A free conversation cannot be compared across candidates. Each interview question fixes a plan: 2 to 8 **core prompts**, delivered **verbatim** to every candidate in a seeded order, each with a fixed budget of 0 to 2 follow-ups. The model's only freedom is the wording of a follow-up. The server owns the state machine and decides progression and ending from its own counters, never from anything the model reports. The interviewer never scores and never holds the rubric.

### 8.2 Provider layer

`services/ai/` builds on the existing OpenAI-compatible client, still imported dynamically so the process starts without keys.

- `provider.ts`: typed tasks `chatJson`, `transcribe`, `speak`, `moderate`. Every call has an explicit timeout (25 seconds interactive, 45 seconds for jobs), no retries, and JSON output validated by a strict schema.
- Models come from the environment per task (`AI_MODEL_GRADING`, `AI_MODEL_INTERVIEW`, `AI_MODEL_TRANSCRIBE`, `AI_MODEL_SPEECH`, `AI_MODEL_DRAFTING`, `AI_MODEL_MODERATION`). A task with no model is off. No model name is hard-coded.
- `prompts.ts`: a registry of versioned prompts loaded from `services/ai/prompts/`. The version is stored with every usage row, grade and session.
- `budget.ts`: reserve, then settle, against `ai_budgets` in micro-USD.
- `sanitize.ts`: per-request random delimiter, delimiter stripping, Unicode normalisation, control-character removal.

### 8.3 Session and turns

`POST /api/skills/attempts/:attemptId/interview` on the hot path.

- `start`: after `reveal-item`, resolve the plan order from the attempt seed, reserve the session budget (8.7), store the first interviewer turn (core prompt 1, verbatim, no model call) and return it.
- `turn {clientKey, text}` or `{clientKey, mediaId}`:
  1. Transaction A: lock the session; require `awaiting_candidate`; store the candidate turn (idempotent on `clientKey`); add the elapsed time to `candidate_ms`; set `awaiting_ai` with a new `turn_lease`; commit.
  2. With no transaction and no pooled connection held: if follow-ups remain for this core prompt, ask the model for one follow-up or "advance"; otherwise take the next core prompt verbatim with no model call.
  3. Transaction B, conditioned on `turn_lease`: store the interviewer turn, update counters, set `awaiting_candidate` or `completed`.
- `end`: the candidate may finish early; unanswered core prompts score at the lowest level.

### 8.4 Limits

| Limit                   | Value                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------- |
| Candidate message       | 4,000 characters, or 120 seconds of audio                                               |
| Turns                   | `cores * (1 + followups)`, at most 24                                                   |
| Candidate thinking time | Per question, default 20 minutes, counted only while the server waits for the candidate |
| Wall clock              | Bounded by the section and attempt deadlines                                            |
| Interviewer reply       | 600 characters; URLs and code blocks stripped                                           |

### 8.5 Prompt and injection defences

- The interviewer model receives the public introduction, the current core prompt, the follow-up guidance and the conversation so far. It never receives the rubric, level descriptors, scores, other core prompts or anyone else's data, so a complete jailbreak leaks at most the current prompt.
- No tools, no browsing. The system prompt states that candidate text is untrusted data. Output must be `{kind: 'followup' | 'advance', say}`; anything invalid, over-long or matching disallowed patterns is replaced by the scripted follow-up or a neutral line and counted.
- The model cannot skip a core prompt, add turns or end the interview, whatever it returns.
- Candidate text that addresses the model or the grader raises `injection_suspected` for the human reviewer. It is never an automatic penalty.
- No name, handle, organisation or other identity reaches any model.
- Scoring is separate (8.6). Interviewer turns can never be cited as scoring evidence.

### 8.6 Transcript and scoring

- Turns are rows. On completion the transcript digest is appended to the attempt chain.
- Human graders score the transcript blind on the rubric, exactly as for long-form, under `double` for platform tests. An AI extra read follows 6.4.
- Voice and text interviews are scored on the same transcript rubric. The result records `mode` (text or voice) and `delivery` (model, mixed or scripted).

### 8.7 Budgets (no one gains from exhausting them)

- At `start` the session reserves its worst case up front: every turn at maximum input and output length at the configured rates. Sending maximum-length turns therefore cannot exhaust it mid-interview.
- Scopes: `org:<id>:<yyyy-mm>` (from the entitlement's limits) and `global:<yyyy-mm-dd>` (owner-set). Reservation is one conditional upsert; no row returned means refusal. Provider-side spend limits are the outer guard.
- A refused reservation does not cancel or shorten the interview. It runs in scripted delivery (8.8) and is scored normally.

### 8.8 Failure and resume: the interview always completes

- **Scripted fallback.** Every core prompt may carry up to two author-written scripted follow-ups. On a provider error, a timeout, invalid output or a budget refusal, the server uses the scripted follow-up, or moves to the next core prompt when none exists. With no provider at all, the whole interview runs from verbatim core prompts and scripted follow-ups (`delivery = 'scripted'`).
- **No item is ever marked "not delivered" and nothing is removed from a candidate's maximum.** Waiting on the AI is not charged to the candidate.
- Voice failure (speech-to-text or speech synthesis) switches the session to text; the rubric is the same.
- The author-defined written fallback question is used only under an approved `alt_format` accommodation; it is scored on the same rubric family and the candidate's report says so.
- Reload or reconnect: the attempt view returns the session and turns. A resent turn with the same `clientKey` is a no-op. A crash between the two transactions leaves `awaiting_ai`; the next call after 40 seconds re-runs step 2 once under the lease.

### 8.9 Voice option

Push-to-talk, gated by `SKILLS_VOICE_ENABLED` and the two speech models. The candidate records each answer as a clip through the media path (purpose `interview`). The server transcribes it, stores the **machine transcript** as the turn text and runs the same state machine; the reply is text plus optional synthesised audio. The candidate may attach one correction note per turn (`skill_interview_turns.correction`). It is stored beside the original transcript and the audio and never replaces them; scoring uses the machine transcript, and the grader sees the note and can listen to the clip.

---

## 9. Colleges

### 9.1 Organisation type and verification

- An owner requests `kind = 'college'` or `'company'` with legal name and website domain (step-up). State becomes `pending`.
- A platform admin or super admin decides after domain proof and one official document checked offline. The decision is audited and ledgered on the `access` chain. Both existing organisation-creation paths are untouched.
- A verified organisation shows "Verified college" or "Verified company". `suspended` removes every capability in sections 9 and 10 at once.

### 9.2 Cohorts and enrolment

- A cohort has a name, programme, term and dates. Limits: 200 active cohorts per organisation, 5,000 enrolments per cohort. Staff need `education.cohort.manage` and the `education.cohorts` entitlement.
- **Roster import.** One request of up to 5,000 rows (`email, roll number, name`), one step-up, with a dry run that reports per-row problems. The server de-duplicates by email digest, stores each address sealed, creates a 256-bit single-use token (stored hashed, 30-day expiry) and queues a mail job. Limits: 5,000 invites per organisation per day, 20,000 pending.
- **Every invite states that accounts are for people aged 18 or over.**
- **Join code.** Optional per cohort: 12 characters (60 bits), stored hashed, rotatable, with an optional email-domain restriction and approval on by default. Attempts are limited to 5 per 10 minutes per account and 20 per network.
- **Acceptance.** The student signs in or registers, sees exactly what the college will see, and accepts. Redemption requires the account's **verified email to equal the invited address**, once, before expiry, so a forwarded link is useless. Acceptance sets `user_id`, activates the enrolment, writes a `data_sharing_grants` row with `scope = 'enrollment'` (enrolment, roll number and assignment status only) and clears the sealed address and the token.
- The response to staff is the same whether or not an address has an account.
- Students see only their own enrolment and can leave at any time; leaving revokes the enrolment grant. Students are never organisation members.

### 9.3 Assignments

- Staff with `skills.organization.assign` choose a published version (a platform test covered by seats, or the organisation's own test), a cohort, a window, attempts allowed (1 to 5), the paper mode, whether supervision is required and the release rule.
- Opening needs step-up and creates a candidate row for each active enrolment; later enrolments join while it is open. After opening, the version, paper mode, sharing terms and attempt limit cannot be reduced. The close time can be extended.
- A common paper needs supervision or a start window of 5 to 15 minutes (4.5). A platform test with human-graded items is subject to the grading ceiling (6.12).
- Managers cannot change duration, questions or grading policy.
- **Consent is per assignment.** The student sees the sharing notice on the start screen and the grant is written at start (`scope = 'assignment'`). Declining is allowed and visible to staff as "declined".
- Notices: on assignment, 48 hours and 2 hours before close, and on release; in-app and by mail when the preference allows.

### 9.4 Dashboards

- Progress: invited, accepted, started, completed, expired.
- Results, for students with an active assignment grant: score, band, section and topic breakdown, conduct label, grading method, the reviewed integrity category, attempts used.
- Aggregates: distribution, topic means, completion over time, with cells under 5 suppressed.
- Export of the same columns needs step-up, is rate-limited and writes an audit row with the row count.
- No dashboard ever contains a response, recording or transcript of a platform test.

### 9.5 Consent

Sharing is per student, per organisation and per object. Revocation takes effect on the next read. Privacy settings list every organisation with access, the scope and the date. The notice says that copies a college has already exported are outside the platform's control, and that the college may treat a revoked result as not submitted for its own purposes.

---

## 10. Recruiters and companies

### 10.1 Attaching a check to a job

`career_job_checks` holds one row per job, managed by the job's organisation managers (existing `authorizeOrg(..., 'manage')`, with step-up). New code lives in `career-checks-*` files; the existing careers services are not edited except the talent query.

- **Hosted**: a published platform test (verified company with seats) or the company's own test (verified company with `skills.org_authoring`). The version is recorded when the check is attached; editing the job later never changes what invited candidates receive.
- **External**: an HTTPS link validated by the existing `linkSchema` plus: no credentials, no IP literal, no `localhost` or private suffix, at most 2,000 characters. The server never fetches it. It opens behind an interstitial that shows the destination host in plain form and says "This test is run by [company] on another site. ProofStack does not run or verify it." It opens in a new tab with `rel="noopener noreferrer nofollow"` and is never framed. Links can be reported.
- **An unverified organisation may attach external links only.**

### 10.2 Invitations

- From an application, a manager chooses "Invite to skill check". This creates or reuses a `skill_assignments` row with `context = 'job'` and a candidate row with `application_id`. **Invitations are never created automatically when someone applies**, so fake applicants cannot drain seats or AI budget.
- Limits: the applicant must have a verified email; 500 invitations per job (`invite_cap`); 2,000 per organisation per day.
- The applicant sees the invitation in the application thread with what the test contains, its duration and formats, and what the company will see. Consent is given at start. Declining is recorded. The seven application statuses do not change; check status is its own field.

### 10.3 Viewing results

- After release and with consent, the application thread shows the result summary of 6.10.
- An applicant may attach up to three of their platform credentials to an application. This writes `career_application_credentials` and a `data_sharing_grants` row with `scope = 'credential'`; the employer then sees the same verified statement as the public page, even for a private credential.
- For the company's own tests, its graders work blind and names are joined only when grades are final. Those results never leave the company's workspace and state who authored and who graded.
- Withdrawing an application or revoking consent removes access on the next read.

### 10.4 Talent directory

Candidate cards and the filter "has a verified result in [skill]" use only platform-issued credentials that are not AI-scored and have `visibility = 'profile'`, loaded in one batched query.

### 10.5 Hiring-team notices

New applications and check completions notify the organisation's current managers in-app and by mail. This closes the existing gap where only the applicant is notified.

---

## 11. Social

### 11.1 Posts

`community_posts` stays the base row. New behaviour comes from side tables and a new reader, so the existing community endpoints and their tests are untouched.

| Feature       | Model                                                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text          | Unchanged: 5,000 characters                                                                                                                                |
| Images        | Up to 4 per post (`community_post_media`); PNG, JPEG, WebP up to 8 MiB, re-encoded by the existing boundary, with width, height and thumbhash stored       |
| Native video  | 1 per post, on the hosted video provider                                                                                                                   |
| Shorts        | A video post whose measured duration is at most 60 seconds and whose height is at least its width. The server sets `kind = 'short'` from provider metadata |
| Topics        | `#tag` in the body plus up to 5 chosen topics, normalised into `community_topics`; topic pages; a 48-hour trending list; blocked topics give 404           |
| Repost        | A `community_reposts` row; idempotent toggle                                                                                                               |
| Quote         | A new post with `quote_post_id`; the quoted card disappears when the original is no longer readable                                                        |
| Daily routine | `kind = 'routine'` with `community_routines`: date, up to 12 checklist items, minutes; one per person per day; streak computed on read                     |
| Block         | `community_blocks`; hidden from each other; no comments, quotes or reposts                                                                                 |
| Collaboration | A post may link one of the author's own public projects (the server now refuses a project the author neither owns nor contributes to)                      |

**One visibility rule for the new reader:** the existing `postReadWhere`; the author's profile visibility for signed-out viewers (this closes the known members-only leak); no active `content_restrictions` row; every attached media object `ready` and `clear`; no block either way. The author always sees their own post.

Feeds use keyset pagination on `(created_at, id)` with an opaque cursor: Discover, Following (posts and reposts by followed people), Topic, Shorts, Routines and a profile Media grid. Ordering is chronological and documented as such.

### 11.2 Any-aspect-ratio media

- Every media object stores `width` and `height`. Layout boxes reserve space with CSS `aspect-ratio`, so nothing shifts while loading. `layoutMedia(items, width)` is a pure, unit-tested function.
- **One item in a post:** its true ratio, clamped between 9:16 and 21:9 and to 80 percent of the viewport height. Outside the clamp it is contained over a blurred copy of itself, never cropped.
- **Two to four images:** a mosaic of thumbnails; opening one shows the whole image in a lightbox with arrow-key navigation, alt text and a focus trap.
- **Grids** (profile Media tab, topic pages): justified rows filled to the container width at a target height (220 px desktop, 140 px phone), every tile at its true ratio. Portrait Shorts, square images and 21:9 videos sit side by side. Video tiles show a duration badge.
- **Shorts player:** a full-height vertical scroll-snap list, one item per screen, a 9:16 stage with other ratios contained over a blurred backdrop. Muted autoplay when at least 60 percent visible, pause otherwise, preload of the next item only, keyboard and swipe navigation, reduced-motion support, and visible like, comment, repost, share and report controls.
- **Long video:** a true-ratio player with a seek bar, captions when available and quality selection.

### 11.3 Upload paths

- **Images:** `media reserve`, then a PUT of the bytes through the API (the existing pattern), re-encode, store, record dimensions. A fully re-encoded image is marked `scan = 'clean'`; a hosted video is marked clean when the provider reports it ready. Served by `GET /api/media/:id`, publicly cacheable for 5 minutes only when the SQL check proves the referencing post is public.
- **Video:** `media reserve {kind: 'video'}` returns a one-time direct upload address from the provider, created by the API with a maximum duration and size. The browser uploads straight to the provider with a resumable protocol. A signed webhook, or the reconcile job, reports readiness with duration and dimensions.
- On phones `<input type="file" accept="video/*" capture>` opens the native camera. This needs no camera permission for the site, so `Permissions-Policy` stays closed on social pages.

### 11.4 Video provider

| Option                                                               | Strengths                                                                                                                                                                                                       | Weaknesses                                                                                                |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Managed video platform at the existing edge vendor (recommended)** | Transcoding, adaptive streaming, posters, duration and size limits enforced at upload, signed webhooks, signed playback, no new processor category. **No untrusted video is ever parsed on ProofStack servers** | Per-minute pricing; a second deletion path                                                                |
| Own bucket plus own transcoding                                      | Full control                                                                                                                                                                                                    | A transcoding fleet running a media parser on hostile input; packaging and range delivery become our code |
| Another managed platform                                             | Strong tooling                                                                                                                                                                                                  | A new sub-processor and data-transfer disclosure                                                          |

All provider calls live in one file behind a `MediaProvider` interface (`reserve`, `status`, `playbackToken`, `disable`, `remove`, `verifyWebhook`).

- **Signed playback is required for every hosted video.** Tokens last 1 hour for public posts and 5 minutes for members-only content, and none is minted for held, removed or blocked media. On a block or removal the provider asset is disabled.
- Limits are configuration: Shorts 60 seconds and 50 MB; long video 10 minutes and 300 MB; 10 uploads and 60 minutes per day; 5 GB per person; a verified email is required.
- Playback uses the adaptive manifest in a plain `<video>` element, natively where supported and through a dynamically imported player library elsewhere, so the Worker bundle does not grow.
- With no provider keys, video posting is off and link embeds keep working.

### 11.5 Moderation and reporting (fails closed)

- **Report** on every post, comment, media item, profile, job and job check. One open report per reporter per target; 20 reports per day.
- **Queue** for moderators and admins, ordered by `due_at`: 24 hours for `child_safety` and `sexual`, 36 hours for `illegal`, 72 hours otherwise, following the intermediary duties in `docs/legal-compliance.md`.
- **Actions** are reversible restriction rows: hide, remove (queues media deletion after the retention period and disables the provider asset), lift, dismiss, suspend posting. The post row is never deleted and re-inserted, so comments, reactions and bookmarks survive a restore. Each action writes `content_restrictions`, an audit row and a `moderation` ledger entry, and notifies the author with the reason and how to contest it.
- **Every existing read path is covered.** `postReadWhere` itself gains the restriction predicate when the social module is ready, so notifications, the event feed, reactions, comments and search all hide restricted content. With the module absent the fragment is byte-identical to today's.
- **Video is never shown to others on a timer.** It becomes visible only when it is `ready` and `moderation = 'clear'`. `clear` is set by the automated screen (text, image and provider poster frames through the moderation model) when one is configured, and otherwise only by a moderator. The first three videos from an account under 7 days old are always held for a person. An automated hit sets `held`; nothing is removed automatically.
- Known child-abuse-material hash matching is enabled at the edge for the media hostnames (an operator setting, section 15).
- Three removals in 90 days suspend posting for 7 days (`content_suspensions`); an admin decides anything further.

---

## 12. API surface

### 12.1 Conventions

- House pattern: a thin router, `GET /<area>?view=...` with a strict zod query, `POST /<area>/action` with a strict discriminated union, one transaction per action, authorisation inside the transaction with row locks, an audit row in the same transaction. New services import `zod/v4`.
- Mutation order is fixed: `requireCsrf(req)`, then `requireAccount(await readSession(req, res))`, then `authLimit(...)`, then the service. Hot-path routes replace the second step with the attempt credential check of 5.3.
- Every router starts with `moduleGuard(...)`. Audits call `writeAuditEvent` directly with `organizationId` and a real `resourceType` (the existing `audit()` helper hard-codes `account`). Metadata keys never contain "token", "secret" or "credential".
- 404 for what the caller may not know exists; 403 for what they can see but not change. Error codes are upper snake case and messages never name a provider.
- Each area has `lib/api-spec/<area>.yaml` with **per-action request schemas (`oneOf` with a discriminator)**, so generated types are exact per action. Spec files, `openapi.yaml`, `orval.config.ts` and generated clients are edited only by the integrator from each chunk's listed contract.
- Responses are `private, no-store` except the anonymous catalogue, credential verification and the public keys file.

| Area            | Flag                       | Modules required                                                            | Also required                                                                                |
| --------------- | -------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| platform        | `PLATFORM_ACCESS_ENABLED`  | platform                                                                    | `SKILL_KEY_RING`, `LEDGER_PSEUDONYM_SECRET`                                                  |
| authoring       | `SKILLS_AUTHORING_ENABLED` | platform, media, skillsContent                                              | Key ring                                                                                     |
| skills, grading | `SKILLS_ENABLED`           | platform, media, skillsContent, distribution, skillsAttempts, skillsGrading | `guardsReady()`, key ring                                                                    |
| recorded        | `SKILLS_RECORDED_ENABLED`  | as skills                                                                   | `MEDIA_ORIGIN`, evidence bucket, fresh media-processor heartbeat, consent text versions live |
| interview       | `SKILLS_INTERVIEW_ENABLED` | as skills                                                                   | Consent text versions live (a model is optional: without one the interview runs scripted)    |
| voice           | `SKILLS_VOICE_ENABLED`     | as interview and recorded                                                   | Speech models                                                                                |
| education       | `EDUCATION_ENABLED`        | platform, distribution                                                      |                                                                                              |
| hiring          | `HIRING_CHECKS_ENABLED`    | platform, distribution                                                      |                                                                                              |
| social          | `SOCIAL_MEDIA_ENABLED`     | media, social                                                               |                                                                                              |
| video           | `SOCIAL_VIDEO_ENABLED`     | media, social                                                               | Provider keys                                                                                |
| moderation      | `MODERATION_ENABLED`       | social, platform                                                            |                                                                                              |

All flags default to off. `/auth/context` gains `capabilities: string[]` (active platform grants) and `features` (one boolean per area).

### 12.2 Platform: `/api/platform`

| Call                                                   | Who                                                                                                              | Limit             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------- |
| `GET ?view=me`                                         | Account: own capabilities, organisation capabilities, entitlements                                               | 60 per minute     |
| `GET ?view=grants\|users\|organizations\|entitlements` | Platform role with step-up; `users` takes `q` (handle or email prefix) and a cursor; moderators see masked email | 30 per minute     |
| `grant-save`, `grant-revoke`                           | `super_admin`, step-up; target must hold a verified factor; never self                                           | 20 per 10 minutes |
| `organization-account-request`                         | Organisation owner, step-up                                                                                      | 3 per day         |
| `organization-verify {organizationId, decision, note}` | `admin` or `super_admin`, step-up                                                                                | 30 per 10 minutes |
| `member-grant-save`, `member-grant-revoke`             | Organisation owner, step-up; target an active member with a verified factor                                      | 30 per 10 minutes |
| `entitlement-save`, `entitlement-revoke`               | `super_admin`, step-up; `source` limited to `comp` and `invoice` in v1                                           | 30 per 10 minutes |
| `POST /api/platform/hooks/mail`                        | The mail sender, through the site address; raw body; signature, 5-minute window, receipt                         | Hook class        |

### 12.3 Authoring: `/api/skills/authoring`

Scope is `platform` or an `organizationId`. Platform scope needs `skills.author` (or `skills.publisher` for review); organisation scope needs a verified organisation, `skills.org_authoring` and `skills.organization.author`. Body limit 1 MB.

| Call                                                                                                               | Notes                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET ?view=templates\|library\|question\|rubric\|anchor-set\|series\|test\|version\|diff\|reviews\|stats\|rulings` | 120 per minute. `question`, `rubric` and `anchor-set` are the only key views (30 per minute, audited)                                               |
| `question-save`, `question-variant`, `question-share`, `rubric-save`, `anchor-save`, `pool-save`                   | AUTH-1. 120 per minute                                                                                                                              |
| `series-create-from-template`, `series-save`, `test-save`, `version-create`, `structure-save`, `template-save`     | AUTH-2. 120 per minute                                                                                                                              |
| `question-import {format, text, dryRun}`                                                                           | 500 rows, 10 per hour                                                                                                                               |
| `ai-draft`                                                                                                         | 20 per hour; budget scope `drafting`                                                                                                                |
| `submit-review`, `review-decide`, `publish`, `retire`                                                              | `review-decide`, `publish`, `retire` need `skills.publisher` (or a second organisation author), step-up and the separation check. 30 per 10 minutes |
| `ruling-propose`, `ruling-approve`                                                                                 | `skills.publisher`; approver must differ; step-up                                                                                                   |

### 12.4 Candidate, attempts, interview and verification

`/api/skills`:

| Call                                                                       | Who                                                                                    | Limit                  |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------- |
| `GET ?view=catalog`                                                        | Anyone; platform series metadata only; cached 300 s; no per-viewer fields              | Global                 |
| `GET ?view=series&slug=`                                                   | Anyone for metadata                                                                    | 120 per minute         |
| `GET ?view=me\|assigned\|results\|result\|consents\|sharing\|ledger`       | Signed-in owner only; 404 for others. `ledger` verifies the caller's own attempt chain | 120 per minute         |
| `start`, `resume`                                                          | Account; bot check on `start` when configured                                          | 10 per 10 minutes each |
| `preview-start {testVersionId}`                                            | An author or publisher of that content; creates an unscored preview attempt            | 10 per 10 minutes      |
| `consent-save`, `consent-withdraw`, `invitation-respond`, `sharing-revoke` | Account                                                                                | 30 per hour            |
| `credential-update` (visibility, disclosure)                               | Owner                                                                                  | 30 per hour            |
| `appeal-open`, `appeal-withdraw`                                           | Owner of the attempt                                                                   | 5 per day              |

Hot path (attempt credential, bound session cookie, CSRF; 256 kb parser; per-attempt bucket 180 per minute):

| Call                                             | Operations                                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/skills/attempts/:attemptId/state`      | Attempt view, clocks, saved answers, interview state                                                                                                                |
| `POST /api/skills/attempts/:attemptId/action`    | `sync`, `open-section`, `close-section`, `reveal-item`, `submit`, `record-start`, `record-ticket`, `record-part`, `record-status`, `record-complete`, `take-choose` |
| `POST /api/skills/attempts/:attemptId/interview` | `start`, `turn`, `end` (30 per minute)                                                                                                                              |

The attempt id is in the path because the limiter must find the right credential before any body is parsed.

Public: `GET /api/skills/verify?code=` (60 per minute per address; cached 60 s; same shape and constant work for unknown codes) and `GET /api/skills/verify/keys` (public keys by `key_id`).

### 12.5 Education: `/api/education`

| Call                                                                                                            | Who                                                                                                                                       | Limit                                                                      |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `GET ?view=cohorts\|cohort\|roster\|assignments\|assignment\|sittings\|sitting`                                 | Staff with the matching capability; verified organisation; `sitting` returns the current code to the invigilator only                     | 60 per minute                                                              |
| `GET ?view=my\|invite`                                                                                          | Account: own enrolments; invite preview by token                                                                                          | 60 per minute                                                              |
| `cohort-save`, `cohort-archive`, `join-code-rotate`, `enrollment-approve`, `enrollment-remove`, `invite-resend` | `education.cohort.manage`                                                                                                                 | 60 per 10 minutes                                                          |
| `enrollment-import {cohortId, rows, dryRun}`                                                                    | `education.cohort.manage`; one request up to 5,000 rows; step-up; 1 MB parser                                                             | 10 per hour                                                                |
| `enrollment-accept {token}`, `join-cohort {code}`, `enrollment-leave`                                           | Account; verified email must equal the invited address                                                                                    | 30 per hour; `join-cohort` 5 per 10 minutes per account and 20 per network |
| `assignment-save`, `assignment-open`, `assignment-extend`, `assignment-cancel`, `release-results`               | `skills.organization.assign`; `assignment-open` needs step-up                                                                             | 60 per 10 minutes                                                          |
| `accommodation-request`, `accommodation-approve`                                                                | `skills.organization.assign` with step-up; approver must differ; above 1.25 on a platform test also accepts a platform integrity reviewer | 60 per 10 minutes                                                          |
| `sitting-save`, `sitting-admit`, `sitting-incident`, `sitting-attest`                                           | `skills.organization.assign`; `sitting-incident` needs step-up                                                                            | 120 per 10 minutes                                                         |

### 12.6 Media: `/api/media`

| Call                                            | Who                                                                                                   | Limit                                       |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `GET ?view=mine`                                | Account: quota and items                                                                              | 60 per minute                               |
| `reserve`, `complete`, `abort`, `delete`        | Account, owner; per-purpose authorisation; verified email for video                                   | 60 reservations per hour; 10 videos per day |
| `PUT /api/media/:id/content`                    | Owner; image bytes; auth, limit and `Content-Length` check before the body                            | 60 per hour                                 |
| `GET /api/media/:id`                            | Public when SQL proves a public reference; otherwise the owner or an authorised viewer; 404 otherwise | Global                                      |
| `playback-ticket {mediaId, rendition, context}` | Authorised viewer in SQL (7.7)                                                                        | 120 per hour; audited                       |
| `POST /api/media/hooks/video`                   | The provider, through the site address; raw body; signature, 5-minute window, receipt                 | Hook class                                  |

### 12.7 Grading: `/api/skills/grading`

| Call                                                                                | Who                                                                                                                        | Limit               |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `GET ?view=queues\|task\|calibration\|appeals\|appeal\|cases\|case\|rulings\|stats` | The matching capability; `task` only for the claimant                                                                      | 120 per minute      |
| `claim-next`, `release`, `declare-conflict`, `identity-revealed`, `grade-submit`    | `skills.grader` or `skills.organization.grade`. Grading uses the session's ordinary MFA level without step-up on each item | 120 claims per hour |
| `calibration-start`, `calibration-submit`                                           | As above                                                                                                                   | 60 per hour         |
| `adjudicate`                                                                        | `skills.adjudicator`, or a third organisation grader                                                                       | 120 per hour        |
| `appeal-assign`, `appeal-decide`                                                    | `skills.adjudicator` for score; `skills.integrity` for the others; step-up on `appeal-decide`                              | 60 per hour         |
| `integrity-decide`, `incident-grant`, `resume-grant`                                | `skills.integrity`, step-up                                                                                                | 60 per hour         |
| `ruling-apply`                                                                      | `skills.publisher`, after approval, step-up                                                                                | 20 per hour         |
| `support-view {attemptId, reason}`                                                  | `super_admin`, step-up, typed reason                                                                                       | 10 per hour         |

### 12.8 Social: `/api/social`

| Call                                                                                              | Who                                                     | Limit             |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------- |
| `GET ?view=feed\|following\|shorts\|topic\|topics\|media\|routines\|post&cursor=`                 | Optional viewer; visitor-cacheable only with no session | Global            |
| `post-create {body, tags, projectId?, mediaIds?, topics?, quotePostId?, routine?}`, `post-delete` | Account with a handle, not suspended                    | 30 posts per hour |
| `repost`, `block`                                                                                 | Account with a handle                                   | 120 per hour      |

### 12.9 Moderation: `/api/moderation`

`report` (any account, 20 per day); `GET ?view=queue|report` and `triage`, `restrict`, `lift`, `suspend` (platform role; step-up for `restrict` with action `removed`; 120 per hour).

### 12.10 Career checks: `/api/careers/checks`

| Call                                                      | Who                                                                                       | Limit             |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------- |
| `GET ?view=job`                                           | Public for open jobs: mode and label only; the external link only to signed-in applicants | 120 per minute    |
| `GET ?view=application\|eligible`                         | Applicant or current manager; `eligible` lists the caller's attachable credentials        | 120 per minute    |
| `job-check-save`, `job-check-remove`, `check-invite`      | Organisation manage, step-up                                                              | 60 per 10 minutes |
| `credential-attach`, `credential-detach`, `external-done` | Applicant                                                                                 | 30 per hour       |

### 12.11 Organisation results: `/api/org-results`

`GET ?view=progress|results|report|application|export` for staff with `skills.organization.results` (managers for `application`), always joined to active sharing grants; `export` needs step-up, is limited to 10 per hour and writes an audit row with the row count. There are no actions.

### 12.12 Notifications

New titles, each with a fixed `href` pattern and a current-access `EXISTS` clause appended to `notificationReadWhere` only when the modules it names are ready. Unknown pairs are still dropped.

| Title                                              | href                          | Access proof                                          | Category                       |
| -------------------------------------------------- | ----------------------------- | ----------------------------------------------------- | ------------------------------ |
| Skill check assigned; Skill check closing soon     | `/assessments/assigned`       | A candidate row for the viewer in an open assignment  | `assessments` (new)            |
| Cohort invitation                                  | `/assessments/assigned`       | An invited enrolment for the viewer                   | `assessments`                  |
| Skill check result ready; Result updated by ruling | `/assessments/results/<uuid>` | Attempt owned by the viewer                           | `assessments`                  |
| Appeal updated; Integrity review decision          | `/assessments/results/<uuid>` | Attempt owned by the viewer                           | Security class, not switchable |
| Skill check invitation                             | `/applications/<uuid>`        | Applicant of that application                         | `applications`                 |
| New application; Skill check completed             | `/applications/<uuid>`        | Viewer is a current manager of the job's organisation | `applications`                 |
| Content restricted                                 | `/posts/<uuid>`               | Author of the target                                  | Security class                 |
| Reposted your post; Quoted your post               | `/posts/<uuid>`               | Existing post rule                                    | `social`                       |
| Skill check access updated                         | `/account`                    | The recipient's own grant changed                     | Security class                 |

Mail mirrors these through `work_jobs` (`mail`), honours the stored preference and the suppression list, and carries a link only.

### 12.13 Cross-cutting changes (applied by the integrator)

- `app.ts`: `modulesWarm` after `schemaGuard`; path parsers before the default one (`/api/skills/attempts` 256 kb, `/api/skills/authoring/action` 1 MB, `/api/education/action` 1 MB, raw 64 kb for the two hook paths); maintenance exemption for `/skills/attempts/`.
- `middlewares/rate-limit.ts`: the attempt class (5.3) and a hook class. **Webhooks stay behind the web tier; `DIRECT_PATHS` is not extended.** Because the global limiter applies to hook paths first, they are charged to a per-address hook bucket of 600 per minute, so a provider's burst is not throttled and a flood from elsewhere cannot exhaust the provider's allowance. The reconcile job covers any event that is still lost.
- `tests/api.test.ts`: every new POST path joins the cross-site loop and every private GET the forged-identity loop; each chunk also owns its own boundary tests.

### 12.14 Error codes

`FEATURE_UNAVAILABLE` 503, `FEATURE_NOT_CONFIGURED` 503, `ENTITLEMENT_REQUIRED` 402, `SEATS_EXHAUSTED` 409, `ORG_NOT_VERIFIED` 403, `CONSENT_REQUIRED` 409, `SEPARATION_REQUIRED` 403, `CONTENT_LOCKED` 409, `ATTEMPT_EXCLUDED` 403, `ATTEMPT_SANCTIONED` 403, `ATTEMPT_WINDOW_CLOSED` 409, `ATTEMPT_LIMIT` 409, `ATTEMPT_COOLDOWN` 429, `FIXED_PAPER_ASSIGNMENT_ONLY` 409, `SITTING_CODE_INVALID` 403, `SITTING_NOT_ADMITTED` 403, `ATTEMPT_CREDENTIAL_INVALID` 401, `ATTEMPT_MOVED` 409, `ATTEMPT_RESUME_LIMIT` 409, `ATTEMPT_CLOSED` 409, `SEQ_MISMATCH` 409, `MEDIA_LIMIT` 413, `MEDIA_REJECTED` 422, `MEDIA_WINDOW_CLOSED` 409, `GRADING_CONFLICT` 403, `GRADING_NOT_CALIBRATED` 403, `GRADING_CAPACITY` 409, `APPEAL_WINDOW_CLOSED` 409, `AI_BUDGET_EXHAUSTED` 429 (drafting only; never returned to a candidate), `ASSESSMENT_MOVED` 410, and the publish codes of 4.6. Unknown or foreign resources answer 404 with the area's `*_NOT_FOUND`.

### 12.15 Environment variables (all optional; every area stays off without them)

| Group                  | Variables                                                                                                                                                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area flags             | `PLATFORM_ACCESS_ENABLED`, `SKILLS_AUTHORING_ENABLED`, `SKILLS_ENABLED`, `SKILLS_RECORDED_ENABLED`, `SKILLS_INTERVIEW_ENABLED`, `SKILLS_VOICE_ENABLED`, `EDUCATION_ENABLED`, `HIRING_CHECKS_ENABLED`, `SOCIAL_MEDIA_ENABLED`, `SOCIAL_VIDEO_ENABLED`, `MODERATION_ENABLED`              |
| Sealing and pseudonyms | `SKILL_KEY_RING` (`<keyId>:<secret>` entries, first is current, retired entries kept), `LEDGER_PSEUDONYM_SECRET`                                                                                                                                                                        |
| Ledger                 | `LEDGER_SIGNING_KEY`, `LEDGER_SIGNING_KEY_ID`, `LEDGER_ANCHOR_DIR`, `LEDGER_ANCHOR_ACCESS_KEY_ID`, `LEDGER_ANCHOR_SECRET_ACCESS_KEY`                                                                                                                                                    |
| Credentials            | `CREDENTIAL_SIGNING_KEY`, `CREDENTIAL_SIGNING_KEY_ID`, `CREDENTIAL_PUBLIC_KEYS`                                                                                                                                                                                                         |
| Evidence media         | `MEDIA_ORIGIN`, `MEDIA_TICKET_SECRET`, `EVIDENCE_OBJECT_DIR`, `EVIDENCE_R2_ACCESS_KEY_ID`, `EVIDENCE_R2_SECRET_ACCESS_KEY`, `MEDIA_PROCESSOR_ENABLED`; `ASSET_CLEANUP_ALLOWED_NAMESPACES` gains the evidence namespace                                                                  |
| Hosted video           | `VIDEO_PROVIDER_ACCOUNT_ID`, `VIDEO_PROVIDER_API_TOKEN`, `VIDEO_SIGNING_KEY_ID`, `VIDEO_SIGNING_KEY`, `VIDEO_WEBHOOK_SECRET`                                                                                                                                                            |
| AI                     | `AI_MODEL_GRADING`, `AI_MODEL_INTERVIEW`, `AI_MODEL_TRANSCRIBE`, `AI_MODEL_SPEECH`, `AI_MODEL_DRAFTING`, `AI_MODEL_MODERATION`, `AI_RATE_<TASK>_INPUT_MICROS`, `AI_RATE_<TASK>_OUTPUT_MICROS`, `AI_BUDGET_GLOBAL_DAILY_MICROS` (the existing `AI_INTEGRATIONS_OPENAI_*` pair is reused) |
| Mail                   | `MAIL_API_KEY`, `MAIL_FROM`, `MAIL_WEBHOOK_SECRET`                                                                                                                                                                                                                                      |
| Operations             | `EMBEDDED_WORKERS` gains the value `work`; `SKILL_GRADING_MAX_OPEN_TASKS`; `SKILLS_LEGACY_START`; `BOOTSTRAP_TARGET_HOST`                                                                                                                                                               |
| Web Worker             | `MEDIA_ORIGIN`, `VIDEO_ORIGIN`, `VIDEO_UPLOAD_ORIGIN`                                                                                                                                                                                                                                   |
| Media Worker           | `MEDIA_TICKET_SECRET`, `SITE_ORIGIN`, bindings for the evidence and social buckets                                                                                                                                                                                                      |

No optional key enters the required schema in `lib/env.ts`. Provider clients are imported lazily.

---

## 13. Web surface

### 13.1 Routes

| Route                                                                                                                                | Purpose                                                                                           | Layout                           |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------- |
| `/assessments`                                                                                                                       | Catalogue of series; practice checks listed separately and labelled                               | Community                        |
| `/assessments/series/[slug]`                                                                                                         | Series detail, format mix, method statement, consent, start                                       | Community                        |
| `/assessments/assigned`                                                                                                              | Assignments and invitations for the viewer                                                        | Community                        |
| `/assessments/join/[token]`                                                                                                          | Invite acceptance with the consent notice                                                         | Community                        |
| `/assessments/device-check`                                                                                                          | Camera and microphone check                                                                       | Exam (no header, footer or tabs) |
| `/assessments/take/[attemptId]`                                                                                                      | The attempt                                                                                       | Exam                             |
| `/assessments/results`, `/assessments/results/[attemptId]`                                                                           | Results list; score report, receipt, appeal, credential                                           | Community                        |
| `/assessments/methodology`                                                                                                           | Public explanation of randomisation, grading, AI use, integrity, appeals, rulings and reliability | Community                        |
| `/assessments/studio/**`                                                                                                             | Authoring: series, tests, questions, rubrics, templates, reviews                                  | Community, wide                  |
| `/assessments/review/**`                                                                                                             | Grading queue, task, calibration, adjudication, appeals, cases, rulings                           | Community, wide                  |
| `/assessments/[id]`, `/assessments/plans`                                                                                            | Legacy attempt; practice plans (unchanged)                                                        | Community                        |
| `/verify/[code]`                                                                                                                     | Public credential verification (noindex)                                                          | Public                           |
| `/organizations/[slug]/cohorts`, `/cohorts/[id]`, `/assignments`, `/assignments/[id]`, `/sittings/[id]`, `/skill-checks`, `/results` | College and company workspaces                                                                    | Community                        |
| `/shorts`, `/shorts/[id]`, `/topics/[slug]`                                                                                          | Shorts feed; topic pages                                                                          | Full height; Community           |
| `/account/admin/access`, `/organizations`, `/entitlements`, `/moderation`                                                            | Owner-team consoles                                                                               | Existing admin shell             |
| `/settings/privacy` (extended)                                                                                                       | Consents, sharing grants, credential visibility                                                   | Settings                         |

New top-level segments are only `verify`, `shorts` and `topics`. Each is added to `SITE_SEGMENTS`, `RESERVED_HANDLES`, the ownership map in `tests/navigation.test.ts`, and `robots` or `sitemap`. Before reserving them an operator runs `SELECT handle FROM profiles WHERE handle IN ('verify','shorts','topics')` on production and resolves any hit, because a reserved segment breaks that member's repository addresses.

### 13.2 Navigation

The seven `NAV` labels and five `MOBILE_TABS` are pinned by tests and by the owner's agreement and do not change. Only prefixes are extended: Home gains `/shorts` and `/topics`; Skills gains `/verify`. The Skills sub-navigation becomes: Skill checks, Assigned to you, Your results, Practice plans, plus Studio and Review shown only when the auth context lists a capability (the server still decides). `safeAuthReturn` gains `/assessments/assigned`, `/assessments/series/<slug>`, `/assessments/results/<uuid>`, `/assessments/join/<token>`, `/assessments/studio` and `/assessments/review`, with matching tests. The exam route is never a return target; it is entered only by a full navigation after `start`.

### 13.3 Key components

| Folder                                           | Components                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `features/skills-hub/`                           | `SeriesCatalog`, `SeriesDetail`, `AssignedList`, `ConsentGate`, `StartButton`                                                                                                                                                                                                                                                                                                                                                        |
| `features/skills-take/`                          | `ExamShell` (timer bar with `role="timer"`, section navigator, save state, connection state, locked overlay on `ATTEMPT_MOVED`), `useAttempt` (in-memory sync loop, sequence, signal queue), `ChoiceQuestion`, `LongFormQuestion`, `CodingQuestion` (existing editor and runner, labelled as not used for scoring), `recorded/` (`DeviceCheck`, `useRecorder`, `RecordedQuestion`), `interview/` (`InterviewPanel`), `SubmitReceipt` |
| `features/skills-studio/`                        | `TemplatePicker`, `SeriesWizard`, `TestBuilder` (outline, blocks, live preview), `QuestionEditor` per format, `RubricEditor`, `AnchorEditor`, `ImportDialog`, `PoolMeter`, `ReviewPanel` with diff, `PublishChecklist`, `RulingForm`                                                                                                                                                                                                 |
| `features/skills-review/`                        | `GradingQueue`, `BlindTask` (rubric levels, evidence selection on text and transcript), `MediaReview`, `CalibrationRun`, `AdjudicationView`, `AppealCase`, `IntegrityCase`                                                                                                                                                                                                                                                           |
| `features/skills-results/`                       | `ScoreReport`, `IntegrityTimeline`, `AppealDialog`, `CredentialCard`, `VerifyView`, `LedgerCheck`, `Methodology`                                                                                                                                                                                                                                                                                                                     |
| `features/education/`, `features/hiring-checks/` | `CohortList`, `RosterTable`, `InviteImport`, `AssignmentEditor`, `AccommodationPanel`, `SittingScreen`, `AssignmentReport`, `JobCheckField`, `ExternalLinkInterstitial`, `InvitationPanel`, `JoinFlow`                                                                                                                                                                                                                               |
| `features/social/`, `features/media/`            | `Composer`, `MediaTile`, `JustifiedGrid`, `Lightbox`, `VideoPlayer`, `ShortsPlayer`, `TopicPage`, `RoutineCard`, `QuoteCard`, `ReportDialog`                                                                                                                                                                                                                                                                                         |
| `features/platform/`                             | `AccessGrants`, `OrgVerification`, `Entitlements`, `ModerationQueue`                                                                                                                                                                                                                                                                                                                                                                 |

Rules carried over: thin `page.tsx` files; private query keys include the viewer id and are added to the reset list in `hooks/use-auth.ts`; presentational panels are separated so tests can render them statically; no `dangerouslySetInnerHTML`; no provider names in visible copy; heavy modules load through client-only dynamic imports. Header, footer and bottom tabs render nothing on exam paths (`lib/chrome.ts`).

### 13.4 Headers and CSP

**Why the exam is entered by a full navigation.** `Permissions-Policy` and the nonce CSP are document response headers; a client-side route change keeps the first document's headers. Start does `window.location.assign`, and leaving does `window.location.replace`. The runner refuses to open a recorded item when the camera policy is blocked and offers a reload.

**Permissions-Policy** (`next.config.ts`): the existing `/:path*` entry stays as it is, with `camera=(), microphone=()`. Two later entries, for `/assessments/take/:path*` and `/assessments/device-check`, set `camera=(self), microphone=(self), fullscreen=(self), geolocation=(), payment=(), display-capture=()`. A later entry overrides the same key and leaves the other headers of the first entry (nosniff, Referrer-Policy, HSTS, X-Frame-Options) in force; WIRE-1 proves this in a real browser on the Cloudflare runtime, with `proxy.ts` as the fallback. No third-party frame ever receives either permission, and the exam route renders no third-party frames.

**CSP.** `lib/security-media.ts` exports `mediaCspSources(env)`, which validates three optional exact HTTPS origins (`MEDIA_ORIGIN`, `VIDEO_ORIGIN`, `VIDEO_UPLOAD_ORIGIN`, each `new URL(x).origin === x`). `buildContentSecurityPolicy` appends what it returns.

| Directive          | Added when configured                                 |
| ------------------ | ----------------------------------------------------- |
| `media-src` (new)  | `'self' blob:` plus `MEDIA_ORIGIN` and `VIDEO_ORIGIN` |
| `connect-src`      | `MEDIA_ORIGIN`, `VIDEO_ORIGIN`, `VIDEO_UPLOAD_ORIGIN` |
| `img-src`          | `VIDEO_ORIGIN` (posters)                              |
| `worker-src` (new) | `'self' blob:` (the player library's worker)          |

With none set the output is byte-identical to today's string, so the pinned assertions in `tests/security.test.ts` and `tests/video-link.test.ts` keep passing. `frame-src` and `script-src` do not change. The AI provider is never contacted from the browser.

---

## 14. Security review of this design

### 14.1 Threat model

| Asset                                          | Threat                                                                         | Control                                                                                                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Answer keys, rubrics, anchors, interview plans | Leak through the account export                                                | No foreign key to `users`; export policy fails closed against the live catalogue; nested redaction kept                                                                                              |
|                                                | Leak through an API projection                                                 | One projection; one key module behind an import rule and a source scan; response scanner over every endpoint                                                                                         |
|                                                | Database or backup disclosure, read-path injection                             | Sealed at rest under a dedicated key ring with key ids                                                                                                                                               |
|                                                | Compromised author account                                                     | MFA forced for grant holders; keys only for own or shared drafts; 30 reads per minute; every read audited and recorded; grants expire and revocation ends sessions                                   |
| Question bank                                  | Harvesting by retakes, many accounts or organisations                          | Attempt caps and cooldown; pool depth; seen-item exclusion; one-shot reveal; no item-level correctness for pooled tests; organisations never see responses; item drift flags; leaked-item retirement |
| Test fairness                                  | Content changed after candidates start                                         | Immutable versions, frozen slot sets, per-attempt snapshots, guards, digest re-verified at every start and on the ledger                                                                             |
|                                                | Unequal forms                                                                  | Single-stratum slots, calibrated pools, tolerance band, nightly form check, honest equating statement, common paper for cohorts                                                                      |
|                                                | A paper chosen for a candidate                                                 | Random sealed seed, commitment and form digest given at start, full draw record, verification script                                                                                                 |
|                                                | An identical paper leaking over a long window                                  | Common and fixed papers need supervision or a 5 to 15 minute start window                                                                                                                            |
| Timing                                         | Client clock tampering, late writes, re-recording                              | Server deadlines only; one-shot reveal stamped on the server; takes bounded by server and Worker clocks                                                                                              |
| Attempt                                        | A helper on another machine                                                    | HttpOnly per-attempt credential bound to the session row; network and browser digests compared on every call; lease changes counted; supervised sittings with an admit list                          |
|                                                | Someone else sits the test                                                     | Honest labels; admit list and attestation; recorded answers show the person; identity is stated as not verified                                                                                      |
|                                                | A caught candidate erases and re-registers                                     | Sanction digests survive for the sanction's term                                                                                                                                                     |
| Scores                                         | A person who knows the keys sits the test                                      | Start-time exclusion in SQL for authors, reviewers, publishers, key viewers, graders and adjudicators                                                                                                |
|                                                | Grader bias, favouritism, collusion                                            | Server-chosen tasks; blind view; `blind_ref` unknown to candidates; conflict rules; self-identification screening; double grading; adjudication; validity anchors; severity and speed statistics     |
|                                                | Organisation partiality                                                        | Organisations never grade platform tests; accommodations need a second approver above 25 percent; incident time applies to whole sittings; rates reported to the platform                            |
|                                                | Credential laundering                                                          | No credentials, badges or talent matches for organisation-authored or organisation-graded tests                                                                                                      |
|                                                | Insider edits in the database                                                  | Guards; versioned results; hash chain; signed checkpoints anchored outside the database; credentials carry the result digest                                                                         |
|                                                | A candidate gains from failure                                                 | Scripted interview fallback; no item dropped from a maximum; late media to the incident path                                                                                                         |
| AI reader                                      | Prompt injection inside an answer                                              | Delimited data; verified evidence spans; two agreeing runs; calibration gate; never a recorded score; never shown to graders                                                                         |
| AI interviewer                                 | Coaching, leaking, derailment, early ending                                    | Verbatim core prompts; no rubric in context; no tools; server counters decide; validated output; scripted fallback                                                                                   |
| AI spend                                       | Cost exhaustion                                                                | Worst-case reservation per session; organisation and global money budgets; provider-side caps; scripted and human fallbacks                                                                          |
| Recordings                                     | Unauthorised viewing or forwarding                                             | Private bucket; SQL authorisation; 5-minute single-object tickets bound to the first presenter; audit and ledger entry per view; no download; audio-only review                                      |
|                                                | Malicious or oversized upload                                                  | Per-part tickets with exact sizes; server-generated keys; isolated parser with no network or credentials; unplayable until validated; fixed content types; separate origin                           |
|                                                | Substitution after the window                                                  | Per-part receipts with Worker time; no overwrite accepted; manifest digest on the ledger                                                                                                             |
| Tenant data                                    | Cross-organisation read                                                        | Scope column and predicate in every query; 404 for foreign ids and slugs; cross-tenant matrix over every view and action                                                                             |
| Student data                                   | College or recruiter overreach                                                 | Per-assignment consent joined at read time; narrow fields; no roster for students; suppression under 5; audited exports                                                                              |
| Student identity                               | Enumeration or spam through invites                                            | Constant response; sealed addresses; hashed single-use tokens; verified-email match; caps; verified organisations only                                                                               |
| Paid seats and AI budget                       | Drained by fake applicants or concurrent starts                                | Manager-initiated invitations with caps; atomic seat consumption                                                                                                                                     |
| Organisation identity                          | Fake college or company                                                        | Platform verification with domain proof; unique verified names; unverified organisations limited to external links                                                                                   |
| Privilege                                      | Escalation through roles                                                       | No new roles or enum values; dedicated grant tables; no implicit capability; no self-grant; one audited break-glass                                                                                  |
| Web                                            | Script injection through content                                               | Plain text with a safe tokenizer; no raw HTML; nonce CSP                                                                                                                                             |
|                                                | Cross-site request forgery                                                     | `requireCsrf` on every POST including the hot path; central and per-chunk boundary tests                                                                                                             |
|                                                | Exam data left on a shared machine                                             | Nothing in browser storage; credential in an HttpOnly cookie that expires with the attempt                                                                                                           |
| External test link                             | Phishing, server-side request forgery                                          | HTTPS only with host rules; never fetched; interstitial with the host; new tab; never framed                                                                                                         |
| Webhooks                                       | Forgery, replay, bypass of the web tier                                        | Signature over raw bytes; timestamp window; receipts; routed through the site address; `DIRECT_PATHS` unchanged                                                                                      |
| Availability                                   | Exam-day load, shared address, provider outage, pending migration, maintenance | Batched sync; stateless per-attempt rate class; no provider call on the hot path; no connection held across provider calls; module guard; maintenance exemption                                      |
| Social                                         | Abuse and illegal content                                                      | Reports with deadlines; reversible restrictions enforced in every read path; video held until cleared; blocks; suspensions                                                                           |
| Ledger                                         | Evidence lost through erasure                                                  | Digests and pseudonyms only; erasure writes its own entry; checkpoints stay verifiable                                                                                                               |

### 14.2 Abuse limits

| Action                      | Limit                                                                       |
| --------------------------- | --------------------------------------------------------------------------- |
| Start an attempt            | 10 per 10 minutes per account; bot check when configured                    |
| Hot path                    | 180 per minute per attempt; 256 kb body                                     |
| Integrity events            | 50 per sync; 1,500 client and 500 server-observed stored per attempt        |
| Interview turns             | 30 per minute; 24 per session; 4,000 characters or 120 seconds              |
| Resume                      | 5 lease changes per attempt                                                 |
| Authoring writes; key views | 120 per minute; 30 per minute                                               |
| Import; AI drafting         | 500 rows, 10 per hour; 20 per hour                                          |
| Grading claims              | 120 per hour; 10 held                                                       |
| Appeals                     | 5 per day per account; one open per ground per attempt                      |
| Invites                     | 5,000 per import; 5,000 per organisation per day; 20,000 pending            |
| Join code                   | 5 per 10 minutes per account; 20 per network                                |
| Job invitations             | 500 per job; 2,000 per organisation per day                                 |
| Export                      | 10 per hour, step-up, audited                                               |
| Media                       | 60 reservations per hour; 10 videos and 60 minutes per day; 5 GB per person |
| Playback tickets            | 120 per hour; 5 minutes each                                                |
| Posts and reports           | 30 posts per hour; 20 reports per day                                       |
| Credential verification     | 60 per minute per address                                                   |

### 14.3 Privacy and legal (India first)

- **Legal gate.** The Terms and Privacy Policy currently say that skill checks are not proctored, that no biometric data is collected, that the service is free and that two AI features exist. REL-1 rewrites those sections, bumps `TERMS_VERSION` on both sides and updates `docs/legal-compliance.md`. **No recording or AI area can be enabled before the revised text, the three versioned consent texts and counsel review are in place**: the `recorded`, `interview` and `voice` areas report unavailable until the consent text versions exist.
- **Consent purposes** in `consent_records`: `recording` (capture for named items, who can view, retention), `ai_evaluation` (transcription, AI extra read, model-worded follow-ups, the provider category, human oversight), `integrity_monitoring` (the exact signal list). Each is asked at the point of use, itemised, versioned and withdrawable. Withdrawal of `recording` waits for open appeals and cases (7.10).
- **Sharing** is a separate, specific, revocable grant per assignment, never bundled into the Terms.
- **Biometrics.** Recordings are stored and viewed by people. No template extraction, face matching or voice identification is performed. Recordings are still handled as sensitive: private bucket, short tickets, audited views, fixed retention.
- **Age.** 18+ stays, and every college invite states it.
- **Export.** One contributor with explicit columns returns the member's own attempts, answers, released scores and feedback, events, decisions, credentials, appeals, consents and sharing grants, with time-limited links to their recordings. Never seeds, option maps, refs, digests of others, or keys.
- **Erasure.** Cascades remove attempts, responses, results, credentials, enrolments, grants, posts and media rows; storage objects and provider assets are queued first; the ledger keeps digests and pseudonyms only; a sanction keeps keyed digests until it ends.
- **Retention.** Section 7.10; sealed invite addresses are cleared on response or expiry; `ai_usage` holds no personal data; hook receipts 7 days.
- **Processors.** The video platform, the AI provider (text and speech) and the mail sender are added to the Privacy Policy processor table with locations. Visible product copy never names them.
- **Cookies.** The per-attempt credential and the media-origin playback cookie are strictly necessary. The video player sets no third-party cookies; if the provider's player would, only the native element is used.
- **Grievance handling.** Report deadlines (11.5) and appeal targets (6.8) are on the operations report. The operator details placeholders must be filled before public launch.

### 14.4 Observability and audit

- **Three trails.** `audit_logs` (who did what, with organisation and resource type, 365 days); `skill_ledger` (permanent, tamper-evident, no personal data); application logs (request ids only; never answers, keys, tickets or signed addresses).
- **Ledger verification.** A daily `ledger-checkpoint` job computes a Merkle root over chain heads, signs it, stores it and writes it to the object-locked bucket. `scripts/verify-ledger.mjs` recomputes every chain and checkpoint and exits non-zero on any break. It runs nightly from the operations workflow and before each release.
- **Operations report** gains: `work_jobs` depth and oldest age per kind; worker heartbeats per service; attempts in progress and past deadline; grading backlog by age against the targets of 6.12; appeals past target; AI spend against budgets; media stuck in processing; reports past `due_at`; accommodation rates per organisation; last ledger verification.
- **Alerts:** ledger verification failure, a refused change on a guarded table, a spike in `ATTEMPT_MOVED`, AI evidence-verification failures, hook signature failures, sweeper lag over 2 minutes.
- **Preflight:** each area flag with its configuration, the ten seeded role grants, the guards, and that every `key_id` in the database is present in the key ring.
- **First super admin in production.** `bootstrap-admin.mjs` is extended, not replaced: it stays development-only unless `BOOTSTRAP_TARGET_HOST` equals the database host (the same confirmation as `migrate:release`), refuses when any super admin exists, requires the target to hold a verified factor, and writes an audit row and an `access` ledger entry.

### 14.5 Where each required fix is resolved

| Required fix                                                                                                                                            | Rule               | Proven in                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------ |
| Erasure versus immutability; exact trigger mechanism                                                                                                    | 3.2, 3.9           | DB-1, DB-7                                             |
| Core code never names a module table while its migration is pending                                                                                     | 3.1                | FND-1, PLAT-1, MOD-1, MEDIA-1, REL-1 (core-only tests) |
| Key-holder exclusion at start; no implicit capability; no self-grant; one break-glass with a label; minimum staffing                                    | 2.1, 2.2, 5.1      | PLAT-1, AUTH-2, ATT-1                                  |
| Attempt credential not readable by script, bound to the session, per attempt, verified without database work, reload is not a takeover                  | 5.3, 5.4           | FND-1, ATT-1, ATT-2                                    |
| Draw reproducible; seed survives rotation; commitment given at start                                                                                    | 3.2, 5.2           | ATT-1                                                  |
| Form equivalence, pretest items, tolerance band, nightly check, honest statement                                                                        | 4.5                | AUTH-2, GRADE-2                                        |
| Common or fixed paper needs supervision or a short start window                                                                                         | 3.6, 4.5           | DB-4, EDU-2, ATT-1                                     |
| Defective and leaked items are separate; two-person rulings; pool-depth rule                                                                            | 4.7                | AUTH-2, GRADE-3                                        |
| Score appeals never replace a double-marked score with one reader; independent handlers; procedural review for organisation tests                       | 6.8                | GRADE-3                                                |
| Anchor and validity task row shape; shared anchors; AI gate of 30 anchors with a bound                                                                  | 3.5, 3.8, 6.3, 6.4 | DB-6, GRADE-2                                          |
| Accommodations and incident time with oversight                                                                                                         | 5.10               | EDU-2, REL-1                                           |
| Honest supervised label; admit list; network check; headcount reconciliation                                                                            | 5.9                | EDU-2                                                  |
| Blindness: grader id unknown to the candidate; identity-revealed; screening; audio rendition                                                            | 6.2, 7.7           | GRADE-1, REC-1                                         |
| Organisations never receive responses, recordings or transcripts of platform tests; reviewed integrity category only; human decision before release     | 6.7, 6.10          | GRADE-1, ORG-1, SEC-1                                  |
| No credentials for organisation-authored tests; labels on every credential; no item-level correctness for pooled tests                                  | 5.7, 6.9           | GRADE-3                                                |
| Server-stamped reveal; takes bounded by server clocks; no overwrite; late media to the incident path; live capture stated as unverified                 | 5.5, 7.2           | ATT-1, REC-1                                           |
| Original with ledgered digest plus a seekable rendition; nothing persists in the browser                                                                | 5.6, 7.3, 7.6      | REC-1, WEB-EXAM, WEB-EXAM-MEDIA                        |
| Integrity events tamper-evident; separate caps; never written for an unproven caller; ledger without raw user ids; consent withdrawal waits             | 5.3, 5.9, 7.10     | LEDGER-1, ATT-2, REC-1                                 |
| No candidate gain from failure; interview always completes; server counters decide; no connection held across provider calls; machine transcript scored | 8.3, 8.7, 8.8, 8.9 | INT-1                                                  |
| A human never sees an AI suggestion in live grading; the AI score is never recorded or averaged                                                         | 6.4                | GRADE-2                                                |
| Standard setting with sign-off; reliability published; group-difference screen                                                                          | 4.5, 6.6           | AUTH-2, GRADE-2, WEB-RESULTS                           |
| Grading capacity, targets, backlog alerts, too-fast grading                                                                                             | 6.2, 6.12          | EDU-2, GRADE-1, REL-1                                  |
| Authoring speed kept: shared anchors, block builder, 500-row import, templates                                                                          | 4.3, 4.4           | AUTH-1, AUTH-2, WEB-STUDIO                             |
| Cleanup worker deletes the media row; retention deletion tested                                                                                         | 7.9                | MEDIA-1, REC-1                                         |
| Webhooks behind the web tier; raw-byte signature; replay window; receipts; limiter accounted for                                                        | 12.13              | JOBS-1, MEDIA-3                                        |
| Seats atomic; invites manager-initiated with caps                                                                                                       | 2.1, 10.2          | PLAT-1, ORG-1                                          |
| Invite token hashed and single use with verified-email match; join-code entropy and limits                                                              | 9.2                | EDU-1                                                  |
| MFA for organisation grant holders; step-up stays at five minutes; bulk work is one action                                                              | 2.1, 9.2           | PLAT-1, EDU-1                                          |
| Playback links: 5 minutes, one object, audited, no download                                                                                             | 7.7                | MEDIA-1, MEDIA-2                                       |
| Hostile media and code: isolated, no network, no credentials, pinned; unplayable until validated; no server code execution                              | 1.3, 7.6           | REC-1                                                  |
| Moderation fails closed; restrictions in every read path; reversible                                                                                    | 11.5               | SOC-1, MOD-1                                           |
| Sanction evasion across erasure                                                                                                                         | 6.11               | GRADE-3                                                |
| Export reconciled with the existing redaction; fail-closed policy test                                                                                  | 3.2                | FND-1                                                  |
| Sharing rows re-grantable; consent per assignment                                                                                                       | 3.6, 9.3           | DB-4, EDU-2                                            |
| Organisation deletion never changes issuer or grader; grades behind results kept                                                                        | 3.7, 3.8           | DB-5, DB-6, DB-7                                       |
| Slugs unique per tenant; foreign ids 404                                                                                                                | 3.5, 4.1           | DB-3, AUTH-1                                           |
| Unverified assumptions proven early with fallbacks                                                                                                      | Header table       | DB-1, WIRE-1, MEDIA-2, MEDIA-3                         |
| Path-scoped Permissions-Policy with the other headers intact; CSP byte-identical when unset                                                             | 13.4               | WIRE-1                                                 |
| LF for migrations; table-count pins only in the schema lane                                                                                             | 3.2                | DB-1                                                   |
| First super admin from the existing script                                                                                                              | 14.4               | PLAT-1                                                 |
| Legal gate before recording or AI                                                                                                                       | 14.3               | REL-1                                                  |
| Build plan: no same-wave dependencies; one owner per cross-cutting edit; stubs pre-wired                                                                | 16                 | Validated by script                                    |

---

## 15. Decisions for the owner

Each has a default so building can proceed. Items 1, 3, 9, 14 and 17 need your explicit answer before public launch.

| #   | Decision                                           | Recommended default                                                                                                                                                                                                                                                                                             |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Payment provider and pricing for premium           | No online checkout in v1. Sell seats to colleges and companies by invoice and grant entitlements from the admin console. Add checkout later on the same entitlement model.                                                                                                                                      |
| 2   | Launch order for premium tests                     | Start with free practice series and assigned common papers (both carry unscored pretest questions). Publish pooled premium tests once their pools are calibrated at 50 exposures per question. The alternative, pooled tests on expert-rated difficulty from day one, is faster but weakens the fairness claim. |
| 3   | Video provider for posts and Shorts                | The managed video platform at the existing edge vendor, with signed playback and the previously approved limits.                                                                                                                                                                                                |
| 4   | Storage for recordings                             | A separate private evidence bucket with its own credentials, a dedicated media Worker on a media subdomain, originals kept untouched, renditions by remux only.                                                                                                                                                 |
| 5   | AI models                                          | Keep the configured OpenAI-compatible provider; one model variable per task; provider-side monthly spend caps.                                                                                                                                                                                                  |
| 6   | Voice interview                                    | Push-to-talk behind configuration; realtime voice deferred.                                                                                                                                                                                                                                                     |
| 7   | Coding questions                                   | Rubric-graded by people in v1, with the existing in-browser runner as the candidate's test bench. Server-side execution with hidden tests is deferred.                                                                                                                                                          |
| 8   | Hosting                                            | Always-on API instance; one work-worker; one media-processor worker (with the parser sandbox); paid Workers plan; larger database pool; object-locked bucket for ledger checkpoints.                                                                                                                            |
| 9   | Who grades platform tests                          | Your team under `skills.grader` grants with calibration. Decide whether to contract external graders; the grading ceiling (default 2,000 open tasks) rises as you add them.                                                                                                                                     |
| 10  | Default grading policy for assigned platform tests | `double` for every constructed response; AI only as an extra read that never sets a mark.                                                                                                                                                                                                                       |
| 11  | One-person operation                               | Allowed through the audited break-glass script for 90 days at a time; everything approved that way is labelled "Single-approver content".                                                                                                                                                                       |
| 12  | Result publication                                 | Opt-in per credential, band shown by default, attempt number always shown. This closes the open item in `docs/production-plan.md`.                                                                                                                                                                              |
| 13  | Retention                                          | Recordings and transcripts 180 days after the final result or 30 days after the last appeal; integrity events reduced to counts after 180 days; ledger permanent.                                                                                                                                               |
| 14  | Legal review                                       | Engage counsel on the recording, AI evaluation and monitoring consent texts and the revised Terms and Privacy Policy before those areas are enabled, and fill the operator details.                                                                                                                             |
| 15  | Organisation verification                          | By platform admins: domain proof plus one official document checked offline.                                                                                                                                                                                                                                    |
| 16  | Navigation                                         | Keep the seven labels and five phone tabs; add only prefixes. Reserve `verify`, `shorts` and `topics` after the handle check.                                                                                                                                                                                   |
| 17  | Age                                                | Stay 18+ and say so in every college invite. Revisit after legal advice on guardian consent.                                                                                                                                                                                                                    |
| 18  | First production super admin                       | Run the extended bootstrap script once, yourself, with the target host confirmed.                                                                                                                                                                                                                               |
| 19  | Sanctions                                          | 180 days after an invalidation for cause; only keyed digests survive an erasure, and only until the sanction ends.                                                                                                                                                                                              |
| 20  | Legacy practice checks                             | Import into a free series; keep legacy start enabled for 30 days, then set `SKILLS_LEGACY_START=off`. Old results stay readable.                                                                                                                                                                                |
| 21  | Edge child-safety scanning                         | Enable known-material hash scanning on the media hostnames.                                                                                                                                                                                                                                                     |
| 22  | Migration approval                                 | Approve 0022 to 0028 together after staging. Because of the second schema barrel, deploying code first no longer takes the site down; the new areas simply stay off until the migrations are applied.                                                                                                           |

---

## 16. Build plan

### 16.1 Rules for parallel builders

1. **A chunk edits only the files it owns.** Chunks in the same wave own disjoint files. No chunk depends on another chunk in its own wave; every dependency is in an earlier wave. A script checked both properties for the list below.
2. **Shared files are edited only by the integrator**, between waves, from each chunk's "Shared-file edits" list. Shared files are: `lib/db/src/schema/index.ts` (never changed by this plan), `artifacts/api-server/src/routes/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/api-server/build.mjs`, everything under `lib/api-spec/`, the generated clients under `lib/api-zod` and `lib/api-client-react`, `artifacts/proofstack/lib/navigation.ts`, `artifacts/proofstack/lib/security.ts`, `artifacts/proofstack/public/_headers` (not changed by this plan), `artifacts/proofstack/hooks/use-auth.ts`, `RESERVED_HANDLES` in `community-input.ts`, `.env.example`, `render.yaml`, `eslint.config.mjs`, every `package.json` and the lockfile, `tests/api.test.ts`, `tests/navigation.test.ts`, `tests/site-addresses.test.ts`, `tests/embedded-db.ts`, the two table-count tests, and `docs/checkpoints/README.md`.
3. **A chunk's own tests never depend on its own shared-file edits.** WIRE-1 pre-wires a stub router, a stub spec and a placeholder page for every area in wave 0, so from wave 1 every feature chunk fills files that are already mounted and can run its own cross-site, forged-identity and cross-tenant route tests. Until its contract is integrated, an API chunk validates with its own zod schemas and exports its response types; web chunks start only after the integrator has generated the client for the APIs they use.
4. **Schema is one lane.** DB-1 to DB-7 run one per wave, in order, one migration each. Only they touch `lib/db/**` and `export-policy.ts`. Each lists the new pinned table count for the integrator. A schema change request after its chunk goes back to the lane as a new numbered migration.
5. **After each wave the integrator** applies the listed shared-file edits, regenerates clients, updates the table-count pins, runs `pnpm check`, `pnpm test:embedded` and `pnpm test:core-only`, and appends the wave's checkpoint links to `docs/checkpoints/README.md`.
6. **Every chunk** writes its checkpoint under `docs/checkpoints/`, runs `pnpm lint`, `pnpm format:check`, `pnpm typecheck` and `pnpm test`, plus `pnpm test:embedded` when it touches SQL (integration tests run with `RUN_DB_TESTS=1`), and commits as `AGENTS.md` requires. Tests marked PostgreSQL 17 (concurrency and guards) run under `pnpm test:all` in CI. No chunk deploys or runs a production migration.
7. **Every API chunk ships three kinds of test:** input rejection (unknown and forged fields), access (401, 403 on pending MFA, CSRF rejection, 404 on another user's or organisation's row), and state rules.
8. **Off until configured.** Every area that needs a key, a service or a migration answers `503 FEATURE_UNAVAILABLE` or `503 FEATURE_NOT_CONFIGURED` until it is ready, so code ships before keys exist.

### 16.2 Cross-cutting files and their single owner per wave

| File                                                                                                         | Owner (wave)                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `services/export-policy.ts`                                                                                  | DB-1 (0), DB-2 (1), DB-3 (2), DB-4 (3), DB-5 (4), DB-6 (5)                                                                                  |
| `services/account-data.ts`                                                                                   | FND-1 (1: export policy), MEDIA-1 (3: media erase queue), GRADE-3 (8: skills export contributor, erase ledger entries, sanction carry-over) |
| `services/community-policy.ts`                                                                               | MOD-1 (4: restriction predicate), REL-1 (9: notification clauses)                                                                           |
| `services/community-reader.ts`, `community-query.ts`, `community-social-actions.ts`                          | MOD-1 (4)                                                                                                                                   |
| `services/auth-sessions.ts`, `services/auth-account.ts`, `routes/auth.ts`, `scripts/bootstrap-admin.mjs`     | PLAT-1 (3)                                                                                                                                  |
| `middlewares/rate-limit.ts`                                                                                  | MEDIA-3 (4: hook class), ATT-2 (7: attempt class)                                                                                           |
| `services/operations.ts`                                                                                     | JOBS-1 (2: heartbeat name), REL-1 (9: report)                                                                                               |
| `lib/objectStorage.ts`, `services/asset-cleanup-worker.ts`, `asset-cleanup-storage.ts`, `image-canonical.ts` | MEDIA-1 (3)                                                                                                                                 |
| `services/careers-query.ts`                                                                                  | ORG-1 (8)                                                                                                                                   |
| `services/assessments.ts`, `routes/assessments.ts`, both `legal.ts`, legal pages                             | REL-1 (9)                                                                                                                                   |
| `next.config.ts`, `proxy.ts`, `wrangler.jsonc`, `lib/auth-return.ts`, header, footer and bottom tabs         | WIRE-1 (0)                                                                                                                                  |
| `features/community/profile-view.tsx`                                                                        | WEB-SOCIAL (5), WEB-RESULTS (9)                                                                                                             |
| `features/assessments/skills-shell.tsx`, `tests/assessment-ui.test.ts`                                       | WEB-EXAM (7)                                                                                                                                |

Seams (a stub created by the first chunk and owned afterwards by the second):

| Seam file                                                                               | Created by                                     | Filled by                            |
| --------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------ |
| `services/skills-authoring-version-actions.ts`                                          | AUTH-1                                         | AUTH-2                               |
| `services/education-assignment-actions.ts`                                              | EDU-1                                          | EDU-2                                |
| `services/skills-finalize.ts` (objective scoring and task creation at submit)           | ATT-1                                          | GRADE-1                              |
| `services/skills-attempt-events.ts`                                                     | ATT-1                                          | ATT-2                                |
| `services/skills-recording.ts`                                                          | ATT-1                                          | REC-1                                |
| `services/skills-result-actions.ts` (appeals, credential updates)                       | ATT-1                                          | GRADE-3                              |
| `services/skills-calibration-actions.ts`                                                | GRADE-1                                        | GRADE-2                              |
| `services/skills-case-actions.ts` (appeals, integrity decisions, rulings, support view) | GRADE-1                                        | GRADE-3                              |
| `services/work/<kind>.ts`, `services/retention/<area>.ts`                               | Loaded by convention by the JOBS-1 dispatchers | The chunk that owns the kind or area |
| `services/ai/prompts/<name>.ts`                                                         | Loaded by the AI-1 registry                    | AUTH-2, INT-1, GRADE-2               |
| `features/skills-take/recorded/`, `features/skills-take/interview/`                     | WEB-EXAM (placeholders)                        | WEB-EXAM-MEDIA                       |

### 16.3 Waves

| Wave | Chunks                                     |
| ---- | ------------------------------------------ |
| 0    | DB-1, WIRE-1                               |
| 1    | DB-2, FND-1                                |
| 2    | DB-3, LEDGER-1, JOBS-1, AI-1, MEDIA-2      |
| 3    | DB-4, PLAT-1, MEDIA-1                      |
| 4    | DB-5, AUTH-1, SOC-1, MOD-1, MEDIA-3        |
| 5    | DB-6, AUTH-2, EDU-1, WEB-SOCIAL, WEB-ADMIN |
| 6    | DB-7, ATT-1, EDU-2, WEB-STUDIO             |
| 7    | GRADE-1, ATT-2, INT-1, REC-1, WEB-EXAM     |
| 8    | GRADE-2, GRADE-3, ORG-1, WEB-EXAM-MEDIA    |
| 9    | REL-1, WEB-REVIEW, WEB-ORG, WEB-RESULTS    |
| 10   | SEC-1                                      |

Total: 40 chunks in 11 waves. The schema lane (DB-1 to DB-7) and the feature lanes overlap: a feature chunk starts as soon as the migrations it needs are in an earlier wave.

### 16.4 Chunks

#### DB-1: Modules barrel, export-policy registry and migration 0022_platform_foundation

Wave 0. Layer: database. Depends on: nothing.

Create the second schema barrel (lib/db/src/modules) that the global schema guard never reads, with one empty stub file per module; point drizzle-kit at both barrels; force LF on migration files; prove PL/pgSQL triggers with WHEN (pg_trigger_depth() = 0) under PGlite; create the export-policy registry with the frozen 54-table baseline; write migration 0022 (12 tables, section 3.3) plus the permission seeds.

**Owns**

- `lib/db/drizzle.config.ts`
- `lib/db/src/modules/index.ts`
- `lib/db/src/modules/platform.ts`
- `lib/db/src/modules/media.ts`
- `lib/db/src/modules/social.ts`
- `lib/db/src/modules/skills-content.ts`
- `lib/db/src/modules/distribution.ts`
- `lib/db/src/modules/skills-attempts.ts`
- `lib/db/src/modules/skills-grading.ts`
- `lib/db/drizzle/0022_platform_foundation.sql`
- `lib/db/drizzle/meta/0022_snapshot.json`
- `lib/db/drizzle/meta/_journal.json`
- `.gitattributes`
- `artifacts/api-server/src/services/export-policy.ts`
- `tests/modules-platform.integration.test.ts`
- `tests/pglite-capabilities.integration.test.ts`

**Shared-file edits (integrator)**

- lib/db/package.json: add export "./modules": "./src/modules/index.ts"
- tests/preflight-schema.integration.test.ts (two places) and tests/asset-cleanup.integration.test.ts (value and title): table count 54 -> 66

**Acceptance**

- drizzle-kit generate reads both barrels and the 0022 snapshot lists 66 tables; if the schema array fails, the kit-only barrel fallback (section 3.1) is used and recorded in the checkpoint
- migrate:dev twice is idempotent on PostgreSQL 17, 0022 replays under PGlite, tests/ci-migrations.test.ts passes
- Each CHECK and partial unique index of the 12 tables is asserted with codes 23514/23505: self-grant, second active grant, seats_used above seats, duplicate dedupe_key, duplicate (chain, seq)
- 5 permission keys and 10 role_permissions rows exist; inspectCommunityGrants still passes; organization_member receives nothing
- PGlite capability test: a BEFORE UPDATE OR DELETE trigger with WHEN (pg_trigger_depth() = 0) blocks a direct statement and lets a foreign-key cascade and a SET NULL through; outcome recorded
- checkReadiness stays ready with every module table absent (existing schema-guard tests unchanged)

**Security checks**

- Catalog assertion: every foreign key to users in 0022 is CASCADE or SET NULL and has an export-policy entry
- skill_ledger, skill_ledger_checkpoints, work_jobs, hook_receipts, mail_suppressions, ai_usage and ai_budgets have no foreign key to users
- Seeds insert no users or memberships and grant nothing to organization_member

#### WIRE-1: Stub routers, placeholder pages, web security shell and the shared-file wiring list

Wave 0. Layer: wiring. Depends on: nothing.

Pre-wire everything shared, once. Create a stub router per planned API area (503 FEATURE_UNAVAILABLE, cross-site POST rejected), a placeholder page for every route in section 13.1, the exam route group and chrome guards, the path-scoped Permissions-Policy, the media CSP helper, the sign-in return allow-list, and a core-only embedded database harness (migrations 0000-0021 only). All shared-file changes are listed for the integrator.

**Owns**

- `artifacts/api-server/src/routes/{platform,mail-hooks,media,media-hooks,social,moderation,skills-authoring,skills,skills-interview,skills-verify,skills-grading,education,org-results,career-checks}.ts`
- `artifacts/proofstack/app/(exam)/**`
- `artifacts/proofstack/app/(community)/assessments/{series,assigned,methodology,join,studio,review}/**`
- `artifacts/proofstack/app/(community)/assessments/results/[attemptId]/**`
- `artifacts/proofstack/app/(community)/organizations/[slug]/{cohorts,assignments,sittings,skill-checks,results}/**`
- `artifacts/proofstack/app/(community)/topics/**`
- `artifacts/proofstack/app/{verify,shorts}/**`
- `artifacts/proofstack/app/account/admin/{access,organizations,entitlements,moderation}/**`
- `artifacts/proofstack/lib/{security-media,chrome,auth-return}.ts`
- `artifacts/proofstack/next.config.ts`
- `artifacts/proofstack/proxy.ts`
- `artifacts/proofstack/wrangler.jsonc`
- `artifacts/proofstack/app/{robots,sitemap}.ts`
- `artifacts/proofstack/components/{site-header,site-footer,bottom-tabs}.tsx`
- `vitest.core-only.config.ts`
- `tests/embedded-core-db.ts`
- `tests/{wiring-stubs,security-media,exam-headers,auth-return}.test.ts`

**Shared-file edits (integrator)**

- artifacts/api-server/src/routes/index.ts: mount the 14 stub routers
- artifacts/api-server/src/app.ts: path parsers before the default one (/api/skills/attempts 256kb JSON, /api/skills/authoring/action 1mb, /api/education/action 1mb, raw 64kb for /api/media/hooks/video and /api/platform/hooks/mail); maintenance exemption for paths starting /skills/attempts/
- lib/api-spec: create one stub spec file per area (section 12), reference them from openapi.yaml, add them to both externalRefs.allow lists in orval.config.ts, regenerate lib/api-zod and lib/api-client-react; prove per-action oneOf output type-checks (fallback: flat request object with an action enum)
- artifacts/proofstack/lib/navigation.ts: SITE_SEGMENTS += verify, shorts, topics; Home prefixes += /shorts, /topics; Skills prefixes += /verify
- artifacts/api-server/src/services/community-input.ts RESERVED_HANDLES += verify, shorts, topics (only after the operator handle query returns no rows)
- tests/navigation.test.ts ownership map and tests/site-addresses.test.ts: add every new page and segment
- artifacts/proofstack/lib/security.ts: append directives returned by mediaCspSources() when non-empty
- tests/api.test.ts: add every new POST path to the cross-site loop and every private GET to the forged-identity loop
- package.json (root): script test:core-only; artifacts/proofstack/package.json: dependency hls.js
- .env.example: MEDIA_ORIGIN, VIDEO_ORIGIN, VIDEO_UPLOAD_ORIGIN (web)

**Acceptance**

- Each stub POST answers 403 CSRF_REJECTED cross-site and 503 FEATURE_UNAVAILABLE otherwise (test mounts each stub on a test app)
- mediaCspSources returns nothing with no origins (existing exact-string CSP tests pass unchanged); with origins the four directives match section 13.4; a malformed origin throws
- Header test on the built config: /assessments/take/x and /assessments/device-check carry camera=(self), microphone=(self), fullscreen=(self) and still carry nosniff, Referrer-Policy, HSTS and X-Frame-Options; /home keeps camera=(), microphone=(); real-browser check on the Cloudflare runtime recorded, with the proxy.ts fallback applied if the later header entry does not win
- Header, footer and bottom tabs render nothing on exam paths (static render)
- safeAuthReturn accepts the paths in section 13.2 and still rejects queries, hashes and foreign paths; its coverage gate holds
- vitest.core-only.config.ts runs *.core-only.test.ts against a database with migrations 0000-0021 only

**Security checks**

- Stubs perform no database work and return no data
- Camera and microphone are allowed on the two exam paths only and for self only
- Signed-out and cross-site callers are refused on every stub POST

#### DB-2: Migration 0023_media_social

Wave 1. Layer: database. Depends on: DB-1.

Fill lib/db/src/modules/media.ts and social.ts and generate migration 0023 (14 tables, section 3.4): media objects, uploads, renditions, provider cleanup outbox, and the social and moderation side tables. No existing table changes.

**Owns**

- `lib/db/src/modules/media.ts`
- `lib/db/src/modules/social.ts`
- `lib/db/drizzle/0023_media_social.sql`
- `lib/db/drizzle/meta/0023_snapshot.json`
- `lib/db/drizzle/meta/_journal.json`
- `artifacts/api-server/src/services/export-policy.ts`
- `tests/modules-media-social.integration.test.ts`

**Shared-file edits (integrator)**

- tests/preflight-schema.integration.test.ts and tests/asset-cleanup.integration.test.ts: table count 66 -> 80

**Acceptance**

- Migration runs twice cleanly on PostgreSQL 17 and replays under PGlite; journal test passes; 80 public tables
- Constraint tests: content media (purpose question or anchor) must have owner_id NULL and personal media must have an owner; object_path must match /objects/ready/{uuid}; one media per post position; one routine per author per day; one active restriction per target; blocker cannot equal blocked
- DELETE FROM users succeeds for a user with rows in every table of this migration and leaves content media untouched
- Export-policy entries exist for every users FK added here (catalog test from FND-1 passes once integrated)

**Security checks**

- media_cleanup_jobs has no foreign keys so it survives cascades
- community_blocks.blocked_id and content_reports.reporter_id are classified so one person's export never contains another person's block or report
- No users FK is NO ACTION or RESTRICT

#### FND-1: Module readiness, skill crypto key ring and fail-closed account export

Wave 1. Layer: foundation. Depends on: DB-1.

Per-module readiness (cached column check, moduleGuard, moduleReadySync, modulesWarm) with env feature flags; the skill key ring (AES-GCM sealing with key ids, ledger pseudonyms, attempt credential MAC, media tickets); account export driven by the policy registry, extending the existing NOT_EXPORTED_NESTED redaction instead of adding a second mechanism.

**Owns**

- `artifacts/api-server/src/services/module-ready.ts`
- `artifacts/api-server/src/middlewares/module-guard.ts`
- `artifacts/api-server/src/lib/skill-crypto.ts`
- `artifacts/api-server/src/services/account-data.ts`
- `tests/module-ready.test.ts`
- `tests/module-ready.integration.test.ts`
- `tests/skill-crypto.test.ts`
- `tests/fixtures/ticket-vectors.json`
- `tests/export-policy.integration.test.ts`
- `tests/core-without-modules.core-only.test.ts`

**Shared-file edits (integrator)**

- artifacts/api-server/src/app.ts: app.use("/api", modulesWarm) directly after schemaGuard
- .env.example: SKILL_KEY_RING, LEDGER_PSEUDONYM_SECRET, MEDIA_TICKET_SECRET and the *_ENABLED area flags (all blank or false)

**Acceptance**

- Module absent: moduleGuard answers 503 FEATURE_UNAVAILABLE and moduleReadySync is false; present with its flag on: passes; an empty module is never ready; ready cached 300 s, not ready 5 s
- seal/unseal round-trips and stores key_id; a value sealed under a retired ring entry still opens; an unknown key_id fails closed; short ring secrets are rejected
- Attempt credential and media ticket: valid verifies with no database work; forged, expired, wrong audience, wrong attempt and wrong part fail; comparison is timing-safe; vectors written to tests/fixtures/ticket-vectors.json
- Catalog-driven export test fails when any users FK from 0022 onward lacks a policy entry; actor columns export nothing; an open legacy attempt still exports without correctOptionId
- Core-only run: auth context, notification list, feed, export and erase succeed with every module table absent

**Security checks**

- A staff member's export contains no row reachable only through an actor column (granted_by, grader_id and similar)
- Secrets, tickets and sealed values never appear in logs or error messages (captured-log test)
- With SKILL_KEY_RING unset, dependent areas report unavailable; the API still starts

#### DB-3: Migration 0024_skill_content

Wave 2. Layer: database. Depends on: DB-2.

Fill lib/db/src/modules/skills-content.ts and generate migration 0024 (21 tables, section 3.5): templates, series, tests, versions, sections, slots, frozen slot items, pools, questions, versions, sealed keys, question media, rubric families and versions, anchor sets and anchors, reviews, content-access records, item statistics and item rulings.

**Owns**

- `lib/db/src/modules/skills-content.ts`
- `lib/db/drizzle/0024_skill_content.sql`
- `lib/db/drizzle/meta/0024_snapshot.json`
- `lib/db/drizzle/meta/_journal.json`
- `artifacts/api-server/src/services/export-policy.ts`
- `tests/modules-skills-content.integration.test.ts`

**Shared-file edits (integrator)**

- tests/preflight-schema.integration.test.ts and tests/asset-cleanup.integration.test.ts: table count 80 -> 101

**Acceptance**

- Migration runs twice cleanly on PostgreSQL 17 and replays under PGlite; 101 public tables
- Constraint tests: a pool slot without topic, difficulty and format is rejected; a scored slot with zero points is rejected; a second published version of one test is rejected; a published version with a pass mark but no approved standard is rejected; platform slug unique, organisation slug unique per organisation; objective question with a rubric family is rejected
- Deleting a question version referenced by skill_slot_items fails (RESTRICT); deleting an organisation sets owner_org_id NULL and keeps its content rows
- DELETE FROM users succeeds for an author, reviewer and publisher with rows in every table here (actor columns become NULL)

**Security checks**

- skill_question_keys, skill_anchors, skill_anchor_sets and skill_item_stats have no foreign key to users
- Key, rubric-criteria and anchor columns are text columns for sealed values only; no plaintext key column exists
- skill_content_access.user_id is CASCADE and exported as the member's own record only

#### LEDGER-1: Tamper-evident ledger, signed checkpoints and verification script

Wave 2. Layer: trust. Depends on: DB-1, FND-1.

appendLedger (per-chain advisory lock, hash chain, payload allow-list, HMAC pseudonym actors) used inside the caller's transaction; daily signed Merkle checkpoint written to the object-locked anchor bucket as a work handler; scripts/verify-ledger.mjs; a per-attempt verify function for the candidate view.

**Owns**

- `artifacts/api-server/src/services/ledger.ts`
- `artifacts/api-server/src/services/ledger-checkpoint.ts`
- `artifacts/api-server/src/services/work/ledger-checkpoint.ts`
- `artifacts/api-server/scripts/verify-ledger.mjs`
- `tests/ledger.test.ts`
- `tests/ledger.integration.test.ts`

**Shared-file edits (integrator)**

- artifacts/api-server/package.json: script ledger:verify
- .env.example: LEDGER_SIGNING_KEY, LEDGER_SIGNING_KEY_ID, LEDGER_ANCHOR_DIR, LEDGER_ANCHOR_ACCESS_KEY_ID, LEDGER_ANCHOR_SECRET_ACCESS_KEY

**Acceptance**

- 20 concurrent appends to one chain on PostgreSQL 17 produce gapless seq and a valid chain
- A tampered payload, a deleted row and two swapped rows each make verification fail and name the chain
- A checkpoint's Merkle root and Ed25519 signature verify with the published key; verification still passes after a user with attempt chains is deleted
- Payload validator accepts only allow-listed keys holding ids, digests, codes and numbers; strings over 128 characters are refused
- With no signing key the checkpoint job reports not configured and appends still work

**Security checks**

- actor_ref is always an HMAC pseudonym; a test asserts no users.id value ever appears in skill_ledger
- Ledger rows are written only through appendLedger; no other module issues INSERT INTO skill_ledger (source scan)
- The verify script is read-only and never prints payloads

#### JOBS-1: Work queue, worker process, embedded drain, mailer and mail hook

Wave 2. Layer: platform. Depends on: DB-1, FND-1.

Leased queue over work_jobs (SKIP LOCKED, lease compare-and-set, provider_started_at guard), a handler dispatcher that loads services/work/{kind}.ts by convention, the standalone worker entry and the on-demand embedded drain, the transactional mailer (off until configured) with a suppression list, the retention dispatcher that loads services/retention/{area}.ts, and the signed bounce hook that arrives through the web tier.

**Owns**

- `artifacts/api-server/src/services/work-queue.ts`
- `artifacts/api-server/src/services/work-handlers.ts`
- `artifacts/api-server/src/services/work-embedded.ts`
- `artifacts/api-server/src/work-worker.ts`
- `artifacts/api-server/src/services/mailer.ts`
- `artifacts/api-server/src/services/work/mail.ts`
- `artifacts/api-server/src/services/work/retention.ts`
- `artifacts/api-server/src/routes/mail-hooks.ts`
- `artifacts/api-server/src/services/operations.ts`
- `tests/work-queue.integration.test.ts`
- `tests/mailer.test.ts`
- `tests/mail-hook.test.ts`

**Shared-file edits (integrator)**

- artifacts/api-server/build.mjs: entry src/work-worker.ts; artifacts/api-server/package.json: script worker:work
- .env.example and render.yaml comments: MAIL_API_KEY, MAIL_FROM, MAIL_WEBHOOK_SECRET, EMBEDDED_WORKERS value work

**Acceptance**

- Claim uses SKIP LOCKED; an expired lease is reclaimed; completion is compare-and-set on the lease; a job whose provider_started_at is set is never retried automatically
- A kind with no handler module stays queued with HANDLER_UNAVAILABLE and backoff; the embedded drain works with no worker process
- Mail is skipped when unconfigured, opted out or suppressed, and templates carry a link only, never a score or answer
- Mail hook rejects a bad signature, a timestamp older than 5 minutes and a replayed event (hook_receipts)
- The heartbeat service name is a parameter and the existing intelligence report is unchanged

**Security checks**

- Recipient addresses live only in work_jobs.sealed_payload and never in logs
- DIRECT_PATHS in lib/client-ip.ts is unchanged (asserted); the hook is reachable only through the web tier
- MAINTENANCE_MODE pauses new claims

#### AI-1: AI provider layer, prompt registry, money budgets and usage records

Wave 2. Layer: ai. Depends on: DB-1, FND-1.

services/ai: typed task wrapper over the existing OpenAI-compatible client (dynamic import, explicit timeouts, no retries, JSON output validated by zod), per-task model selection from env, versioned prompt registry loaded from services/ai/prompts/{name}.ts, reserve-then-settle budgets in micro-USD, usage rows, and input sanitising (per-request random delimiter, delimiter stripping, Unicode normalisation).

**Owns**

- `artifacts/api-server/src/services/ai/provider.ts`
- `artifacts/api-server/src/services/ai/prompts.ts`
- `artifacts/api-server/src/services/ai/budget.ts`
- `artifacts/api-server/src/services/ai/usage.ts`
- `artifacts/api-server/src/services/ai/sanitize.ts`
- `tests/ai-layer.test.ts`
- `tests/ai-budget.integration.test.ts`

**Shared-file edits (integrator)**

- .env.example: AI_MODEL_GRADING, AI_MODEL_INTERVIEW, AI_MODEL_TRANSCRIBE, AI_MODEL_SPEECH, AI_MODEL_DRAFTING, AI_MODEL_MODERATION, AI_RATE_*_MICROS, AI_BUDGET_GLOBAL_DAILY_MICROS

**Acceptance**

- With no key or no model for a task, aiEnabled(task) is false and callers get 503 FEATURE_NOT_CONFIGURED; the API bundle boots with no AI env set
- 20 concurrent reservations on PostgreSQL 17 never exceed a limit; settle records ok, failed or unknown; an unknown outcome keeps its reservation as spent
- Model output that fails the zod schema is rejected and recorded as failed
- Sanitiser wraps candidate text in a random per-request delimiter, strips occurrences of it, normalises to NFKC and removes control characters
- Usage metadata keys are inputUnits and outputUnits and pass the audit metadata schema

**Security checks**

- The wrapper accepts only typed task inputs; there is no free metadata field through which a name, handle, email or organisation could be sent
- Prompts and model outputs are never logged
- A budget refusal is returned before any provider call is made (asserted on the mocked client)

#### MEDIA-2: Media Worker: ticketed multipart upload and range playback

Wave 2. Layer: media. Depends on: FND-1.

New Cloudflare Worker artifacts/media on its own origin with separate bindings for the evidence and social buckets. It creates, receives and completes multipart uploads itself, returns signed per-part and completion receipts with SHA-256 digests, accepts single-PUT audio, and serves ticketed range playback bound to the first presenter through a Durable Object. It has no database and no session knowledge.

**Owns**

- `artifacts/media/src/**`
- `artifacts/media/wrangler.jsonc`
- `artifacts/media/tsconfig.json`
- `artifacts/media/tests/**`

**Shared-file edits (integrator)**

- Create artifacts/media/package.json (wrangler, vitest, workers types) and refresh pnpm-lock.yaml
- Root lint, format and typecheck scripts in package.json: include artifacts/media

**Acceptance**

- Ticket vectors from tests/fixtures/ticket-vectors.json verify; missing, expired, wrong-audience and wrong-part tickets are refused
- A Content-Length above the ticket maximum is refused before the body is read
- create, parts, complete returns a signed receipt with per-part sha256, bytes, Worker time and a manifest digest; completing after a part was overwritten fails
- Playback honours Range with 206, sends the ticket's content type, nosniff, Content-Security-Policy default-src 'none'; sandbox, private no-store and no-referrer
- A playback ticket presented from a second browser after first use is refused (TicketGate)
- CORS allows only the site origin, without credentials

**Security checks**

- A social-bucket ticket cannot address the evidence bucket and the reverse
- Object names are validated against {namespace}/ready/{uuid} and are never taken from the request path alone
- Tickets, query strings and object names are never logged

#### DB-4: Migration 0025_distribution

Wave 3. Layer: database. Depends on: DB-3.

Fill lib/db/src/modules/distribution.ts and generate migration 0025 (9 tables, section 3.6): cohorts, enrolments with hashed single-use invite tokens, sharing grants, assignments, assignment candidates, accommodations, sittings, sitting admit list and job checks.

**Owns**

- `lib/db/src/modules/distribution.ts`
- `lib/db/drizzle/0025_distribution.sql`
- `lib/db/drizzle/meta/0025_snapshot.json`
- `lib/db/drizzle/meta/_journal.json`
- `artifacts/api-server/src/services/export-policy.ts`
- `tests/modules-distribution.integration.test.ts`

**Shared-file edits (integrator)**

- tests/preflight-schema.integration.test.ts and tests/asset-cleanup.integration.test.ts: table count 101 -> 110

**Acceptance**

- Migration runs twice cleanly on PostgreSQL 17 and replays under PGlite; 110 public tables
- Constraint tests: a common-paper assignment that is neither supervised nor has a start window of 5 to 15 minutes is rejected; closes_at must follow opens_at; a hosted job check needs a version and an external one needs an https URL; a sharing grant can be re-granted after revocation (partial unique index) with history kept; an active accommodation needs approved_at
- DELETE FROM users succeeds for a student and for a staff member with rows in every table here

**Security checks**

- edu_enrollments stores email_digest plus a sealed address column only; no plaintext email column exists
- skill_accommodations has no reason or medical column
- No users FK is NO ACTION or RESTRICT

#### PLAT-1: Platform access API: grants, organisation verification, member grants, entitlements

Wave 3. Layer: api. Depends on: DB-1, FND-1, LEDGER-1, JOBS-1.

/api/platform views and actions (section 12.2): capability grants and revocation, organisation type and verification with domain proof, per-member organisation grants, entitlements with atomic seat consumption, requirePlatformCapability and orgCapability helpers, privileged-session extension guarded by module readiness, user search, capabilities and features on the auth context, and the host-confirmed first-super-admin script.

**Owns**

- `artifacts/api-server/src/services/platform-*.ts`
- `artifacts/api-server/src/routes/platform.ts`
- `artifacts/api-server/src/services/auth-sessions.ts`
- `artifacts/api-server/src/services/auth-account.ts`
- `artifacts/api-server/src/routes/auth.ts`
- `artifacts/api-server/scripts/bootstrap-admin.mjs`
- `artifacts/api-server/scripts/grant-owner-capabilities.mjs`
- `tests/platform-access.integration.test.ts`
- `tests/platform-policy.test.ts`
- `tests/platform-seats.integration.test.ts`
- `tests/platform-session.core-only.test.ts`

**Shared-file edits (integrator)**

- lib/api-spec/platform.yaml: views and per-action request schemas of section 12.2; lib/api-spec/openapi.yaml: AuthContext gains capabilities (string array) and features (booleans); regenerate clients
- artifacts/api-server/package.json: script owner:capabilities
- .env.example: BOOTSTRAP_TARGET_HOST

**Acceptance**

- Only a super admin with step-up can grant; the target must hold a verified factor; a self-grant is refused by the API and by the CHECK; revoke ends the target's sessions in the same transaction
- Every grant, verification and entitlement change writes an audit row with organizationId and a real resourceType and an access-chain ledger entry
- A holder of any platform grant or organisation member grant has a privileged session (MFA forced); with the platform module absent readSession behaves exactly as today (core-only test)
- orgCapability decision table: owner, admin, member with grant, member without grant, member of another organisation, suspended organisation
- 50 concurrent seat claims on 10 seats give exactly 10 on PostgreSQL 17; one member consumes one seat per entitlement
- Verification needs domain proof (DNS TXT or mailbox code) and a unique verified legal name; the bootstrap script is host-confirmed, refuses when a super admin exists, requires target MFA and is audited

**Security checks**

- admin, moderator and a super admin without a grant get 403 on every capability-gated call
- An unverified or suspended organisation is refused for assigning, hosting and reading results
- Moderators see masked email in user search; unknown or forged fields are rejected with 400
- Signed-out callers get 401 and cross-site POSTs 403 on every action

#### MEDIA-1: Media core API: reservations, tickets, completion, playback, image ingest, cleanup and erasure

Wave 3. Layer: api. Depends on: DB-2, FND-1, JOBS-1.

/api/media (section 12.6 except the provider hook): per-purpose reservation with byte quotas, single-purpose upload tickets, completion that verifies the Worker receipt and performs an independent HEAD with bucket-scoped credentials, playback tickets authorised in SQL from the referencing row, image ingest through the existing re-encode boundary with stored dimensions, the cleanup-worker fix (delete the media row after the object), and the erase step that queues every object and provider asset.

**Owns**

- `artifacts/api-server/src/services/media-*.ts`
- `artifacts/api-server/src/routes/media.ts`
- `artifacts/api-server/src/lib/objectStorage.ts`
- `artifacts/api-server/src/services/asset-cleanup-worker.ts`
- `artifacts/api-server/src/services/asset-cleanup-storage.ts`
- `artifacts/api-server/src/services/image-canonical.ts`
- `artifacts/api-server/src/services/account-data.ts`
- `tests/media-core.integration.test.ts`
- `tests/media-policy.test.ts`
- `tests/media-cleanup.integration.test.ts`
- `tests/media-erase.core-only.test.ts`

**Shared-file edits (integrator)**

- lib/api-spec/media.yaml: views and per-action schemas of section 12.6; regenerate clients
- .env.example: EVIDENCE_OBJECT_DIR, EVIDENCE_R2_ACCESS_KEY_ID, EVIDENCE_R2_SECRET_ACCESS_KEY, MEDIA_ORIGIN; ASSET_CLEANUP_ALLOWED_NAMESPACES note for the evidence namespace

**Acceptance**

- Reserve enforces purpose authorisation, per-purpose limits and the byte quota atomically; concurrent reservations cannot exceed the quota
- Part tickets name one media id, one part number, a maximum byte count and expire within 10 minutes; completion rejects a bad receipt MAC and a HEAD size or etag mismatch
- Playback-ticket authority is computed in SQL for each purpose; tickets last at most 5 minutes; each mint writes an audit row with the task or case id
- Image ingest stores width, height and thumbhash
- Cleanup: after the object is deleted the media_objects or media_renditions row in state deleting is gone and the owner's quota is released; the community_assets path is unchanged
- eraseAccount queues every R2 object and provider asset before the cascade, and still works with the media module absent (core-only test)

**Security checks**

- A stranger, another tenant or a grader without a claimed task gets 404 for reserve, playback ticket and GET
- Media that is not ready or not scanned clean never receives a playback ticket
- Evidence credentials differ from social and Git credentials; cleanup refuses a namespace outside the allow-list
- Upload bodies are authenticated, rate-limited and size-checked before they are read

#### DB-5: Migration 0026_skill_attempts

Wave 4. Layer: database. Depends on: DB-4.

Fill lib/db/src/modules/skills-attempts.ts and generate migration 0026 (12 tables, section 3.7): attempts with denormalised issuer and context, draw records with sealed seeds, attempt sections and items with frozen body snapshots, sealed per-attempt keys, responses, response media, integrity events and cases, incidents, interview sessions and turns.

**Owns**

- `lib/db/src/modules/skills-attempts.ts`
- `lib/db/drizzle/0026_skill_attempts.sql`
- `lib/db/drizzle/meta/0026_snapshot.json`
- `lib/db/drizzle/meta/_journal.json`
- `artifacts/api-server/src/services/export-policy.ts`
- `tests/modules-skills-attempts.integration.test.ts`

**Shared-file edits (integrator)**

- tests/preflight-schema.integration.test.ts and tests/asset-cleanup.integration.test.ts: table count 110 -> 122

**Acceptance**

- Migration runs twice cleanly on PostgreSQL 17 and replays under PGlite; 122 public tables
- A second in-progress attempt for the same user and test fails with 23505; in_progress and submitted_at are mutually exclusive; extra_seconds above 3600 is rejected; an incident must name exactly one of assignment, sitting or attempt
- Deleting an organisation leaves attempts with issuer_kind, issuer_name and meta intact and issuer_org_id NULL
- DELETE FROM users succeeds for a candidate with rows in every table here; the attempt's ledger chain rows remain

**Security checks**

- skill_attempt_draws and skill_attempt_item_keys have no foreign key to users and hold sealed values only
- Export policy for skill_attempts lists columns explicitly and excludes refs, lease and counters
- skill_integrity_events stores no content fields (detail capped at 2048 bytes)

#### AUTH-1: Authoring API I: content schemas, question bank, sealed keys, rubric families, anchors, pools

Wave 4. Layer: api. Depends on: DB-3, FND-1, LEDGER-1, PLAT-1, MEDIA-1.

The canonical zod content file shared by API, engine, graders and web; the single key-reader module (seal, unseal, audit, content-access record); question, rubric-family, anchor-set and pool services; the authoring router and dispatcher with stub handlers for the version actions that AUTH-2 fills; tenant scoping for platform and organisation content.

**Owns**

- `artifacts/api-server/src/services/skills-content.ts`
- `artifacts/api-server/src/services/skills-keys.ts`
- `artifacts/api-server/src/services/skills-authoring-policy.ts`
- `artifacts/api-server/src/services/skills-question-*.ts`
- `artifacts/api-server/src/services/skills-rubric-*.ts`
- `artifacts/api-server/src/services/skills-anchor-*.ts`
- `artifacts/api-server/src/services/skills-pool-*.ts`
- `artifacts/api-server/src/services/skills-authoring-version-actions.ts`
- `artifacts/api-server/src/routes/skills-authoring.ts`
- `tests/skills-content.test.ts`
- `tests/skills-authoring-bank.integration.test.ts`
- `tests/skills-keys.test.ts`

**Shared-file edits (integrator)**

- lib/api-spec/skills-authoring.yaml: bank views and actions of section 12.3; regenerate clients
- eslint.config.mjs: no-restricted-imports rule allowing skills-keys to be imported only by the server modules listed in section 5.7

**Acceptance**

- Table-driven tests: each of the six formats accepts valid and rejects invalid body and key shapes
- Keys, rubric criteria and anchors are sealed at rest (stored rows contain no plaintext) and round-trip with key_id
- Editing an approved version creates the next draft; approval by the same person is refused except the labelled single_approver path for a one-author organisation
- An author reads keys only for drafts they created or were shared; each key read writes an audit row and a skill_content_access row
- Tenant matrix for every view and action: platform, organisation A, organisation B; a foreign id or slug gives 404
- Anchor sets attach to the rubric family and serve every question variant of that family
- Source scan: no candidate-path, education, hiring or social file imports skills-keys

**Security checks**

- A holder of skills.author cannot approve or publish their own content
- Organisation scope needs a verified organisation, the skills.org_authoring entitlement and skills.organization.author
- Key reads are limited to 30 per minute and a daily distinct-version alert is raised
- Response scanner: no key, rubric-criteria or gold field appears in any view other than the key views

#### SOC-1: Social API: posts with media, topics, reposts, quotes, routines, blocks and feeds

Wave 4. Layer: api. Depends on: DB-2, MEDIA-1.

/api/social (section 12.8): post-create writing community_posts plus side tables in one transaction, repost, quote, routine, block, keyset feeds (discover, following, topic, shorts, media, routines), a new batched reader, and one visibility predicate (existing post rule, author profile visibility for visitors, active restriction, media ready and clear, blocks).

**Owns**

- `artifacts/api-server/src/services/social-*.ts`
- `artifacts/api-server/src/routes/social.ts`
- `tests/social.integration.test.ts`
- `tests/social-input.test.ts`

**Shared-file edits (integrator)**

- lib/api-spec/social.yaml: views and per-action schemas of section 12.8; regenerate clients

**Acceptance**

- Each post kind validates; at most 4 images or 1 video; media must be the caller's and ready; kind short is set by the server from measured duration and dimensions
- A post whose media is not ready and clear is visible to its author only; unscreened video is never shown to others on a timer
- Keyset paging is stable under concurrent inserts; a 21-item feed stays within a fixed query budget
- Signed-out viewers never receive posts or author cards of members-only profiles; a restricted post is absent from every view; blocks hide both ways and stop quotes and reposts
- One routine per author per day; repost is an idempotent toggle; hashtags normalise into community_topics; a blocked topic gives 404
- With the social module absent the existing /api/community feed is unchanged

**Security checks**

- Attaching another member's media is refused
- A suspended author (content_suspensions) cannot create posts
- Unknown or forged fields are rejected; signed-out POST 401; cross-site POST 403

#### MOD-1: Moderation API and restriction enforcement in existing read paths

Wave 4. Layer: api. Depends on: DB-2, LEDGER-1, MEDIA-1, JOBS-1.

/api/moderation (section 12.9): reports with deadlines by reason, queue, hide, remove, lift and suspend as reversible restriction rows (never delete and re-insert), ledger and audit entries, author notice. Extends postReadWhere, the event feed and notification reads so an active restriction hides content in every existing path, applied only when the social module is ready.

**Owns**

- `artifacts/api-server/src/services/moderation-*.ts`
- `artifacts/api-server/src/routes/moderation.ts`
- `artifacts/api-server/src/services/community-policy.ts`
- `artifacts/api-server/src/services/community-reader.ts`
- `artifacts/api-server/src/services/community-query.ts`
- `artifacts/api-server/src/services/community-social-actions.ts`
- `tests/moderation.integration.test.ts`
- `tests/moderation-readpaths.integration.test.ts`
- `tests/moderation-readpaths.core-only.test.ts`

**Shared-file edits (integrator)**

- lib/api-spec/moderation.yaml: views and per-action schemas of section 12.9; regenerate clients

**Acceptance**

- A hidden or removed post disappears from the feed, post view, search, notifications, the event feed, reactions and comments for everyone but the author and moderators; lifting restores it with comments, reactions and bookmarks intact
- Deadlines: 24 hours for child_safety and sexual, 36 hours for illegal, 72 hours otherwise
- Remove queues media deletion after the retention period and disables the provider asset; three removals in 90 days create a 7-day posting suspension
- Every postReadWhere and notificationReadWhere use is evaluated at call time, not import time
- Core-only test: with the social module absent every existing community read and notify() behaves exactly as today

**Security checks**

- Only moderator, admin and super_admin act, with step-up for remove; a member cannot restrict or lift
- One open report per reporter per target; 20 reports per day
- Reporter identity is never shown to the reported author

#### MEDIA-3: Hosted video provider: direct upload, signed playback, webhook, reconcile and provider cleanup

Wave 4. Layer: media. Depends on: DB-2, MEDIA-1, JOBS-1.

MediaProvider adapter in one file (reserve, status, playback token, disable, remove, verifyWebhook) for social video; POST /api/media/hooks/video behind the web tier with signature over raw bytes, replay window and receipts; signed playback for every hosted video; reconcile and provider-delete work handlers; the hook rate class in the global limiter.

**Owns**

- `artifacts/api-server/src/services/media-video.ts`
- `artifacts/api-server/src/services/media-provider.ts`
- `artifacts/api-server/src/routes/media-hooks.ts`
- `artifacts/api-server/src/services/work/media-reconcile.ts`
- `artifacts/api-server/src/services/work/provider-delete.ts`
- `artifacts/api-server/src/middlewares/rate-limit.ts`
- `tests/media-video.integration.test.ts`
- `tests/media-hook.test.ts`
- `tests/rate-limit-hook-class.test.ts`

**Shared-file edits (integrator)**

- .env.example: VIDEO_PROVIDER_ACCOUNT_ID, VIDEO_PROVIDER_API_TOKEN, VIDEO_SIGNING_KEY_ID, VIDEO_SIGNING_KEY, VIDEO_WEBHOOK_SECRET, SOCIAL_VIDEO_ENABLED

**Acceptance**

- Reservation creates a direct upload with maximum duration, size cap and signed playback required; daily and total quotas enforced
- Webhook: bad signature, timestamp outside 5 minutes and a replay are refused; a video becomes ready only from a verified event or from reconcile
- Playback tokens last 1 hour for public posts and 5 minutes for members-only; none is minted for held, removed or blocked media
- Reconcile marks stuck processing rows and deletes provider assets that have no row; provider-delete drains media_cleanup_jobs with backoff
- Hook paths use a per-address hook bucket of 600 per minute and all other paths are unchanged
- Provider request and webhook shapes confirmed against current documentation and recorded; with no keys every action answers 503 FEATURE_NOT_CONFIGURED

**Security checks**

- DIRECT_PATHS is unchanged; the hook works only through the web tier
- No untrusted video is parsed on ProofStack servers
- Provider error text is never stored or returned

#### DB-6: Migration 0027_skill_grading

Wave 5. Layer: database. Depends on: DB-5.

Fill lib/db/src/modules/skills-grading.ts and generate migration 0027 (9 tables, section 3.8): grading tasks that reference an attempt item or an anchor, grades, item scores, versioned results with denormalised issuer, credentials, appeals, calibrations, sanctions and application credentials.

**Owns**

- `lib/db/src/modules/skills-grading.ts`
- `lib/db/drizzle/0027_skill_grading.sql`
- `lib/db/drizzle/meta/0027_snapshot.json`
- `lib/db/drizzle/meta/_journal.json`
- `artifacts/api-server/src/services/export-policy.ts`
- `tests/modules-skills-grading.integration.test.ts`

**Shared-file edits (integrator)**

- tests/preflight-schema.integration.test.ts and tests/asset-cleanup.integration.test.ts: table count 122 -> 131

**Acceptance**

- Migration runs twice cleanly on PostgreSQL 17 and replays under PGlite; 131 public tables
- A task must reference exactly one of attempt item or anchor; one anchor can be issued to many graders; one task per attempt item, pass and round; one final result per attempt; total cannot exceed max
- Deleting an organisation keeps grading tasks, grades and results (pool_org_id and issuer_org_id become NULL, issuer_kind and issuer_name remain)
- DELETE FROM users succeeds for a candidate and, separately, for a grader (grader_id becomes NULL, the grade row remains)

**Security checks**

- skill_grading_tasks.grader_id, skill_appeals.assigned_to and decided_by are actor columns excluded from export
- skill_sanctions stores keyed digests only and is purged at ends_at
- blind_ref is random and unrelated to any identifier a candidate can see

#### AUTH-2: Authoring API II: tests, versions, templates, import, review, publish, rulings

Wave 5. Layer: api. Depends on: AUTH-1, AI-1, LEDGER-1, DB-3.

Version actions behind the AUTH-1 dispatcher: series and tests, structure save, twelve built-in templates and saved templates, 500-row import with dry run and all-or-nothing commit, AI drafting, review with version diff, the publish validator and transaction (freeze slot items, digest, ledger), retire, item-ruling proposal and second-person approval, and the idempotent legacy-check import script.

**Owns**

- `artifacts/api-server/src/services/skills-test-*.ts`
- `artifacts/api-server/src/services/skills-publish.ts`
- `artifacts/api-server/src/services/skills-templates/**`
- `artifacts/api-server/src/services/skills-import.ts`
- `artifacts/api-server/src/services/skills-ai-draft.ts`
- `artifacts/api-server/src/services/skills-rulings.ts`
- `artifacts/api-server/src/services/skills-authoring-version-actions.ts`
- `artifacts/api-server/src/services/ai/prompts/drafting.ts`
- `artifacts/api-server/scripts/import-legacy-checks.mjs`
- `tests/skills-publish.integration.test.ts`
- `tests/skills-import.test.ts`
- `tests/skills-templates.test.ts`
- `tests/skills-rulings.integration.test.ts`

**Shared-file edits (integrator)**

- lib/api-spec/skills-authoring.yaml: version, template, import, review, publish and ruling actions of section 12.3; regenerate clients
- artifacts/api-server/package.json: script skills:import-legacy

**Acceptance**

- The publish validator refuses each defect in section 4.6 with a distinct code (pool depth, uncalibrated item in a scored pool slot, item outside its difficulty band, missing rubric, missing standard sign-off, AI reader without a passing gate, timers that do not fit)
- Publish freezes skill_slot_items, computes a digest that is stable across runs and changes with any content change, retires the previous version and appends a content ledger entry
- An author or editor of the version cannot publish it; the single-approver path needs the break-glass grant, a typed reason, and marks approval_mode single_approver
- A published version cannot be changed through any action; New version deep-copies
- Import of 500 mixed rows in each of the three formats commits atomically and reports per-row errors in the dry run
- Each built-in template yields a draft that passes the validator once its slots are filled; AI drafts stay drafts until a different person approves them
- A ruling needs a proposer and a different approver; the legacy import is idempotent

**Security checks**

- Publish, retire and ruling approval need skills.publisher and step-up; an organisation cannot touch platform content and the reverse
- Import and AI-draft are rate-limited and never create approved content
- An organisation author cannot read platform templates' sealed content or another organisation's saved templates

#### EDU-1: Education API I: cohorts, roster import, invitations, join codes, enrolment

Wave 5. Layer: api. Depends on: DB-4, PLAT-1, JOBS-1, FND-1.

/api/education cohort and enrolment views and actions (section 12.5): cohort CRUD, one step-up-protected roster import of up to 5,000 rows with dry run, sealed invite addresses with keyed digests and 256-bit hashed single-use tokens, mail jobs, join codes, verified-email acceptance, approval, leave, plus the education router with a stub handler file for EDU-2 and the invite retention step.

**Owns**

- `artifacts/api-server/src/services/education-cohort-*.ts`
- `artifacts/api-server/src/services/education-enrollment-*.ts`
- `artifacts/api-server/src/services/education-policy.ts`
- `artifacts/api-server/src/services/education-assignment-actions.ts`
- `artifacts/api-server/src/routes/education.ts`
- `artifacts/api-server/src/services/retention/invites.ts`
- `tests/education-cohorts.integration.test.ts`
- `tests/education-input.test.ts`

**Shared-file edits (integrator)**

- lib/api-spec/education.yaml: cohort and enrolment views and actions of section 12.5; regenerate clients

**Acceptance**

- Only a verified college with education.cohort.manage manages cohorts; the import is one request, one step-up, with a per-row dry-run report and de-duplication by email digest
- An invite is redeemable once, before expiry, only by an account whose verified email equals the invited address; the sealed address and token hash are cleared on acceptance, decline and expiry
- The response to staff is identical whether or not the address has an account; every invite mail states the 18+ requirement
- Join codes are 12 characters (60 bits), stored hashed, rotatable, limited to 5 attempts per 10 minutes per account and 20 per network, with approval on by default
- A student sees only their own enrolment and can leave; staff of another organisation get 404; caps of 200 cohorts, 5,000 enrolments and 5,000 invites per day hold

**Security checks**

- A student cannot read the roster or any organisation content through enrolment
- An unverified or suspended organisation is refused
- A forwarded invite link fails for a different verified email
- Roster import without fresh step-up is refused with MFA_STEP_UP_REQUIRED

#### WEB-SOCIAL: Social web: composer, any-ratio media grid, lightbox, video player, Shorts, topics, report dialog

Wave 5. Layer: web. Depends on: SOC-1, MOD-1, MEDIA-3, WIRE-1.

Composer with media attach, topics and routine form; pure layoutMedia function and justified-rows grid that reserve space from stored dimensions; lightbox; HLS player loaded client-side; vertical Shorts player; topic pages; report and block dialogs; profile Media tab.

**Owns**

- `artifacts/proofstack/features/social/**`
- `artifacts/proofstack/features/media/**`
- `artifacts/proofstack/features/community/{post-card,post-dialog,feed-view,profile-view}.tsx`
- `artifacts/proofstack/app/shorts/**`
- `artifacts/proofstack/app/(community)/topics/**`
- `tests/social-ui.test.ts`
- `tests/media-layout.test.ts`

**Shared-file edits (integrator)**

- artifacts/proofstack/hooks/use-auth.ts: add the social and media query keys to the account-switch reset list

**Acceptance**

- layoutMedia unit tests for 1 to 4 items across 9:16, 4:5, 1:1, 16:9 and 21:9: true ratios kept, single items contained and never cropped, no layout shift
- Composer attaches up to 4 images or 1 video, requires alt text for images, shows upload progress and resumes after a simulated drop
- Shorts: only the visible item plays, the next one preloads, keyboard controls work, reduced motion disables autoplay, non-portrait video is contained
- Lightbox traps focus and closes on Escape; the report dialog submits once
- No provider name appears in visible copy; heavy modules load through client-only dynamic imports

**Security checks**

- Controls are disabled when the viewer cannot act; the server still decides
- Private query keys include the viewer id
- User text is rendered as text; no dangerouslySetInnerHTML

#### WEB-ADMIN: Owner-team consoles: access grants, organisation verification, entitlements, moderation queue

Wave 5. Layer: web. Depends on: PLAT-1, MOD-1, WIRE-1.

Admin pages under /account/admin for capability grants (with user search), organisation verification decisions, entitlement grants and the moderation queue, all with step-up retry and the house loading, error and empty states.

**Owns**

- `artifacts/proofstack/features/platform/**`
- `artifacts/proofstack/app/account/admin/{access,organizations,entitlements,moderation}/**`
- `tests/platform-ui.test.ts`

**Shared-file edits (integrator)**

- artifacts/proofstack/hooks/use-auth.ts: add the platform and moderation query keys to the reset list

**Acceptance**

- Each console renders only for the matching role or capability and shows a neutral gate otherwise
- Grant, revoke, verify and entitlement flows retry once after the step-up dialog
- The moderation queue performs each action with a required reason code and shows deadlines
- Loading, error, empty and data states are covered by static-render tests

**Security checks**

- Hiding a console grants nothing: tests call the API as a member and expect 403
- Moderators see masked email
- Private query keys include the viewer id

#### DB-7: Migration 0028_skill_guards and the cross-table erasure test

Wave 6. Layer: database. Depends on: DB-6.

Custom SQL migration with the immutability triggers of section 3.9 (direct UPDATE and DELETE blocked at trigger depth 0, cascades and SET NULL allowed, ledger always blocked), a guard-presence inspector for preflight, and the schema-lane test that erases a candidate, an author, a publisher and a grader with rows in every new table.

**Owns**

- `lib/db/drizzle/0028_skill_guards.sql`
- `lib/db/drizzle/meta/0028_snapshot.json`
- `lib/db/drizzle/meta/_journal.json`
- `artifacts/api-server/scripts/preflight-guards.mjs`
- `tests/skill-guards.integration.test.ts`
- `tests/skill-erasure.integration.test.ts`

**Shared-file edits (integrator)**

- If PGlite could not run the triggers in DB-1: tests/embedded-db.ts skips the journal tag 0028_skill_guards and the guard tests run only under pnpm test:all on PostgreSQL 17

**Acceptance**

- On PostgreSQL 17 a direct UPDATE or DELETE is refused on: approved question and rubric versions and their keys, structure rows of a published version, frozen slot items, attempt items, draws and keys, final responses, grades, results, applied rulings and the ledger
- Allowed transitions pass: approved to retired, published to retired, result state changes, credential visibility and revocation, interview turn correction from NULL
- DELETE FROM users succeeds for a candidate, an author, a publisher and a grader who each have rows in every one of the 77 new tables; actor columns become NULL and frozen rows are otherwise unchanged
- DELETE FROM organizations succeeds and leaves results, grades and content rows in place
- UPDATE, DELETE and TRUNCATE on skill_ledger are refused even from inside another trigger
- Table count stays 131; the preflight inspector reports every expected trigger

**Security checks**

- No trigger rejects a delete that arrives by cascade from users
- The guards cannot be bypassed by an application-role statement at depth 0 (tests run as the application role)
- The migration contains no extension and no CREATE INDEX CONCURRENTLY

#### ATT-1: Attempt engine: eligibility, seeded draw, per-attempt credential, autosave, sections, submit

Wave 6. Layer: api. Depends on: DB-5, DB-6, AUTH-2, PLAT-1, LEDGER-1, FND-1.

/api/skills candidate views and start/resume, plus the hot path /api/skills/attempts/:attemptId (section 12.4): eligibility including key-holder exclusion and sanctions in SQL, consent recording, content-digest re-verification, reproducible draw with a sealed random seed and a ledgered draw record, frozen item snapshots, the HttpOnly per-attempt cookie bound to the session row, liveness joined into every statement, batched sync, server timers and one-shot reveal, submit with receipt, unscored author preview attempts, and stub seams for finalisation, events, recording and result actions.

**Owns**

- `artifacts/api-server/src/services/skills-attempt-*.ts`
- `artifacts/api-server/src/services/skills-draw.ts`
- `artifacts/api-server/src/services/skills-consents.ts`
- `artifacts/api-server/src/services/skills-query.ts`
- `artifacts/api-server/src/services/skills-finalize.ts`
- `artifacts/api-server/src/services/skills-attempt-events.ts`
- `artifacts/api-server/src/services/skills-recording.ts`
- `artifacts/api-server/src/services/skills-result-actions.ts`
- `artifacts/api-server/src/routes/skills.ts`
- `artifacts/api-server/scripts/verify-attempt-draw.mjs`
- `tests/skills-attempt.integration.test.ts`
- `tests/skills-draw.test.ts`
- `tests/skills-attempt-credential.integration.test.ts`
- `tests/skills-attempt-concurrency.integration.test.ts`

**Shared-file edits (integrator)**

- lib/api-spec/skills.yaml: candidate views, start, resume and hot-path operations of section 12.4; regenerate clients
- artifacts/api-server/package.json: script skills:verify-draw

**Acceptance**

- Start refuses, each with its own code: missing consent, closed window, no attempts left, cooldown, no entitlement or seat, sanction, retired version, digest mismatch, and any caller who authored, reviewed, published or key-viewed a frozen question or graded or adjudicated an item of the test
- verify-attempt-draw re-derives the stored form from the sealed seed and draw record, including for an attempt started before a later retirement; a common paper is identical across candidates; seed commitment and form digest are returned at start
- Two concurrent starts create one attempt and seats never oversubscribe (PostgreSQL 17)
- Hot path: no identity-provider call and no row lock on sessions (asserted on a mock); a write after the deadline plus 5 seconds gives 409 ATTEMPT_CLOSED; an out-of-order seq is refused; a reload keeps working with no lease change
- A resume without the cookie rotates the lease, records lease_changed and locks the old browser with 409 ATTEMPT_MOVED; the sixth lease change is refused
- One-shot items return their body only after reveal-item and the server stamps revealed_at and answer_deadline_at
- Submit is idempotent and returns the same receipt; the deadline finalises without a client; the candidate view passes the response scanner

**Security checks**

- The credential cookie alone, from another machine without the bound session cookie, is refused and writes nothing to the attempt
- Another account gets 404 for an attempt id; no event is ever written for a caller not proven to own the attempt
- Revoking the session or disabling the user stops the next hot-path call
- Forged fields such as score, userId or deadline are rejected with 400; CSRF is required on every hot-path POST
- A preview attempt needs authoring rights on that content, is flagged context preview, consumes no seat and can never produce a result or credential

#### EDU-2: Education API II: assignments, accommodations, supervised sittings, incidents, release

Wave 6. Layer: api. Depends on: DB-4, EDU-1, PLAT-1, LEDGER-1.

Assignment actions behind the EDU-1 router: save, open (terms frozen), extend, cancel, candidate materialisation, paper-mode and start-window rules, grading-capacity check, accommodations with second approval above 25 percent, supervised sittings with rotating codes, invigilator admit list, venue network references, whole-sitting incident time, attestation and headcount reconciliation, manual release.

**Owns**

- `artifacts/api-server/src/services/education-assignment-*.ts`
- `artifacts/api-server/src/services/education-assignment-actions.ts`
- `artifacts/api-server/src/services/education-sitting-*.ts`
- `artifacts/api-server/src/services/education-accommodation-*.ts`
- `tests/education-assignments.integration.test.ts`
- `tests/education-sittings.integration.test.ts`
- `tests/education-accommodations.integration.test.ts`

**Shared-file edits (integrator)**

- lib/api-spec/education.yaml: assignment, accommodation and sitting views and actions of section 12.5; regenerate clients
- .env.example: SKILL_GRADING_MAX_OPEN_TASKS

**Acceptance**

- Opening needs a verified organisation, seats for a premium platform test and step-up; after opening, version, paper mode, share terms and attempt limit cannot be reduced
- A common paper is refused unless supervised or given a 5 to 15 minute start window; a platform test with human-graded items is refused with 409 GRADING_CAPACITY above the open-task ceiling
- Accommodation: step-up always; above 1.25 on a platform test it stays pending until a different staff member or a platform integrity reviewer approves; every grant is ledgered; no reason is stored
- Sitting codes rotate every 60 seconds and expire; a start needs a current code and an admit row written by the invigilator; a network digest outside the sitting's majority or allow-list raises a server signal
- Venue-fault time applies to the whole sitting, needs step-up, is capped at 30 minutes and is ledgered; attestation stores a digest and the invigilator pseudonym in the ledger; a headcount mismatch downgrades the sitting
- Later enrolments join an open assignment; declining is recorded

**Security checks**

- Staff cannot add time to selected students; per-candidate incident time is refused for organisation staff
- Staff of another organisation get 404 for every assignment, sitting and accommodation
- A student cannot open a sitting, admit themselves or read the rotating secret
- Assignment managers cannot change duration, questions or grading policy

#### WEB-STUDIO: Authoring studio web: template picker, block builder, question editors, import, review, publish

Wave 6. Layer: web. Depends on: AUTH-1, AUTH-2, WIRE-1.

Studio under /assessments/studio: template gallery, series wizard, three-pane block builder with live candidate preview and keyboard shortcuts, six question editors, rubric and anchor editors, paste and file import with dry run, pool depth and calibration meters, review panel with version diff, publish checklist and ruling forms.

**Owns**

- `artifacts/proofstack/features/skills-studio/**`
- `artifacts/proofstack/app/(community)/assessments/studio/**`
- `tests/skills-studio-ui.test.ts`

**Shared-file edits (integrator)**

- artifacts/proofstack/hooks/use-auth.ts: add the authoring query keys to the reset list

**Acceptance**

- A series is created from a template and a 20-question objective test is built, reordered, previewed and submitted for review with the keyboard only
- The six editors validate with the shared content schemas; the candidate preview markup never contains key or rubric-criteria data
- Import dry run lists per-row problems for the three formats; the publish checklist mirrors each server refusal code
- The review diff shows changed questions between versions; pool meters show eligible and calibrated counts per slot
- Studio links appear only when the auth context lists an authoring capability

**Security checks**

- Key data lives only under author-scoped query keys that include the viewer id and scope
- A member without the capability sees the gate and the API refuses with 403
- No dangerouslySetInnerHTML; prompts render through the safe tokenizer

#### GRADE-1: Grading core: objective scoring, blind tasks, claim-next, grades, resolution, results

Wave 7. Layer: api. Depends on: DB-6, DB-7, ATT-1.

The finalisation seam (objective scoring inside the submit transaction, task creation by policy), per-rubric-family queues with server-chosen claim-next and conflict rules in SQL, blind task projection, immutable grades, tolerance and adjudication, the audit sample, item scores, versioned results with denormalised issuer, labels and the equating statement, and the grading router with stub handlers for calibration and case actions.

**Owns**

- `artifacts/api-server/src/services/skills-grading-*.ts`
- `artifacts/api-server/src/services/skills-autograde.ts`
- `artifacts/api-server/src/services/skills-finalize.ts`
- `artifacts/api-server/src/services/skills-results.ts`
- `artifacts/api-server/src/services/skills-calibration-actions.ts`
- `artifacts/api-server/src/services/skills-case-actions.ts`
- `artifacts/api-server/src/routes/skills-grading.ts`
- `tests/skills-grading.integration.test.ts`
- `tests/skills-autograde.test.ts`
- `tests/skills-results.integration.test.ts`

**Shared-file edits (integrator)**

- lib/api-spec/skills-grading.yaml: queue and task views and grading actions of section 12.7; regenerate clients

**Acceptance**

- Single and multi-select scoring match a table of cases including the partial formula; pretest slots never count
- claim-next never returns a task whose candidate shares an organisation or cohort with the grader, whose question the grader authored, that the grader already graded in another pass, or beyond 10 held claims
- The task projection contains only blind_ref, prompt, rubric and response (asserted on the SQL result shape); self-identifying text is masked and identity-revealed releases, reassigns and raises a signal
- Within tolerance the two human totals are averaged; outside it an adjudication task is created and the adjudicator's score is final; 5 percent of single-marked items get an audit task; a grade under 20 percent of the rubric median time triggers a second read
- Finalise writes one final result with correct scaling, band, conduct label, grading method, form mode, attempt number, incident seconds and issuer; a second finalise is a no-op; a flagged attempt is not released to any organisation before a human integrity decision
- Organisation graders never see platform tasks and platform graders never see organisation tasks; deleting the organisation leaves issuer_name on results

**Security checks**

- A grader cannot browse, choose or re-open tasks, and gets 404 for a task they do not hold
- One person cannot both grade and adjudicate the same item (SQL)
- An organisation can never grade a platform result
- Grades cannot be updated or deleted through any action

#### ATT-2: Integrity signals, cases, deadline sweeper, per-attempt rate class and load test

Wave 7. Layer: api. Depends on: ATT-1, JOBS-1, LEDGER-1.

Event ingestion with separate client and server caps and a ledgered digest per batch, server-observed signals, the versioned rule set that opens integrity cases, similarity and identical-wrong-answer analysis for common papers, the finalize sweeper, resume grants, the stateless per-attempt rate class in the global limiter, the integrity retention step and the 300-candidate single-address load script.

**Owns**

- `artifacts/api-server/src/services/skills-integrity-*.ts`
- `artifacts/api-server/src/services/skills-attempt-events.ts`
- `artifacts/api-server/src/services/work/finalize.ts`
- `artifacts/api-server/src/services/work/similarity.ts`
- `artifacts/api-server/src/services/work/pattern-analysis.ts`
- `artifacts/api-server/src/services/retention/integrity.ts`
- `artifacts/api-server/src/middlewares/rate-limit.ts`
- `artifacts/api-server/scripts/load-exam.mjs`
- `tests/skills-integrity.integration.test.ts`
- `tests/rate-limit-attempt-class.test.ts`
- `tests/skills-sweeper.integration.test.ts`

**Shared-file edits (integrator)**

- artifacts/api-server/package.json: script ops:load-exam

**Acceptance**

- Client events stop being stored at 1,500 per attempt and are then only counted; server-observed events have their own allowance of 500 and are never displaced by client events; each batch digest is appended to the attempt chain and a tampered event row fails the candidate verify view
- Network, device and browser changes are detected against keyed digests on every hot-path call; nothing is stored for a rejected credential
- The rule set produces the expected flags from fixtures and opens a case; no flag changes a score or a state by itself
- The sweeper finalises attempts past their deadline; a resume grant needs a platform integrity reviewer with step-up and is ledgered
- A valid credential moves the request to the per-attempt bucket after a MAC check with no database work; a garbage credential is charged to the address bucket first
- load-exam: 300 simulated candidates behind one address are not throttled and save p95 stays under the documented target

**Security checks**

- Flooding client events cannot suppress later server signals (test)
- A forged credential naming a rival's attempt id creates no event and no rate bucket for that attempt
- Organisations never receive individual events or unreviewed flags
- After 180 days events are reduced to counts while ledger digests remain

#### INT-1: Structured AI interview API with scripted fallback and push-to-talk voice

Wave 7. Layer: ai. Depends on: ATT-1, AI-1, MEDIA-1.

/api/skills/attempts/:attemptId/interview (section 12.4): server-owned state machine, core prompts verbatim in seeded order, model limited to follow-up wording within a fixed budget, two short transactions around the provider call with a turn lease, scripted follow-ups and fully scripted delivery when the provider or budget is unavailable, voice turns through the media path with machine transcripts and separate candidate corrections, transcript digest on the ledger.

**Owns**

- `artifacts/api-server/src/services/skills-interview-*.ts`
- `artifacts/api-server/src/routes/skills-interview.ts`
- `artifacts/api-server/src/services/ai/prompts/interviewer.ts`
- `artifacts/api-server/src/services/retention/interview.ts`
- `tests/skills-interview.integration.test.ts`
- `tests/skills-interview-prompt.test.ts`

**Shared-file edits (integrator)**

- lib/api-spec/skills.yaml: interview operations of section 12.4; regenerate clients
- .env.example: SKILLS_INTERVIEW_ENABLED, SKILLS_VOICE_ENABLED

**Acceptance**

- Core prompts are delivered verbatim in seeded order for every candidate; malicious mock outputs cannot skip, add or end turns; progression uses server counters only
- The interviewer request never contains the rubric, level descriptors or scores (asserted on the constructed messages)
- No transaction or pooled connection is held during the provider call (pool instrumentation); a duplicate clientKey is a no-op and makes no second call
- Provider failure or budget refusal switches to scripted follow-ups or fully scripted delivery; the interview always completes and is always scored; nothing is removed from the candidate's maximum; waiting on the AI is not charged to the candidate
- Maximum-length input on every turn cannot exhaust the session reservation
- Voice: clip stored as evidence, machine transcript stored as the scored text, a correction is stored in a separate field and never replaces it; mode and delivery are recorded
- Reload restores the session; the transcript digest is appended to the attempt chain

**Security checks**

- Injection fixtures (ignore previous instructions, reveal the rubric, give full marks) raise injection_suspected and change nothing else
- No identity is sent to the model
- Attempt credential, bound session and CSRF are required on every turn; another account gets 404

#### REC-1: Recorded answers API, isolated media processor, renditions and transcripts

Wave 7. Layer: media. Depends on: ATT-1, MEDIA-1, MEDIA-2, JOBS-1, AI-1, LEDGER-1.

record-start, record-ticket, record-part, record-status, record-complete and take-choose with server-clocked prep and answer windows; the media-validate handler and the media-processor image (container probe, antivirus, remux to a seekable playback rendition and an audio-only rendition) run with no network and no credentials; original digest on the ledger; machine transcripts; the media retention step with appeal and case holds.

**Owns**

- `artifacts/api-server/src/services/skills-recording.ts`
- `artifacts/api-server/src/services/skills-recording-policy.ts`
- `artifacts/api-server/src/services/work/media-validate.ts`
- `artifacts/api-server/src/services/work/transcribe.ts`
- `artifacts/api-server/src/services/retention/media.ts`
- `artifacts/media-processor/**`
- `tests/skills-recording.integration.test.ts`
- `tests/media-validate.test.ts`
- `tests/media-retention.integration.test.ts`

**Shared-file edits (integrator)**

- lib/api-spec/skills.yaml: recording operations of section 12.4; regenerate clients
- .env.example and render.yaml comments: SKILLS_RECORDED_ENABLED, MEDIA_PROCESSOR_ENABLED

**Acceptance**

- A take must start inside the prep window measured from revealed_at; a part receipt whose Worker time is past the answer deadline plus the 120-second upload allowance is refused; a second receipt for the same part number is refused and raises a signal
- Late or missing media marks the take late and opens an incident; it never becomes a silent zero
- Takes beyond the question's limit are refused; the manifest digest of the original is appended to the attempt chain
- A recording has no playback ticket until the processor reports clean and valid; with the processor not deployed recordings stay unplayable and tests with recorded items cannot be started
- Processor: wrong codec, extra stream, over-duration and infected fixtures are rejected; a playback rendition and an audio rendition are written; the original is never modified
- Retention deletes recordings and transcripts 180 days after the final result and skips any attempt with an open appeal or integrity case; consent withdrawal waits for those to close

**Security checks**

- Processor tools run with no network, a scrubbed environment and CPU, memory and file-size limits; a test proves an outbound connection fails inside the sandbox
- With audio-only review the grader receives a ticket for the audio rendition only and never for the video
- Organisations never receive a ticket for a recording of a platform test
- Reports state that live capture is not verified

#### WEB-EXAM: Skills hub and exam runner web: catalogue, series, assigned, consent, start, timer, autosave, objective, written and coding items

Wave 7. Layer: web. Depends on: ATT-1, WIRE-1.

Catalogue, series detail, assigned list, consent gate and hard-navigation start; the chromeless exam shell with server-time countdown, section navigator, in-memory sync loop, integrity signal queue, locked overlay, submit receipt; choice, long-form and coding renderers; placeholder renderers for recorded and interview items.

**Owns**

- `artifacts/proofstack/features/skills-take/**`
- `artifacts/proofstack/features/skills-hub/**`
- `artifacts/proofstack/features/assessments/skills-shell.tsx`
- `artifacts/proofstack/app/(exam)/**`
- `artifacts/proofstack/app/(community)/assessments/page.tsx`
- `artifacts/proofstack/app/(community)/assessments/{series,assigned}/**`
- `tests/skills-take-ui.test.ts`
- `tests/skills-hub-ui.test.ts`
- `tests/assessment-ui.test.ts`
- `tests/browser/skill_take.py`

**Shared-file edits (integrator)**

- artifacts/proofstack/hooks/use-auth.ts: add the skills query keys to the reset list

**Acceptance**

- The timer follows server time under a skewed client clock; a reload restores saved answers with no resume call; a second browser locks the first
- Answers and the credential are held in memory only: a test asserts nothing is written to localStorage, sessionStorage or IndexedDB during an attempt
- Signals are batched and sent with sync; forward-only sections cannot be reopened; submit shows the unanswered count and then the receipt with seed commitment and form digest
- Start and exit use full page navigation; the runner refuses to start a recorded item when the camera policy is blocked and offers a reload
- Keyboard-only completion works; fieldset and legend, role timer, live regions and 44 px targets are asserted
- The hub shows the right start state for free, entitled, assigned, cooling-down, sanctioned and not-entitled viewers; legacy practice checks stay listed and labelled

**Security checks**

- The coding runner receives only public samples and is labelled as not used for scoring
- Query keys for attempt data include the viewer id and are never cached past the attempt
- No key field can reach the page: the client types contain none

#### GRADE-2: Calibration gates, validity anchors, AI reader, item statistics and form checks

Wave 8. Layer: ai. Depends on: GRADE-1, AI-1, JOBS-1.

Calibration runs per grader and rubric family on anchor tasks, hidden validity anchors mixed into live queues, drift pauses and grader statistics; the AI reader (two runs with shuffled criteria, verbatim evidence check, never a recorded score, never shown to graders) behind a per-model and per-prompt gate; nightly item statistics, calibration promotion, form-deviation and group-difference checks.

**Owns**

- `artifacts/api-server/src/services/skills-calibration-*.ts`
- `artifacts/api-server/src/services/skills-calibration-actions.ts`
- `artifacts/api-server/src/services/skills-ai-reader.ts`
- `artifacts/api-server/src/services/ai/prompts/grader-rubric.ts`
- `artifacts/api-server/src/services/work/grade-ai.ts`
- `artifacts/api-server/src/services/work/item-stats.ts`
- `artifacts/api-server/src/services/work/form-check.ts`
- `tests/skills-calibration.integration.test.ts`
- `tests/skills-ai-reader.test.ts`
- `tests/skills-item-stats.integration.test.ts`

**Shared-file edits (integrator)**

- lib/api-spec/skills-grading.yaml: calibration views and actions of section 12.7; regenerate clients

**Acceptance**

- A grader receives no live task for a rubric family before passing calibration (80 percent adjacent, 60 percent exact on at least 10 anchors); one anchor is issued to many graders; recorded-media anchors play through tickets
- Validity anchors appear at about one in fifteen tasks and look like live tasks; rolling agreement below threshold pauses the grader for that family and queues their recent grades for a second read
- AI gate: at least 30 anchors spanning every level, weighted kappa at least 0.70 with a lower 95 percent bound of at least 0.60 and adjacent agreement at least 90 percent; a model or prompt change invalidates the pass
- An AI read with a quote that is not a substring of the answer, a quote from an interviewer turn, or two runs more than one level apart is discarded; disagreement with the human creates a second human task; the AI score is never written to skill_item_scores
- When AI is unavailable or over budget, human grading proceeds unchanged
- Item statistics promote pretest items at 50 exposures inside their band, flag drift, flag forms whose expected score deviates by more than 5 points and flag items whose mean differs by more than 0.15 between organisations

**Security checks**

- No API view returns an AI read to a grader or adjudicator during live grading
- The request to the model contains no identity (asserted on the constructed request)
- Grader statistics are visible to adjudicators and integrity reviewers only, never to organisations

#### GRADE-3: Appeals, integrity decisions, credentials and verification, ruling application, sanctions, export and erase hooks

Wave 8. Layer: api. Depends on: GRADE-1, ATT-2, LEDGER-1, FND-1, DB-6.

Candidate result actions and staff case actions behind the existing seams: appeals on four grounds with independent handlers, integrity decisions with human review before organisation release, Ed25519 credentials with the public verify endpoint, application of approved item rulings as new result versions, sanctions that survive erasure as keyed digests, the support view, the skills export contributor and the erase steps.

**Owns**

- `artifacts/api-server/src/services/skills-appeals-*.ts`
- `artifacts/api-server/src/services/skills-case-actions.ts`
- `artifacts/api-server/src/services/skills-result-actions.ts`
- `artifacts/api-server/src/services/skills-credentials.ts`
- `artifacts/api-server/src/services/skills-rulings-apply.ts`
- `artifacts/api-server/src/services/skills-sanctions.ts`
- `artifacts/api-server/src/services/skills-export.ts`
- `artifacts/api-server/src/routes/skills-verify.ts`
- `artifacts/api-server/src/services/account-data.ts`
- `tests/skills-appeals.integration.test.ts`
- `tests/skills-credentials.integration.test.ts`
- `tests/skills-rulings-apply.integration.test.ts`
- `tests/skills-erase-export.integration.test.ts`

**Shared-file edits (integrator)**

- lib/api-spec/skills.yaml and skills-grading.yaml: result, appeal, credential, verify and case operations of sections 12.4 and 12.7; regenerate clients
- .env.example: CREDENTIAL_SIGNING_KEY, CREDENTIAL_SIGNING_KEY_ID, CREDENTIAL_PUBLIC_KEYS

**Acceptance**

- Score appeal: one fresh blind grader plus an adjudicator who never touched the item; the adjudicated outcome is final and creates a new result version; nobody who graded the item or made the contested decision can be assigned (SQL)
- Integrity and technical appeals go to a different skills.integrity holder at each of two levels; a technical appeal can grant a fresh attempt without consuming one; organisation-owned tests offer a platform procedural review and show appeals handled by the organisation
- Credentials exist only for platform-issued, monitored or supervised results that are not AI-scored; the statement always carries attempt number, conduct label, grading method, issuer, form mode, equating statement, incident seconds and approval mode; any payload change breaks the signature
- Verify returns the same shape and timing class for unknown, revoked, superseded and valid codes, hides the holder's name unless the credential is listed, and honours band-only disclosure
- void, accept_all and rekey are applied by the published rule to every affected attempt, create new result versions, reissue credentials and notify each candidate; retire_leaked rescores nothing and opens an integrity review
- Invalidation creates a sanction; erasing the account keeps only keyed digests until the sanction ends and a new account with the same verified email or phone is refused premium and assigned starts
- Export contains the member's own attempts, answers, released scores, events and decisions with explicit columns; erase writes candidate_erased on each attempt chain

**Security checks**

- Support view needs super_admin, step-up and a typed reason, writes a ledger event the candidate can see and notifies the organisation owner for organisation-private content
- An organisation sees only a reviewed integrity category, never reasons or events
- Verify is limited to 60 per minute per address and does constant work for unknown codes
- Appeal and integrity decisions need step-up

#### ORG-1: Hiring checks API and consented organisation result views

Wave 8. Layer: api. Depends on: EDU-2, GRADE-1, PLAT-1, DB-6.

/api/careers/checks (section 12.10): hosted or external check per job with host rules, manager-initiated invitations with caps, credential attach and detach, external-done; /api/org-results (section 12.11): cohort progress, consented results, aggregates with small-cell suppression, audited export and the application result view; the talent filter for platform-issued credentials.

**Owns**

- `artifacts/api-server/src/services/career-checks-*.ts`
- `artifacts/api-server/src/routes/career-checks.ts`
- `artifacts/api-server/src/services/org-results-*.ts`
- `artifacts/api-server/src/routes/org-results.ts`
- `artifacts/api-server/src/services/careers-query.ts`
- `tests/career-checks.integration.test.ts`
- `tests/career-checks-input.test.ts`
- `tests/org-results.integration.test.ts`

**Shared-file edits (integrator)**

- lib/api-spec/career-checks.yaml and org-results.yaml: operations of sections 12.10 and 12.11; lib/api-spec/careers.yaml: optional credentials on candidate cards and the credential filter; regenerate clients

**Acceptance**

- Only a current manager with step-up sets a check; an unverified organisation may attach an external link only; links that are not https, carry credentials, use an IP literal, localhost or a private suffix, or exceed 2,000 characters are refused; the server never fetches the link
- Invitations are a manager action only (never automatic on apply), need the applicant's verified email, are capped at 500 per job and 2,000 per organisation per day, and pin the version recorded when the check was attached
- The employer sees a result only with an active sharing grant and after release; revocation or withdrawal removes access on the next read; an attached credential is visible only to that job's managers
- Organisation views never contain responses, recordings or transcripts of platform tests; cells under 5 are suppressed; export needs step-up and writes an audit row with the row count
- Results of organisation-authored tests appear only inside the owning organisation and state who authored and who graded
- The talent filter and candidate cards count only platform-issued credentials that are not AI-scored and are profile-visible

**Security checks**

- A removed manager loses access immediately; another organisation gets 404
- Fake applicants cannot consume seats or AI budget: no invitation exists without a manager action
- Cross-tenant matrix for every view and action
- The 23505 conflict here maps to its own message, not the application one

#### WEB-EXAM-MEDIA: Exam web: recorder and interview panels

Wave 8. Layer: web. Depends on: WEB-EXAM, REC-1, INT-1, MEDIA-2.

Device check, prep countdown, MediaRecorder capture with format selection, in-memory part upload while recording, hard stop, take review and choice; the interview panel for text and push-to-talk voice with transcript display and one correction note per turn.

**Owns**

- `artifacts/proofstack/features/skills-take/recorded/**`
- `artifacts/proofstack/features/skills-take/interview/**`
- `tests/skills-recorder-ui.test.ts`
- `tests/browser/skill_recorded.py`

**Shared-file edits (integrator)**

- None

**Acceptance**

- Format selection falls back in the documented order; the device check blocks a recorded item without a working device and offers the audio-only form when the question allows
- Parts upload during recording and resume after a simulated dropped part; the recorder stops at the answer limit; tracks stop when the item closes and a visible indicator shows while recording
- No recorded bytes are written to browser storage (test); at most two parts are held in memory
- The interview panel recovers after reload, shows scripted-delivery notices, and offers push-to-talk only when the feature is reported
- A browser test with fake media devices completes a recorded answer and a text interview

**Security checks**

- Camera and microphone are requested only inside the exam route and only for the open item
- Tickets are sent in a header, never in a URL
- The transcript correction is sent as a separate field and the UI states that the original is what is scored

#### REL-1: Release gates: notifications, legal text and consent versions, operations report, preflight, legacy cut-over

Wave 9. Layer: release. Depends on: GRADE-3, ORG-1, EDU-2, MOD-1, REC-1, INT-1, JOBS-1, DB-7.

Notification titles with current-access clauses added only when their modules are ready, the new preference category and hiring-team notices; revised Terms and Privacy text with a TERMS_VERSION bump and versioned consent texts; operations report and preflight coverage for the new queues, flags, guards, grants and key ring; scheduled ledger verification and retention; the legacy start cut-over flag.

**Owns**

- `artifacts/api-server/src/services/community-policy.ts`
- `artifacts/api-server/src/services/notification-preferences.ts`
- `artifacts/proofstack/lib/notifications.ts`
- `artifacts/api-server/src/services/operations.ts`
- `artifacts/api-server/scripts/preflight.mjs`
- `artifacts/api-server/src/services/legal.ts`
- `artifacts/proofstack/lib/legal.ts`
- `artifacts/proofstack/app/{terms,privacy}/page.tsx`
- `artifacts/proofstack/features/legal/**`
- `artifacts/api-server/src/services/assessments.ts`
- `artifacts/api-server/src/routes/assessments.ts`
- `.github/workflows/operations.yml`
- `docs/legal-compliance.md`
- `docs/skill-check-operations.md`
- `tests/notification-access.integration.test.ts`
- `tests/notifications-modules.core-only.test.ts`
- `tests/legal-pages.test.ts`
- `tests/preflight-checks.test.ts`
- `tests/operations-report.integration.test.ts`

**Shared-file edits (integrator)**

- lib/api-spec/community.yaml: notification category assessments; lib/api-spec/operations.yaml: new report fields; regenerate clients
- .env.example: SKILLS_LEGACY_START

**Acceptance**

- Each new title and href pair of section 12.12 is stored and readable only by a recipient who currently has access; unknown pairs are still dropped; managers receive application and check-completion notices
- Core-only test: with skill modules absent notify(), the notification list and every community action work exactly as today
- TERMS_VERSION is equal on both sides and bumped; the four contradicted statements are gone; recording, AI evaluation and integrity monitoring consent texts carry versions; no page names a provider in visible copy outside the processor table
- Operations report shows work queue depth and age per kind, worker heartbeats, attempts past deadline, grading backlog by age against the turnaround targets, appeals past target, AI spend, media stuck in processing, reports past due, accommodation rates per organisation and last ledger verification
- Preflight checks each area flag with its configuration, the 10 seeded role grants, guard triggers, and that every key_id in the database exists in the key ring
- The scheduled workflow runs ledger verification and retention; SKILLS_LEGACY_START=off makes the legacy start answer 410 ASSESSMENT_MOVED while legacy reads keep working

**Security checks**

- Recording and AI areas report unavailable until the consent text versions exist
- The operations report stays restricted to admin and super_admin with fresh MFA
- Notification mail contains no result data

#### WEB-REVIEW: Grading and review web: queue, blind task, calibration, adjudication, appeals, integrity cases, rulings

Wave 9. Layer: web. Depends on: GRADE-1, GRADE-2, GRADE-3, ATT-2, WIRE-1.

Review workspace under /assessments/review: queue summary and claim-next, blind task with rubric levels and evidence selection on text and transcript, audio-only or seekable media review, calibration runs, adjudication without grader identity, appeal and integrity case views with the event timeline, ruling approval.

**Owns**

- `artifacts/proofstack/features/skills-review/**`
- `artifacts/proofstack/app/(community)/assessments/review/**`
- `tests/skills-review-ui.test.ts`

**Shared-file edits (integrator)**

- artifacts/proofstack/hooks/use-auth.ts: add the grading query keys to the reset list

**Acceptance**

- The blind task shows no identity, attempt number or other items; evidence selection is required above the lowest level; levels can be entered by keyboard
- Conflict and identity-revealed actions release the task; no AI output is rendered anywhere in live grading
- Adjudication shows both mark sheets without saying which grader gave which; appeal and integrity decisions require a note and trigger the step-up dialog
- The media review uses the audio rendition when audio-only review applies and offers no download control
- The integrity timeline renders events, flags and the decision

**Security checks**

- Review links appear only for holders; the API still refuses others with 403
- Playback tickets are requested per view and never stored
- Private query keys include the viewer id

#### WEB-ORG: Organisation workspaces web: cohorts, roster import, assignments, sittings, reports, job checks, invite acceptance

Wave 9. Layer: web. Depends on: EDU-1, EDU-2, ORG-1, WIRE-1.

College and company workspaces under /organizations/[slug]: cohort list and roster with import preview, assignment editor, accommodation requests and approvals, sitting screen with the rotating code and admit list, progress and results reports with suppression; the job editor check field, external-link interstitial and application-thread invitation panel; the student invite acceptance page with the consent notice.

**Owns**

- `artifacts/proofstack/features/education/**`
- `artifacts/proofstack/features/hiring-checks/**`
- `artifacts/proofstack/app/(community)/organizations/[slug]/{cohorts,assignments,sittings,skill-checks,results}/**`
- `artifacts/proofstack/app/(community)/assessments/join/**`
- `artifacts/proofstack/features/careers/{job,workspace}.tsx`
- `artifacts/proofstack/features/opportunities/hiring.tsx`
- `tests/education-ui.test.ts`
- `tests/hiring-checks-ui.test.ts`

**Shared-file edits (integrator)**

- artifacts/proofstack/hooks/use-auth.ts: add the education, org-results and career-checks query keys to the reset list

**Acceptance**

- Import preview shows per-row problems and one step-up prompt for the whole import
- The acceptance page states the 18+ rule and exactly what the college will see before the student accepts
- The assignment editor refuses a common paper without supervision or a start window and shows the grading-capacity message
- The sitting screen shows the rotating code and the admit list to the invigilator only
- Reports render consented rows only, suppress cells under 5 and label organisation-authored tests
- The external-link interstitial shows the destination host in plain form and the link opens in a new tab with rel noopener noreferrer nofollow; nothing is framed

**Security checks**

- Staff-only controls are absent for students and the API refuses them
- No response, recording or transcript of a platform test is rendered in any organisation view
- Private query keys include the viewer id and organisation id

#### WEB-RESULTS: Results web: score report, receipt, appeals, credentials, public verification, methodology, profile, privacy settings

Wave 9. Layer: web. Depends on: GRADE-3, ATT-1, ORG-1, WIRE-1.

Results list and score report with labels, integrity timeline, submission receipt and ledger verify view, appeal dialog, credential card with visibility and disclosure controls, public /verify page with the published keys file, the public methodology page, profile credentials beside labelled practice results, talent cards and filter, and consent and sharing controls in privacy settings.

**Owns**

- `artifacts/proofstack/features/skills-results/**`
- `artifacts/proofstack/features/assessments/profile-assessment-results.tsx`
- `artifacts/proofstack/features/community/profile-view.tsx`
- `artifacts/proofstack/features/careers/boards.tsx`
- `artifacts/proofstack/features/settings/sections.tsx`
- `artifacts/proofstack/app/(community)/assessments/results/**`
- `artifacts/proofstack/app/(community)/assessments/methodology/**`
- `artifacts/proofstack/app/verify/**`
- `artifacts/proofstack/app/.well-known/proofstack-keys.json/route.ts`
- `tests/skills-results-ui.test.ts`
- `tests/verify-page.test.ts`

**Shared-file edits (integrator)**

- artifacts/proofstack/hooks/use-auth.ts: add the results query keys to the reset list

**Acceptance**

- The report shows score, band, section and topic breakdown, criterion levels and feedback, attempt number, conduct label, grading method, issuer, form mode with the equating statement, incident time, approval mode, integrity status and the receipt; item-level correctness is never shown for pooled tests
- Appeal can be opened and withdrawn and shows that the adjudicated outcome is final; the verify-my-attempt view reports the chain result
- The verify page shows only what the holder disclosed, the live status, and offers the signed statement; unknown codes render the same page shape
- Profile and talent cards show platform-issued credentials with their labels beside clearly labelled practice results; organisation-authored results never appear
- Privacy settings list every organisation with access, scope and date, and allow revocation and consent withdrawal with the stated effects
- The methodology page describes randomisation, grading, AI use, integrity handling, appeals and per-test reliability figures

**Security checks**

- A visitor sees profile-visible credentials only, following the profile visibility rule
- Verify pages are noindex and carry no viewer data
- Private query keys include the viewer id

#### SEC-1: Security verification sweep: access matrix, response scanner, audit metadata, end-to-end and review

Wave 10. Layer: security. Depends on: REL-1, WEB-REVIEW, WEB-ORG, WEB-RESULTS, WEB-EXAM-MEDIA, WEB-STUDIO, WEB-ADMIN, WEB-SOCIAL, GRADE-2.

Generated access-matrix test over every new view and action for every actor in section 2.3; response scanner over every candidate and organisation endpoint for key material; audit-metadata call-site test; cross-site and forged-identity completeness check; end-to-end browser run with mocked providers; written security review with findings fixed or signed off.

**Owns**

- `tests/access-matrix.integration.test.ts`
- `tests/response-scanner.integration.test.ts`
- `tests/audit-metadata.test.ts`
- `tests/boundary-completeness.test.ts`
- `tests/browser/skill_platform_e2e.py`
- `tests/skill-platform-browser.integration.test.ts`
- `docs/security-review-skill-platform.md`

**Shared-file edits (integrator)**

- None

**Acceptance**

- The matrix calls every view and action of sections 12.2 to 12.11 as each actor of section 2.3 and asserts allow, 401, 403 or 404
- The scanner finds no key, rubric-criteria, gold, seed, option-map or sealed field in any candidate, organisation or public response
- Every audit call site produces metadata that passes the audit schema (no key matching token, secret, credential, cookie or password)
- Every router file under routes/ has all its POST paths in the cross-site test and its private GET paths in the forged-identity test
- Browser run: author, review, publish, assign, sit (objective, written, coding, recorded, interview), grade twice, adjudicate, release, appeal, verify
- The review lists each mustFix of this specification with the test that proves it; open findings carry an owner sign-off

**Security checks**

- Cross-tenant: organisation A never reads organisation B's cohorts, assignments, results, content or media (404)
- A candidate never reads another candidate's attempt, result, recording or events (404)
- Platform roles without grants are refused everywhere a capability is required

### 16.5 Release order

1. Merge everything with every flag off. Production behaviour is unchanged, including while migrations are pending.
2. The owner approves `migrate:release` for 0022 to 0028 (one run, additive tables and triggers only, no backfill). Then `ops:preflight`.
3. Run the first-super-admin script if needed, grant capabilities, and set `SKILL_KEY_RING`, the ledger keys and the credential keys.
4. Turn areas on one at a time: platform access, authoring, attempts with objective and long-form items, grading, education, hiring, social images, then video.
5. Recorded answers, the AI interview and voice are enabled only after REL-1 is live with the owner-approved legal text and consent versions, and after the media Worker, the evidence bucket and the media-processor are deployed.
6. Premium pooled tests are published once their pools are calibrated (section 4.5); until then use free practice series and assigned common papers.
