# Deployment CI repair checkpoint — October 17, 2026

## Scope

Continued the staging deployment intake from `0cdc9e005a75b7874d5a3ea75590c02443211ebd`. The working tree already contained the scoped CI repair; those changes were inspected and completed, not discarded. No application behavior, database, identity provider configuration, DNS or cloud service was changed.

## Confirmed failures and changes

- Hosted application CI run `38985593017` failed root test typechecking with `TS2307` for `express`, followed by implicit-any errors. Root tests import Express directly, but only the API workspace declared it. Root development dependencies and the root lockfile importer now explicitly declare the same `express` and `@types/express` versions as the API.
- Hosted security run `38985592960` failed CodeQL with `Resource not accessible by integration` at the workflow-run endpoint. Added `actions: read` only to the CodeQL job; workflow defaults and secret-scanner permissions remain unchanged. The log also warns that code scanning is not enabled; this permission change alone does not prove entitlement or successful SARIF upload.
- Existing new regression tests enforce both dependency declarations and narrow CodeQL permissions. The first fresh local check caught two `no-regex-spaces` lint errors in the in-progress test; fixed with explicit regex space quantifiers without changing the intended match.

Changed files: `.github/workflows/security.yml`, `package.json`, `pnpm-lock.yaml`, `tests/ci-workflows.test.ts`, `tests/dependency-policy.test.ts`, this checkpoint and its index.

## Fresh local validation

- `pnpm check`: passed lint, repository formatting, workspace/test typecheck and **615 unit tests across 44 files**.
- `pnpm install --frozen-lockfile --ignore-scripts`: passed; validates lockfile consistency against the existing install, not a cold install or native lifecycle execution.
- `git diff --check`: passed before checkpoint creation.
- Hosted verification remains a separate exact-commit gate. A queued run or a locally passing config test is not proof that either hosted failure is resolved.

Evidence logs are under ignored `.local/production-audit/deployment-*`. No secrets are committed or printed.

## Provider access and deployment boundaries

- Direct Vercel integration successfully read the authenticated `gdheubs` user on Hobby and found no matching ProofStack project. No Vercel project/deployment was created.
- Supabase, Sentry and Cloudflare hosted connectors were unconnected at discovery. Authorization links were supplied to the owner; completion has not been confirmed.
- Render still needs authenticated access and selection of the intended workspace. No API key/password was requested in chat.
- Existing intake remains free-only, personal/non-commercial staging, fresh Supabase, provider HTTPS URLs first. A custom domain is still needed for the requested Cloudflare DNS/proxy protections; provider URLs are not claimed to be Cloudflare protected.
- Current official provider documentation was rechecked through search: Supabase Free lists 500 MB database, 1 GB file storage and two active projects; Render Free idles after 15 minutes and lacks persistent disks; Vercel discourages placing an extra reverse proxy in front of its CDN/firewall. Do not assume three free projects or add accounts to pool allowances. Ask the owner before approved expansion or paid resources.

Sources: https://supabase.com/pricing ; https://render.com/docs/free ; https://vercel.com/docs/security/reverse-proxy . Direct page extraction was unavailable with the configured extraction backend; first-party search results supplied the cited provider statements.

## Next actions

1. Push this scoped repair and inspect exact-head application/security workflow results. Do not bypass security upload/entitlement failures or enable a paid feature silently.
2. Confirm Supabase/Sentry/Cloudflare authorizations and Render workspace access.
3. Prepare and verify fresh staging resources, least-privileged database access, exact auth origins, Render API and Vercel frontend. Implement Sentry with sensitive-data scrubbing before enabling event delivery.
4. Keep uploads, native Git and background jobs within the already approved staging limitations; these require additional adapters/durability/provider acceptance, not just environment settings.

**No cloud application has been deployed in this task. Production readiness remains unapproved.**
