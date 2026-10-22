# Public surface, profile types and notification bell — October 22, 2026

Parent: `30f30a6` (legal pages). Owner requests: hide the technology stack from anything the public can see, keep only Developer and Recruiter profiles, and move notifications out of the Build log menu.

## Changes

- **No provider names in public view.**
  - The public auth context returns `pendingSetup: []`. Operator setup progress is no longer published, and the sign-in page no longer prints "Pending setup".
  - Sign-in methods that are not enabled are hidden instead of shown as pending.
  - API error messages and Firebase-mode UI text no longer name Supabase, Firebase, MSG91 or SMTP.
  - The Privacy Policy lists providers by role and region and offers names on request.
  - A custom Worker entry (`artifacts/proofstack/worker.ts`) removes `rndr-id`, `x-render-origin-server` and similar upstream headers. Cloudflare's own `Server` and `CF-Ray` headers are added by the edge and cannot be removed.
  - `tests/public-disclosure.test.ts` fails if provider names reappear in page text or `ApiError` messages, or if the setup list is published again.
- **Two profile types.** Migration `0016` converts `company` profiles to `recruiter` and recreates `profile_kind` as `developer | recruiter`. Old sign-up metadata saying "company" maps to recruiter. Companies are represented by organizations.
- **Notification bell.**
  - `/notifications` left the Build log group. A bell with the unread count now sits in the header for signed-in users at every width.
  - Navigation tests treat `/notifications` as ungrouped.

## Validation

Unit: 764 passed (after updating message assertions). Embedded PostgreSQL: 214 passed, 2 skipped. Typecheck, lint and Prettier pass. The Worker build with the custom entry was checked on Linux before pushing.
