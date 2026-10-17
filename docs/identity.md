# Phase 2 — identity, accounts and security

The Supabase-specific flows below apply only in `AUTH_PROVIDER=supabase` (the default). Firebase Google/GitHub identity, session wiring, supported account operations, and deliberately pending MFA/credential operations are documented separately in [Firebase authentication](firebase-auth.md). Do not treat Supabase enrollment/recovery instructions as Firebase support.

## Implemented boundaries

Supabase Auth verifies primary identity, email/phone codes, OAuth and native MFA. The app has no password database and never accepts a locally generated authentication OTP. MSG91 is transport only.

The browser holds a random 256-bit `__Host-ps-session` HttpOnly, Secure cookie. Only a keyed digest is used for lookup. AES-256-GCM with purpose-separated keys derived from `SESSION_SECRET` encrypts provider access/refresh credentials and PKCE state in the existing Replit PostgreSQL database. This does not replace the database with Supabase.

Each authenticated request verifies the exact credential with Supabase `getUser()` before interpreting claims. On-demand refresh is serialized per app session. Local revocation is immediate, including individual devices and logout-all; global logout also requests native provider revocation. Provider access JWTs may remain valid until their own expiry, but cannot re-enter a revoked app session.

Sessions expire absolutely after seven days or after thirty minutes idle. Password-reset sessions expire after ten minutes. Code verification handles expire after five minutes; signup/OAuth/reset PKCE flows after twenty minutes. Native expiry also applies. Only the latest browser-bound flow can be verified. Callback cookies and PKCE verifier state prevent accepting an unsolicited callback. Email links must be opened in the browser that requested them. Invalid callbacks return a safe `/auth?error=callback_failed`.

The API requires an exact application Origin and signed double-submit CSRF token on mutations. Auth responses are private/no-store. Development cookies use SameSite=None for Replit's iframe; production uses Lax. Use a top-level app tab when browser third-party-cookie policy prevents preview authentication. Social sign-in must run outside the iframe.

## Screens and API

- `/auth`: password signup/login, email code, phone code, social sign-in, reset requests, native MFA and backup-code recovery.
- `/account`: verified profile and account ID, phone verification, password change, device sessions, MFA, backup codes, organization memberships and activity.
- `/account/admin`: server-authorized platform account management.
- `GET /api/auth/context`: safe account context, browser CSRF token and provider capabilities.
- `POST /api/auth/action`: strict, action-specific validated operations, documented in OpenAPI.
- `GET /api/auth/account`: owner-scoped account details.
- `GET /api/auth/admin/users`: platform roles only, requires fresh native MFA.
- `GET /api/auth/callback`: browser-bound server-side PKCE exchange.
- `POST /api/auth/hooks/send-sms`: raw-body Standard Webhooks HMAC verification, timestamp protection, idempotent receipts and MSG91 delivery.

Reuse `requireManagedIdentity` before tenant permission checks on future protected routes. Account/profile data is never proof of tenancy.

## Roles and MFA

Developer, Company and Recruiter are profile kinds, not administrative privileges or business-verification certificates. Organization owners/admins are membership grants. Only owners manage organization roles; active members may read their own memberships. The final active owner cannot be demoted.

Moderator may enable/disable nonprivileged users. Admin may manage standard/Moderator accounts and grant/remove Moderator. Super Admin may manage administrative roles. Self-management of platform access is forbidden, and the final active Super Admin is protected. Status/role changes revoke the target's app sessions. The privileged-management transaction rechecks live actor access.

Native TOTP enrollment/verification is implemented. Phone MFA additionally requires working SMS hooks and provider-plan support. Pending MFA does not authorize account APIs or a trusted principal. Platform roles and active organization owner/admin memberships require native MFA. Sensitive operations require a fresh native AAL2 verification (five minutes) and a currently verified native factor, not an app-minted assurance claim. Privileged accounts cannot remove their final verified factor.

