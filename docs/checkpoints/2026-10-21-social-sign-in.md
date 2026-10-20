# Social sign-in providers — October 21, 2026

Parent: `54477e3` (image re-encoding). Hosted [ProofStack CI](https://github.com/Gdheubs/proofstack/actions/runs/39506301758) and [ProofStack Security](https://github.com/Gdheubs/proofstack/actions/runs/39506301655) passed on `54477e3`; the real-image tests ran on Ubuntu there.

## Scope

Offer Google, GitHub, Microsoft, LinkedIn, GitLab, Discord, X and Facebook through Supabase Auth, showing only providers the Supabase project has enabled. Requested: real-user verification. **Not performed**: no Supabase project, OAuth apps or deployment exist yet, so no live provider sign-in could be attempted. Everything up to that boundary is implemented and tested; a credential-free staging smoke check was added for the deployed environment.

## Changes

- `services/auth-input.ts`: `SOCIAL_PROVIDERS` (`google`, `github`, `azure`, `linkedin_oidc`, `gitlab`, `discord`, `x`, `facebook`); the `oauth` action accepts only these. Legacy `twitter` (OAuth 1.0a), `apple`, `linkedin` and custom providers are rejected at validation.
- `services/auth-provider.ts`: `capabilities().socialProviders` lists the supported providers Supabase's `/auth/v1/settings` reports enabled, in display order. Firebase mode maps its Google/GitHub flags. The `google`/`github` booleans remain. `pendingSetup` now reports "Social sign-in providers" only when none are enabled.
- `services/auth-actions.ts`: the OAuth start checks `socialProviders` (`503 OAUTH_SETUP_REQUIRED` otherwise, before any provider call) and requests the `email` scope for Microsoft.
- OpenAPI: new `SocialProvider` enum, `AuthCapabilities.socialProviders`, `AuthActionInput.provider`; regenerated clients.
- `features/auth/auth-view.tsx`: buttons for enabled providers only, with product names (Microsoft, LinkedIn, X…); a notice when none are enabled. Removed the always-visible "pending setup" buttons.
- Unchanged and deliberately kept: sign-in requires a provider-verified email or phone (`IDENTITY_VERIFICATION_REQUIRED`).
- `scripts/smoke-social.mjs` (`ops:smoke-social`): against the deployed HTTPS origin, reads auth context, starts one flow per enabled provider with real CSRF, and inspects (never follows) Supabase's redirect to confirm the provider's real authorization host. `--expect` fails if a listed provider is not enabled.
- `docs/identity.md`: per-provider setup table (where to create the app, callback, required settings such as X email permission, Microsoft email claims, Google consent publishing, Facebook Live requirements) and the smoke command.

## Validation (local)

- `tests/auth-social-providers.test.ts` (17, PGlite with real migrations): capabilities from a fetched settings document offer exactly enabled supported providers in order and ignore `apple`/`twitter`; none enabled reports setup; Firebase mode; each of the eight providers starts with the exact callback redirect, with `scopes: "email"` only for Microsoft; a disabled provider is refused without calling the provider; five unsupported ids rejected.
- `tests/social-sign-in-ui.test.ts` (3, server render): only enabled providers render, in order, with all eight product names; empty state shows the notice.
- `tests/smoke-social.test.ts` (5): pass case with CSRF/cookie forwarding and manual-redirect inspection; unconfigured provider, expected-but-disabled provider and foreign redirect host fail; non-exact/non-HTTPS origins refused.
- `tests/auth-limits.test.ts` fixture updated for `socialProviders`.
- `pnpm run typecheck`, `pnpm lint`, Prettier (`--end-of-line auto`) passed; codegen output matches the spec.
- Unit tests: 715 passed (51 files). Embedded integration: 190 passed, 2 skipped. Next production build passed.

## Required to complete real-user verification

1. Create the Supabase project, set Site URL and the Redirect URL `<AUTH_APP_ORIGIN>/api/auth/callback`.
2. Create each provider's OAuth app with callback `https://<project-ref>.supabase.co/auth/v1/callback` (see `docs/identity.md`) and enable it in Supabase.
3. Deploy, then run `ops:smoke-social <origin> --expect <providers>` and keep its output.
4. With at least one real, previously unused account per provider: sign in, confirm arrival at Account, sign out and in again; then sign in with a second provider sharing the same verified email and confirm it reaches the same account.

## Remaining risks

- Provider behavior (consent-screen publishing, X email permission, Microsoft verified-email claims, Facebook Live mode) is unverified until step 4.
- Several providers require public privacy-policy/terms URLs (task 9).

## Next step

Configure the providers and run the real-user acceptance above, or continue with task 6 (worker run-once mode and scheduled GitHub Actions) while accounts are set up.
