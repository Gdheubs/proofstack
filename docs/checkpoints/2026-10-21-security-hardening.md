# Security hardening and adaptive skill checks — October 21, 2026

Parent: `300f476` (sign-in callback fix; hosted CI and Security passed). Fixes the findings from the read-only authorization audit of that day, plus two operational issues found in the live review.

## Changes

1. **Organization membership needs consent** (was: any owner could force-add any user and sign them out repeatedly).
   - `member-save` on a non-member now creates an `organization_invitations` row (migration `0014`), valid for 14 days.
   - The invitee accepts or declines with the new `member-respond` action. A privileged role re-checks the invitee's native MFA when they accept.
   - A declined invitation cannot be re-sent for 7 days.
   - Cancelling expires the invitation instead of deleting it. Re-inviting within 24 hours sends no new notification, so cancel-and-reinvite cannot spam.
   - At most 100 invitations can be pending per organization.
   - Sessions are revoked only on demotion or removal, never on invitation or promotion.
   - The platform `organization-role` action refuses non-members (`INVITATION_REQUIRED`).
   - Invited users can see the (possibly private) organization to respond. Managers see pending invitations.
   - A new allow-listed notification (`Organization invitation`) stays readable only while the invitation is pending.
2. **Moderators see masked contact details.** `listUsers` returns `p***@domain` and no phone number unless the caller is an admin or super admin. Moderators keep the list for account status changes.
3. **Lockouts are per network.**
   - Failure counters and locks are keyed by identifier plus client address (`rateLimitAddress`), so failures from one network cannot lock the owner out from theirs.
   - Password login and OTP verification use a per-network guessing budget (10 per 15 minutes and 5 per 15 minutes) plus an account-wide ceiling of five times that.
4. **Pending project invitations** are hidden from everyone except project editors and the invitee.
5. **Skill checks** (`questionVersion` 2):
   - The bank has 24 four-option questions per check across six topics. Each attempt draws eight.
   - Selection gives every topic one question and the two extra slots to the topics missed most in the last three attempts (ties go to topics with the most unseen questions). It prefers unseen questions and never repeats the previous attempt's questions.
   - Options are shuffled and get random ids per attempt.
   - There is a 24-hour retake cooldown per check (`ASSESSMENT_COOLDOWN`), serialized with an advisory lock.
   - Results add `attempt`, `topics` and `focus`. Profile results add `attempts`.
   - The UI shows the topic breakdown, what to practice next, and the attempt count.
6. **Shared-address rate limiting.**
   - Past the per-address allowance (120 per minute), a request with a live session is counted against its account instead.
   - Each address is still capped at ten times the allowance.
   - The account lookup runs only for addresses already over the allowance.
7. `/design-system` and `/foundation` return 404 in production, and their footer links are hidden there.

## Validation (local)

- New tests:
  - `tests/organization-invitations.integration.test.ts` (8), including the force-add/sign-out exploit.
  - `tests/account-protection.test.ts` (5): per-network locks and budgets, shared-address sessions, moderator masking, pending contributors.
  - `tests/assessment-bank.test.ts` (7).
- Updated tests: skill-check integration (25, now reading answer keys from the stored snapshot), role policy (new consent and demotion semantics), table counts 49 → 50.
- Embedded PostgreSQL: 205 passed, 2 skipped. Unit: 752 passed. `pnpm run typecheck`, `pnpm lint` and Prettier pass. The generated clients were regenerated from the spec.
- **Not yet verified:**
  - Hosted CI for this commit, including the Worker size gate.
  - Migration `0014` on Neon (`migrate:release` to staging, then production).
  - The flows signed in on the live site.

## Render build fix (October 22)

Hosted CI and Security passed on `cae9d88` (Worker 2,644 of 3,072 KiB). Migration `0014` was applied to Neon staging and then production (15 of 15 migrations; a rerun applied 0; 50 tables).

The Render deploy of `cae9d88` then failed in its first second: `corepack enable` tried to replace the read-only `/usr/bin/pnpm` (`EROFS`). Render had not changed anything in our code, so its build image most likely did. `render.yaml` now:

- builds with the exact pinned package manager (`npx --yes pnpm@11.25.0 install --frozen-lockfile`, then the API build);
- starts the bundle with `node` directly, so no package manager is needed at runtime.

Both commands were run in a clean Linux checkout with Node 24: the build succeeded, and the server loaded and stopped only on the missing `DATABASE_URL`.

## Next step

Run `migrate:release` for `0014` on Neon staging and then production, deploy Render and the Worker, and check invitations and skill checks signed in.
