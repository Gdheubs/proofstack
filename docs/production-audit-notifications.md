# Notification snapshot current-access fix (SEC-13)

Date: October 15, 2026. Scope: the current dirty working tree, preserving pre-existing changes. This fixes subsequent API disclosure of stored notification metadata, not already-delivered information or every production security audit finding.

## Confirmed issue and implementation

Before the fix, `getCommunity` selected notification title/body/href and counted unread rows using recipient identity alone. `notification-read` similarly updated any recipient-owned row. A real SQL regression first showed a private pull title and destination still returned after that recipient's organization membership became inactive.

The change adds `notificationReadWhere` in `artifacts/api-server/src/services/community-policy.ts` and uses it in:

- Notification list SQL, **before** limit/offset and `hasMore` calculation.
- Unread-count SQL on every signed-in community view.
- Individual and bulk `notification-read` updates, without exposing whether a hidden ID exists.
- The existing `notify` insertion helper and its recent-notification deduplication check.

The same predicate requires the recipient to be active, resolves a recognized canonical destination to current rows, and applies the destination's current authorization. Project/pull notifications require an active project owner and the existing `projectReadWhere` policy: public visibility in both project and organization, personal ownership where applicable, or active organization membership with the actual current `community.organization.read` grant. A role name, old contribution or old notification does not confer private access. Existing `organization_id` references additionally require current grant-aware membership. Organization-role account notices whose FK becomes null on organization deletion fail closed.

No title/body/href snapshots are rewritten, deleted or made universally generic. Authorized known notices retain their original metadata and destinations. Unknown legacy title/destination combinations are withheld rather than trusted by default. UUID destinations are matched exactly, without casting untrusted path fragments to UUID. Queries, fragments, trailing slashes, encoded paths, uppercase UUID variants and external/authority-relative URLs are not accepted as canonical resource references.

## Producer and consumer trace

All application notification insertions were traced before implementation. `API/` below means `artifacts/api-server/src/`.

| Producer                                                                              | Existing content/destination                                    | Current protection                                                                                                                                                                        |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `API/services/community-project-actions.ts`, contributor invitation                   | Project title in body; `/projects/<slug>`                       | Existing `notify` call now admits and later exposes only current readable projects with a current pending/active recipient invitation/contribution.                                       |
| `API/services/pull-actions.ts`, pull update                                           | Pull title/action in body; `/pulls/<uuid>`                      | Existing `notify` call joins current pull → repository → project and checks live project access and owner status.                                                                         |
| `API/services/community-social-actions.ts`, follow                                    | Actor display name; `/profile/<handle>`                         | Known follower title, exact current public handle, active target profile user.                                                                                                            |
| Same file, post mention/comment/reaction                                              | Actor display name; `/posts/<uuid>`                             | Current post with active author and existing `postReadWhere` public-post policy. This also hides notices when a linked project becomes private.                                           |
| Same file, project reaction                                                           | Actor display name; `/projects/<slug>`                          | Current project access and active owner.                                                                                                                                                  |
| `API/services/community-org-actions.ts`, membership update                            | Fixed non-sensitive body; `/organizations`                      | Only that exact known title/body/destination is accepted. It contains no organization identifier/title.                                                                                   |
| `API/services/careers-actions.ts`, application status/message                         | Status/fixed message; `/applications/<uuid>`                    | Current application exists and the recipient is its applicant, as required by both existing notification producers. Applicant access is not replaced with organization-membership access. |
| `API/services/auth-sessions.ts` and `firebase-sessions.ts`, new-device direct inserts | Device summary; default `/account`                              | Known security title, active recipient; no private project snapshot. Auth producers were not changed.                                                                                     |
| `API/services/auth-mfa.ts`, recovery direct insert                                    | Fixed recovery message; default `/account`                      | Known security title, active recipient. Auth producer was not changed.                                                                                                                    |
| `API/services/auth-account.ts`, organization-role direct insert                       | Role summary and existing `organization_id`; default `/account` | Current organization read grant plus non-null organization reference. Auth producer was not changed.                                                                                      |
| Consumers: `API/services/community-query.ts`, `community-actions.ts`                  | List, unread count, individual/bulk read                        | Shared current-access predicate, not recipient-only predicates.                                                                                                                           |

No producer-file change was necessary: the sensitive producers already call the shared helper. No additional notification-delivery mechanism was found in the API source.

## Invitation behavior and deliberate legacy limits

