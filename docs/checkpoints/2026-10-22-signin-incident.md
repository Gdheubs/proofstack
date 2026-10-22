# Sign-in incident: API deployed ahead of migrations — October 22, 2026

Parent: `913477e`.

## Symptoms (owner report)

- Sign-in showed "The request could not be completed".
- The verification email from Supabase seemed to "expire within seconds".

## Cause

Render was deployed with `913477e` while production Neon was still at 15 migrations; the code needs 18.

- **Password sign-in:** every sign-in runs `upsertProviderUser`, which reads `consent_records` and `users.birth_date` (migration `0015`). Those failed with a database error, which became the generic 500.
- **Email confirmation:** Supabase verified the address, then redirected to `/api/auth/callback`. There the same failure was caught, and the page showed "callback failed … may have expired". The link had not expired.

Checked as part of the diagnosis:

- **Supabase redirects:** the Site URL and the redirect allowlist are correct. A verify request with a dummy token redirects to `/api/auth/callback`; an unknown `redirect_to` falls back to the site.
- **`AUTH_APP_ORIGIN`** matches the website: an app-origin POST returns `CSRF_REJECTED`, not `ORIGIN_DENIED`.
- **Live validation:** a wrong password gives `AUTH_FAILED`; under-18 sign-up gives `AGE_REQUIREMENT`; a missing birth date or the retired `company` type gives 400.

## Fix

- **Production migrated** with `migrate:release`: 15 → 18 migrations, a rerun applied 0, 53 tables.
- **Guard against recurrence:** `middlewares/schema-guard.ts`. In production, until `checkReadiness()` finds every table and column the code uses, API requests get 503 `SERVICE_UPDATING` ("ProofStack is being updated…") instead of failing part-way. Health probes are exempt. The result is cached for 5 minutes once ready and 5 seconds while not ready.
- **Callback message:** it now says the email is usually verified already and to try password sign-in. It also explains that links only complete sign-in in the browser and on the device where sign-up started, which is a PKCE requirement.

Accounts that clicked their link during the incident are verified in Supabase and can now sign in with their password.

## Release order (unchanged, now enforced)

1. Run `migrate:release` on staging, then production.
2. Deploy Render.
3. The Worker deploys itself from GitHub.

Deploying Render first now shows "being updated" until step 1 is done.
