# Legal pages, age and consent, data rights — October 22, 2026

Parent: `5122d72` (Render build fix). Live check before this work:

- Render now runs the security release.
- `/api/auth/callback` through the Worker returns the continue page (200), no longer 404.
- The skill-check catalog shows 8 questions per check.
- The internal pages showed only the not-found content but returned 200, because the root loading boundary streams first. Fixed here in the proxy.

## Owner decisions

- ProofStack is operated by a sole proprietor. Users are in India first, open worldwide.
- Date of birth is required for everyone. Accounts are **18+ now**, and under-18s wait until a verifiable parental-consent flow exists (DPDP Act s.9).
- The owner is the Grievance Officer. Name, email and address are still to be supplied; they are placeholders in `OPERATOR` (`artifacts/proofstack/lib/legal.ts`).

## Changes

- **Pages:** `/privacy`, `/terms`, `/community-guidelines`, `/contact`, `/about`, with a Legal footer column and the Grievance Officer in the footer. Content matches the code:
  - personal data collected, the providers and their regions;
  - the AI features;
  - only essential cookies (no analytics);
  - retention periods;
  - DPDP rights and the IT Rules 3(1)(b) content list;
  - takedown and grievance timelines.
- **Age and consent** (migration `0015`: `users.birth_date`, `consent_records`, `deleted_accounts`):
  - The sign-up form requires a date of birth and an unticked agreement checkbox.
  - The server refuses under-18 sign-up before any provider account exists.
  - Signed-in accounts without a birth date or acceptance of the current `TERMS_VERSION` get `AGREEMENT_REQUIRED` from `requireAccount`, and the UI shows the agreement gate.
  - An under-18 date at the gate erases the account.
  - The birth date cannot be changed once stored.
- **Data rights:**
  - `GET /api/auth/account/export` returns every row that references the user, found from the catalog, without secret or digest columns.
  - The `delete-account` action:
    - requires a fresh sign-in or MFA and typing `DELETE`;
    - refuses while the user is an organization's last owner;
    - queues the user's images for R2 deletion;
    - keeps email and phone in `deleted_accounts` for 180 days (IT Rules 3(1)(h)), then deletes the user (cascade) and the Supabase identity inside the same transaction.
  - Both actions remain available while an agreement is pending.
- **Retention**, run hourly by `applyRetention()`:
  - expired `deleted_accounts` are purged;
  - ended sessions are deleted after 180 days;
  - notifications and audit logs after 1 year.
- **Internal pages:** in production the proxy rewrites `/design-system` and `/foundation` to an unmatched path, giving a real 404 while keeping the CSP.
- **Firebase:** the Firebase provider allows `accept-terms`.
- **Docs:** `docs/legal-compliance.md` maps the DPDP Act, SPDI Rules, IT Rules 2021, CERT-In, consumer and child-labour law to the implementation, operating procedures and gaps.

## Validation (local)

- New tests:
  - `tests/legal-rights.integration.test.ts` (10): agreement gate, consent recorded once with an immutable birth date, under-18 erasure, under-18 sign-up refused, export without secrets, re-authentication required, 180-day retention and purge, provider refusal keeps the account, last-owner refusal.
  - `tests/legal-pages.test.ts` (3): production 404 with CSP, browser and server age rules in step, required pages and phrases plus footer links.
- Updated tests: navigation inventory (42 routes), signup schema, table counts (52), the Firebase HTTP helper accepts terms.
- Unit: 760 passed. Embedded PostgreSQL: 214 passed, 2 skipped. Typecheck, lint and Prettier pass.
- **Not verified:**
  - Hosted CI for this commit.
  - Migration `0015` on Neon.
  - The live flows.
  - Legal review by a qualified Indian lawyer.

## Remaining

Fill `OPERATOR`, then build: the moderator content takedown tool, an in-app report button with tracked grievances, the annual rules reminder, and Indian log residency once paid plans allow. Details are in `docs/legal-compliance.md`.