Backup codes use an explicit app-owned recovery policy: eight high-entropy single-use codes, keyed hashes only, shown once, generated after fresh native MFA. A recovery code alone cannot sign in. A fresh Supabase-verified primary sign-in is required. Redemption atomically marks the code used, revokes app sessions and restricts the account, then resets native factors via the server admin API. All remaining codes are invalidated on completed recovery. The user must sign in and enroll/verify a new native factor. This is **not** native AAL2 impersonation. Interrupted provider recovery fails closed; retry with another unused code or operator assistance. The installed SDK contains experimental native recovery-code APIs; do not substitute those without checking deployed-provider support and updating this policy explicitly.

## Controls and alerts

- PostgreSQL-backed purpose-specific identifier/IP limits, in addition to the existing API limiter.
- OTP send cooldown: one/minute; three sends/ten minutes. Five verification attempts/fifteen minutes.
- Five credential/code failures within fifteen minutes trigger a fifteen-minute identifier lock.
- New-device detection uses a signed persistent device marker and records a security event plus an in-app notification. It is a warning heuristic, not location/intelligence scoring.
- Sign-in failures/success, lockout, MFA, recovery, password changes, device revocation, profile changes and privileged changes are audited without credentials or codes.
- Expired PKCE flows and hook receipts are pruned; expired/revoked/idle-session credentials are cleared. Audit retention is not silently deleted.
- Existing conservative proxy trust remains. Shared proxy clients can share an IP bucket; identifier limits still apply. Review trusted proxy CIDRs and production policy before launch.

## First Super Admin

No default privileged account is seeded. On the development app, create/sign in to a real account, enroll and verify MFA, and copy its application account ID. An authorized workspace operator can run:

```sh
NODE_ENV=development pnpm --filter @workspace/api-server run bootstrap:admin -- <account-uuid> --confirm-first-super-admin
```

The command requires an existing active, provider-verified account with verified native MFA and no existing Super Admin. It is development-only, audited, transactional and revokes the account's sessions. Sign in again. Later grants use the protected UI/API. This does not establish a production bootstrap procedure.

## Deferred configuration — complete last

Configured development credentials: Supabase project URL/public key/server key and MSG91 auth key. Remaining provider settings are intentionally deferred.

1. Set the MSG91 **OTP-section** template ID (`MSG91_OTP_TEMPLATE_ID`), not a DLT or Flow ID. Add `SUPABASE_SMS_HOOK_SECRET` through Secrets. In Supabase, enable phone authentication and configure the signed Send SMS HTTP hook at the app origin plus `/api/auth/hooks/send-sms`. Confirm current MSG91 custom-OTP support for this template and verify that the actual received SMS code succeeds at Supabase verification. Do not treat API acceptance as proof of correct delivery.
2. Configure Google/GitHub in Supabase with each provider's correct callback URL. Supabase then redirects to the app's `/api/auth/callback`.
3. Set Supabase's exact app callback redirect allowlist and Site URL. Development can use the current HTTPS workspace origin. Production requires `AUTH_APP_ORIGIN` set to the actual published HTTPS origin; do not guess it.
4. Public email needs a verified sending domain and SMTP. Until then, Supabase's built-in sender is team-address-only and currently limited to two sends/hour. Keep email confirmation enabled. `AUTH_EMAIL_SMTP_READY=true` is an operator readiness declaration only after actual delivery is verified.
   For numeric email OTP, include Supabase's `{{ .Token }}` in the relevant email templates and verify received-code login. Browser-bound links remain supported; do not replace native codes with app-generated values.
5. Only set `AUTH_PHONE_MFA_READY=true` after provider entitlement and actual phone-factor enrollment/challenge/verification work.
6. Make required server settings/secrets available in production and validate every live delivery and OAuth path before launch. Rotating `SESSION_SECRET` invalidates encrypted sessions/flows and recovery-code hashes; plan logout/re-enrollment accordingly.

Disabled providers remain visibly pending. No development OTP bypass or fake delivery fallback is installed.
