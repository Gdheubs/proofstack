# Controlled-beta deployment runbook

This runbook describes the approved staging target. It does not authorize a
production database migration, paid service, custom domain purchase, or public
launch.

## Services

| Component               | Provider       | Configuration                                                                              |
| ----------------------- | -------------- | ------------------------------------------------------------------------------------------ |
| Web                     | Cloudflare     | Workers via OpenNext, Root Directory `artifacts/proofstack` (see below).                   |
| API                     | Render         | Create from `render.yaml`; it deliberately requires secret values to be entered in Render. |
| Database, Auth, Storage | Supabase       | Create one fresh staging project; do not reuse local or existing identity data.            |
| CI                      | GitHub Actions | Require the repository CI and security workflows for the exact release commit.             |

## Required configuration

### Render API

Set these in Render's secret/configuration UI:

- `DATABASE_URL`: the server-only Supabase PostgreSQL connection string.
- `AUTH_APP_ORIGIN`: the exact HTTPS frontend (Worker) URL, without a trailing slash.
- `CORS_ALLOWED_ORIGINS`: that same exact frontend URL.
- `TRUST_PROXY_CIDRS`: only Render's currently documented proxy ranges after verifying them for the deployment region.
- `PROXY_SHARED_SECRET`: a random value of at least 32 characters, identical to the web tier's value. Preflight fails without it; otherwise every browser behind the web proxy shares one rate-limit bucket.
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and a 32+ character random `SESSION_SECRET`.

- `PRIVATE_OBJECT_DIR`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`: image storage (see below). Preflight checks the namespace and credentials.

Leave `REPOSITORY_ROOT`, `INTELLIGENCE_ENABLED`, and optional AI keys empty for
the initial free-tier beta. Those features need the acceptance work in the
production plan.

### Cloudflare R2 image storage

Create one **private** R2 bucket (no public bucket URL or custom domain) and an
R2 API token with Object Read & Write limited to that bucket. Set
`PRIVATE_OBJECT_DIR=/<bucket>/<prefix>` and `R2_ENDPOINT` to the exact
`https://<account-id>.r2.cloudflarestorage.com` origin. No bucket CORS rule is
needed: browsers upload to the same-origin API, which enforces the 8 MiB limit,
declared size, type and signature before writing, and serves every image after
SQL authorization. Do not add an object lifecycle rule under `<prefix>/ready/`;
completed images live there. Deleted images are removed by the supervised
cleanup worker (`ASSET_CLEANUP_ENABLED=true`,
`ASSET_CLEANUP_ALLOWED_NAMESPACES=/<bucket>/<prefix>`, same R2 and database
settings).

### Cloudflare Workers web

The Next.js frontend runs on **Cloudflare Workers** through the OpenNext adapter
(`@opennextjs/cloudflare`). Cloudflare Pages is not used: its Next.js adapter is
deprecated and does not support Next.js 16.

1. In Cloudflare → Workers & Pages → Create → Import a repository, select this
   repository. Root directory: `artifacts/proofstack`. Build command:
   `pnpm --filter @workspace/proofstack run cf:build`. Deploy command:
   `npx wrangler deploy`. Use Node 24 and pnpm 11.25.0.
2. Build variable: `API_INTERNAL_ORIGIN` = the exact HTTPS Render API origin.
   Next bakes the `/api/*` rewrite at build time, so change it only with a rebuild.
3. Runtime secret: `PROXY_SHARED_SECRET` (same value as the API). The
   `TRUSTED_CLIENT_IP_HEADER=cf-connecting-ip` variable is already set in
   `wrangler.jsonc`; Cloudflare overwrites that header, so browsers cannot forge it.
4. Set `AUTH_APP_ORIGIN` and `CORS_ALLOWED_ORIGINS` on the API to the Worker's
   exact HTTPS origin (`https://proofstack-web.<subdomain>.workers.dev` or your
   custom domain).

Do not expose API secrets as `NEXT_PUBLIC_*` variables. Browsers call only the
same-origin `/api/*` path; the web proxy strips any client-sent
`x-proofstack-*` trust headers and forwards the edge-provided address with the
secret, and the API ignores the address unless the secret matches.

`wrangler.jsonc` enables `nodejs_compat` and `global_fetch_strictly_public`
(the Worker may fetch only public addresses). Local `wrangler dev` does not
enforce the latter, so verify the deployed rewrite reaches only the Render API.

**Limits.** Workers Free allows a 3 MiB compressed Worker and about 10 ms of CPU
per request; Workers Paid ($5/month) allows 10 MiB and 30 s. CI runs
`scripts/ci-check-worker-size.mjs` after every build and fails above 3 MiB
(measured: 2,636 KiB gzip). CPU time cannot be measured locally: after the first
deployment, check Workers → Metrics → CPU time for server-rendered routes, and
move to Workers Paid if requests exceed the free limit. `cf:build` must run on
Linux (CI, Cloudflare's builder or WSL); OpenNext's bundler cannot read pnpm's
symlinked dependencies on Windows. Use `pnpm dev` for local development.

### Supabase

Configure the frontend URL as the authorized application/site URL and the exact
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
   the Cloudflare Worker.
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
