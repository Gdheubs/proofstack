# Controlled-beta deployment runbook

This runbook describes the approved staging target. It does not authorize a
production database migration, paid service, custom domain purchase, or public
launch.

## Services

| Component | Provider       | Configuration                                                                              |
| --------- | -------------- | ------------------------------------------------------------------------------------------ |
| Web       | Cloudflare     | Workers via OpenNext, Root Directory `artifacts/proofstack` (see below).                   |
| API       | Render         | Create from `render.yaml`; it deliberately requires secret values to be entered in Render. |
| Database  | Neon           | Serverless PostgreSQL; direct endpoint; migrations via `migrate:release` (see below).      |
| Auth      | Supabase       | Create one fresh project used only for Auth; do not reuse existing identity data.          |
| Images    | Cloudflare R2  | Private bucket; see below.                                                                 |
| CI        | GitHub Actions | Require the repository CI and security workflows for the exact release commit.             |

## Required configuration

### Render API

Set these in Render's secret/configuration UI:

- `DATABASE_URL`: the server-only Neon **direct** connection string (see below); `DATABASE_POOL_MAX=5` on the free compute.
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

### Neon database

The application database is **Neon** serverless PostgreSQL; Supabase is used
only for Auth. Create a Neon project in the region nearest Render (for India,
`aws-ap-south-1` Mumbai or `aws-ap-southeast-1` Singapore) on PostgreSQL 17.

- `DATABASE_URL` (Render, GitHub `production` environment): the **direct**
  (non-pooled, host without `-pooler`) connection string with
  `sslmode=verify-full&channel_binding=require`. The pool sets per-session
  timeouts that Neon's transaction pooler does not keep; preflight fails on a
  pooled host or a URL without TLS. Neon's certificates are publicly trusted,
  so no CA file is needed, and Neon accepts IPv4 (Render and GitHub runners).
- `DATABASE_POOL_MAX`: connections per process (default 10). Use `5` on the
  free 0.25 CU compute, where workers also connect.
- **Migrations:** run once per release, never at startup:
  `MIGRATION_TARGET_HOST=<exact host> DATABASE_URL=<direct url> pnpm --filter @workspace/db run migrate:release`.
  It refuses a host that does not match `MIGRATION_TARGET_HOST` and pooled
  endpoints, waits at most 10 s for locks, and reports how many migrations ran.
- **Scale to zero:** Neon Free suspends compute after 5 minutes idle and
  includes 100 CU-hours per month; the first request after idle waits for the
  compute to resume (the pool allows 10 s). Point uptime monitors at
  `/api/healthz` (no database), **not** `/api/readyz`: a five-minute
  database probe keeps the compute awake permanently (about 182 CU-hours a
  month at 0.25 CU) and exhausts the free allowance.
- **Branching:** create a Neon branch per staging environment or pull request
  for disposable copies of production schema/data; apply `migrate:release` to
  the branch first when rehearsing a release.
- **Recovery:** Neon Free keeps 6 hours of history for point-in-time restore;
  the nightly encrypted `pg_dump` in `docs/operations.md` covers longer.

### Supabase Auth

Supabase provides identity only (email/password, email OTP, social sign-in,
MFA). Configure the frontend URL as the authorized site URL and the exact
redirect URL, and set Resend (or another provider) as custom SMTP under
Authentication → Emails. Store the Supabase secret key only in Render. The
Supabase project's own database holds the `auth` schema; back it up with the
optional identity backup in `docs/operations.md`. Free projects pause after a
week without activity, which also stops sign-in; keep real usage or an uptime
check on a sign-in-related endpoint, or upgrade before launch.

### Code editor (GitHub)

The editor at `/editor` edits GitHub repositories through a GitHub OAuth App owned by the operator. Hosted ProofStack repositories appear there only when `REPOSITORY_ROOT` points at a durable disk (a paid Render plan with a disk).

1. Go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.
   - Homepage URL: the website origin.
   - Authorization callback URL: `<AUTH_APP_ORIGIN>/api/editor/github/callback`.
2. Set `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` on Render. Without both, the editor shows GitHub as not available.

Users grant the `repo` scope so they can commit to their private repositories. Their token is sealed with `SESSION_SECRET` in `github_connections` and never reaches the browser. It is deleted when they disconnect, delete their account, or GitHub reports it revoked. Rotating `SESSION_SECRET` makes users reconnect.

## Verification sequence

1. Confirm the Git SHA, clean working tree, and green hosted CI.
2. Run the local frozen install and full checks on the same SHA.
3. Create the Neon project (and a staging branch) and the Supabase Auth
   project; inspect the target connection, TLS mode and roles.
4. Run `migrate:release` against the target, then API preflight.
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
