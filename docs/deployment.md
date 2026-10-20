# Controlled-beta deployment runbook

This runbook describes the approved staging target. It does not authorize a
production database migration, paid service, custom domain purchase, or public
launch.

## Services

| Component               | Provider       | Configuration                                                                              |
| ----------------------- | -------------- | ------------------------------------------------------------------------------------------ |
| Web                     | Vercel         | Import the GitHub repository and set Root Directory to `artifacts/proofstack`.             |
| API                     | Render         | Create from `render.yaml`; it deliberately requires secret values to be entered in Render. |
| Database, Auth, Storage | Supabase       | Create one fresh staging project; do not reuse local or existing identity data.            |
| CI                      | GitHub Actions | Require the repository CI and security workflows for the exact release commit.             |

## Required configuration

### Render API

Set these in Render's secret/configuration UI:

- `DATABASE_URL`: the server-only Supabase PostgreSQL connection string.
- `AUTH_APP_ORIGIN`: the exact HTTPS Vercel URL, without a trailing slash.
- `CORS_ALLOWED_ORIGINS`: that same exact Vercel URL.
- `TRUST_PROXY_CIDRS`: only Render's currently documented proxy ranges after verifying them for the deployment region.
- `PROXY_SHARED_SECRET`: a random value of at least 32 characters, identical to the web tier's value. Preflight fails without it; otherwise every browser behind the web proxy shares one rate-limit bucket.
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and a 32+ character random `SESSION_SECRET`.

Leave `REPOSITORY_ROOT`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS`,
`INTELLIGENCE_ENABLED`, and optional AI keys empty for the initial free-tier
beta. Those features need the acceptance work in the production plan.

### Vercel web

Set `API_INTERNAL_ORIGIN` to the exact HTTPS Render service URL before each
build. Do not expose API secrets as `NEXT_PUBLIC_*` variables. Use the Render
API URL only for the server-side Next.js rewrite; browsers continue to call the
same-origin `/api/*` path.

Set the server-only `PROXY_SHARED_SECRET` (same value as the API) and
`TRUSTED_CLIENT_IP_HEADER` to the header the hosting edge itself sets and
overwrites: `cf-connecting-ip` on Cloudflare, `x-real-ip` on Vercel. Never pick a
header the actual host passes through from the browser. The web proxy strips any
client-sent `x-proofstack-*` trust headers and forwards the edge-provided address
with the secret; the API ignores the address unless the secret matches.

### Supabase

Configure the Vercel URL as the authorized application/site URL and the exact
redirect URL. Store the Supabase secret key only in Render. Apply database
migrations through a reviewed release command against the fresh staging target,
never through application startup.

## Verification sequence

1. Confirm the Git SHA, clean working tree, and green hosted CI.
2. Run the local frozen install and full checks on the same SHA.
3. Create the fresh Supabase staging project and inspect the target connection,
   TLS mode, migration role, and backup/export limitations.
4. Apply reviewed migrations and run API preflight against the target.
5. Deploy Render API, verify `/api/healthz` and `/api/readyz`, then deploy
   Vercel web.
6. With dedicated test accounts, verify registration/login, logout, protected
   route rejection, cross-user isolation, core community workflow, and error
   logging.
7. Record results in a release checkpoint before inviting any beta users.

## Rollback

Rollback application code by redeploying the prior verified Git commit. Do not
roll back database migrations by editing applied migration files or dropping
data. Use a forward-compatible corrective migration after a backup/recovery
review. If a release threatens data integrity or confidentiality, enable the
existing maintenance mode and stop affected workers before taking further
action.