- A real pending contributor invitation remains visible and actionable **before contributor membership**. Tests use the actual invitation/accept/remove actions on a public personal project and a recipient without organization membership. Existing acceptance/decline UI and destinations are unchanged.
- Organization projects already require an active grant-bearing organization member before an invitation can be issued. This fix does not invent organization invitations or let a contributor invitation bypass private organization access.
- Pending or active contributor rows are recognized; removed/declined rows and statuses such as expired, inactive or revoked do not authorize a notice. This schema has **no invitation expiry timestamp**: no new age-based expiration policy is claimed or introduced.
- The invitation relationship must predate the notice. Removal/re-invitation does not resurrect old notices. Deduplication considers only currently visible historical notices, so a newly issued legitimate invitation is not suppressed by a hidden old invitation within the ten-minute window.
- Slug-only legacy references are mutable. Project creation time and the current invitation body/title template are checked so deletion/reuse or reassignment cannot expose an old private project title through another accessible project. **An old invitation whose project slug or title changed is conservatively withheld**, even if the same project still has a pending invitation. The current project-page invitation controls remain unchanged. Preserving all renamed historical invitations would need a separately reviewed stable resource reference; no migration or guessed backfill was added.
- Unknown legacy notifications, including arbitrary `/account` records, are withheld. Future producer titles/destinations must explicitly extend the policy and tests; they are not automatically trusted.

## Regression and verification evidence

New file: `tests/notification-access.integration.test.ts`, **24 passing tests**, executing production readers/actions/helpers against tracked migration SQL in disposable PGlite. SQL and application policy are not mocked; these tests do not invoke a real identity provider. Fixtures use generated two-user/resource IDs and clean up their own rows inside the disposable engine.

Coverage includes private membership revocation; actual permission-grant removal; disabled owner/recipient; project, organization and pull deletion; project and organization public→private transitions; retained stored snapshots; recipient-only individual/bulk read updates; unread counts on both notification and feed views; filtering before pagination; malformed/unknown legacy rows; linked-post mention revocation and blocked new outsider delivery; pending/accepted/declined/removed/noncurrent invitations; slug reassignment; and remove/re-invite deduplication.

Failure checks were observed before each corresponding implementation slice: the original private-pull disclosure, preservation of recognized producer destinations/pending invitations, unauthorized new insertion, reassigned-slug disclosure, and re-invitation suppressed by an invisible old notice. Each was rerun to passing after its focused fix.

Commands used from `C:/Users/ithes/proofstack`, with native Node at `C:/Program Files/nodejs/node.exe`:

```bash
# The embedded setup replaces pg transport before application modules load.
RUN_DB_TESTS=1 DATABASE_URL=postgresql://unused.invalid/notification_embedded_only \
  "C:/Program Files/nodejs/node.exe" node_modules/vitest/vitest.mjs run \
  --config vitest.embedded.config.ts \
  --reporter=default --reporter=json --outputFile=.local/notification-embedded-results.json

DATABASE_URL=postgresql://unused.invalid/notification_embedded_only \
  "C:/Program Files/nodejs/node.exe" node_modules/vitest/vitest.mjs run \
  --exclude '**/*.integration.test.ts' \
  --reporter=default --reporter=json --outputFile=.local/notification-unit-results.json
```

Parsed final JSON result totals:

| Run                                    | Passed | Failed | Skipped |                Files |
| -------------------------------------- | -----: | -----: | ------: | -------------------: |
| Full embedded integration run          |    188 |      0 |       2 | 20 passed, 1 skipped |
| Full non-integration run               |    525 |      0 |       0 |            40 passed |
| Notification suite within embedded run |     24 |      0 |       0 |             1 passed |

The skipped integration tests are the two opt-in assessment browser tests, not notification tests. API TypeScript checking, test TypeScript checking, targeted ESLint and targeted Prettier checks also passed.

## Exact change boundary and remaining gates

Modified production files: `community-policy.ts`, notification portions of `community-query.ts`, and notification-read portions of `community-actions.ts`. Added the notification integration test and this report. No auth, asset service, schema, migration, root configuration, UI, credential, deployment or real-data cleanup changes were made for this fix. Existing dirty-tree work, including unrelated edits already present in `community-query.ts`, was preserved.

The real development database, existing API/HTTPS services and parent-owned native audit container were not used, queried, restarted or stopped. `DATABASE_URL` was explicitly set to an invalid sentinel during test execution rather than inherited. PGlite verifies real PostgreSQL SQL and policy behavior, not native wire protocol, independently concurrent sessions, TLS, hosted grants, browser authentication or real-provider acceptance. Current access is evaluated at each SQL statement's snapshot; separate unread/list statements and in-flight revocation are not a promise of linearizable cross-request revocation. This fix neither erases data already delivered nor authorizes cleanup of historical snapshots.
