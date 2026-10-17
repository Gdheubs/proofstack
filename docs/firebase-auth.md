# Firebase authentication setup and boundaries

ProofStack defaults to `AUTH_PROVIDER=supabase`. Select `AUTH_PROVIDER=firebase` explicitly to use Firebase Google/GitHub social identity. Unknown modes fail closed; the API never falls back to Supabase when Firebase is selected. Existing Supabase subjects are not silently migrated or linked by email/phone.

## Configuration (no secrets in the repository)

1. Set `AUTH_APP_ORIGIN` to the exact HTTPS app origin, without a path or trailing slash. Configure CORS/proxy and Firebase authorized domains for the actual deployment.
2. Set a random server-only `SESSION_SECRET` of at least 32 characters. Keep the existing PostgreSQL database/migrations; Firebase does not replace application storage.
3. Set `FIREBASE_PROJECT_ID`. Supply Firebase Admin Application Default Credentials using workload identity or an external service-account file selected with `GOOGLE_APPLICATION_CREDENTIALS`. Never commit the file, paste private-key contents into browser config, or expose credentials through `NEXT_PUBLIC_*`.
4. Set `FIREBASE_WEB_CONFIG_FILE` to a public Web App config JSON file, or provide `FIREBASE_WEB_API_KEY`, `FIREBASE_WEB_AUTH_DOMAIN`, `FIREBASE_WEB_PROJECT_ID`, and `FIREBASE_WEB_APP_ID`. The project must match the Admin project; the auth domain must be `<projectId>.firebaseapp.com`. The API returns only `apiKey`, `authDomain`, `projectId`, and `appId`, even if a config file contains additional fields.
5. Set the same public `FIREBASE_WEB_AUTH_DOMAIN=<projectId>.firebaseapp.com` on the **Next.js process as well as the API**, including when the API reads a public config file. Next uses this exact domain to allow the Firebase auth iframe and the identity-toolkit/secure-token endpoints in CSP. This is not an Admin credential. No wildcard Firebase domains or `unsafe-eval` are enabled in production. The SDK's dynamically loaded popup resolver inherits nonce-based `strict-dynamic` script trust. Verify the actual deployed response headers; an API-only configuration cannot change the web server's CSP.
6. Enable Google/GitHub in Firebase Authentication and configure each provider's real redirect/authorized-domain requirements. Set `FIREBASE_GOOGLE_ENABLED=true` / `FIREBASE_GITHUB_ENABLED=true` only after live sign-in works. These flags advertise browser availability; they are not substitutes for provider configuration.
7. Verify a top-level HTTPS browser sign-in. Emulator configuration is test-only and rejected outside tests. Do not use a local identity/OTP bypass.

## HTTP/application session contract

- `GET /api/auth/firebase/config` is private/no-store. It returns `{provider:"supabase"}` in legacy mode, or `{provider:"firebase",firebase:{apiKey,authDomain,projectId,appId},providers:{google,github}}` in Firebase mode. No Admin credentials are returned.
- Obtain signed CSRF/device cookies and a CSRF token through `GET /api/auth/context`. After native sign-in, send only `{idToken}` to `POST /api/auth/firebase/session` with the exact Origin and matching `X-CSRF-Token`. The strict body is bounded to 16,384 token characters; arbitrary role/contact/refresh-token fields are rejected. Exchange attempts have a PostgreSQL-backed IP budget of ten per ten minutes.
- A verified, recent native token is exchanged for an opaque HttpOnly/Secure `__Host-ps-session` cookie. The browser never receives the Admin session cookie or encrypted provider credentials. PostgreSQL stores a keyed handle digest, device binding, and authenticated encrypted Firebase credentials.
- Resume checks native revocation/current verified contacts and factors outside SQL locks, then rechecks the persisted session and account binding under a transaction. Native authentication time anchors freshness and seven-day expiration. Thirty-minute inactivity expires application sessions. A missing/forged/different signed device marker cannot resume the session or revoke the legitimate browser's credentials.
- Contacts/assurance come from the verified native identity and current Firebase user record, not custom role claims or client metadata. UID subjects are project-namespaced; non-UUID native UIDs are supported. Reusing a consumed ID token cannot revive an application session. Verified-contact collisions return `AUTH_IDENTITY_LINK_REQUIRED`; explicit account linking is not implemented.
- Local logout/device revocation destroys local stored credentials immediately. Global logout also calls Firebase `revokeRefreshTokens` for the verified bound UID. Local revocation remains effective and cookies are cleared if global provider revocation fails; the API reports that failure safely rather than claiming provider-wide success.
- Successful legacy PKCE callbacks return to `/auth` so the auth UI can consume its own allowlisted tab-local return destination once context is ready. Callback query `next` is never a server redirect target. Failed callbacks still go to `/auth?error=callback_failed`.

## Supported and deliberately pending operations

Common account/context reads, profile updates, device revocation, local/global logout, and database-only account administration retain their authorization checks. Organization creation still requires fresh, current native second-factor assurance. Privileged roles and recovery-pending accounts fail closed without the required native assurance.

Firebase-native enrollment, challenges/step-up API, factor removal, backup-code generation/recovery, password/OTP/contact-change flows, and target-factor verification for organization role assignment are **not implemented**. They return explicit HTTP 409 `AUTH_METHOD_UNAVAILABLE`, never call Supabase as a fallback, and must remain visibly pending. `capabilities.totp` and `phoneMfa` are false in Firebase mode, even if a legacy `FIREBASE_TOTP_ENABLED=true` flag is present. Verification of already-enrolled native factors is not a promise of application enrollment support.

## Verification and production blockers

The route/session integration tests execute tracked migrations and real PostgreSQL SQL through the disposable embedded transport. Only the external provider SDK/HTTP boundary is faked. They cover opaque encrypted sessions, origin/CSRF/body/rate protections, device binding, provider dispatch, principal/MFA gates, account/profile/device operations, logout scopes, provider outages, and callback return behavior.

```sh
pnpm typecheck
pnpm exec vitest run tests/auth-provider-selection.test.ts tests/auth-security.test.ts tests/auth-limits.test.ts tests/firebase-provider.test.ts tests/firebase-auth-routing.test.ts
RUN_DB_TESTS=1 pnpm exec vitest run --config vitest.embedded.config.ts tests/firebase-auth-http.integration.test.ts tests/firebase-sessions.integration.test.ts tests/auth-callback.integration.test.ts tests/organization-role-policy.integration.test.ts
```

On Windows Git Bash, put `RUN_DB_TESTS=1` before `pnpm exec` as shown; the package-script inline environment assignment may be interpreted by `cmd.exe`. Embedded SQL is not evidence of native PostgreSQL wire/TLS/concurrent-lock behavior. Faked provider tests do not prove real ADC, provider enablement, authorized domains, delivery, native MFA enrollment, or production OAuth success. These require operator configuration and live end-to-end validation before launch. Switching providers/rotating the session secret invalidates usable sessions; plan explicit migration/linking separately.
