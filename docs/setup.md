# Setup and release runbook

## Target deployment architecture

The intended hosting layout is Cloudflare Workers (OpenNext) for the dynamic Next.js frontend, Render for the Express API and separately supervised workers, Supabase for managed identity and PostgreSQL, and GitHub for source and CI. This application requires running servers and cannot be deployed as a static export. Set the server-only `API_INTERNAL_ORIGIN` to the Render API origin before building the frontend so `/api/*` is proxied same-origin.

Image storage uses a private Cloudflare R2 bucket through its S3-compatible API; see [deployment](deployment.md#cloudflare-r2-image-storage). Optional AI accepts an OpenAI-compatible endpoint and is separately configured through server-side secrets; review its consent and spend controls before enabling it.

## Install and configure

1. Install Node.js 24 and pnpm 11.25.0. Run `pnpm install --frozen-lockfile` at the repository root. The workspace explicitly permits esbuild's installation script.
2. Configure secrets using `.env.example` as the inventory. A copied `.env` is documentation unless your process manager explicitly loads it; the API does not automatically load dotenv files.
3. Set `DATABASE_URL` to a disposable development PostgreSQL database. Apply tracked migrations with `pnpm --filter @workspace/db run migrate:dev`. Production migration execution must be an explicit reviewed release step against the chosen Supabase PostgreSQL project; never run development migrations in production.
4. For accounts, set `AUTH_APP_ORIGIN` to the exact HTTPS browser origin and a random `SESSION_SECRET` of at least 32 characters. For default Supabase mode, set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY`, following `identity.md`. For explicit `AUTH_PROVIDER=firebase`, follow [firebase-auth.md](firebase-auth.md), including Admin credentials, public Web config and `FIREBASE_WEB_AUTH_DOMAIN` on both API and Next for CSP. Do not mix providers or auto-link existing accounts. Never place server secrets in browser variables.
5. For image uploads, set `PRIVATE_OBJECT_DIR` and the `R2_*` credentials for a private Cloudflare R2 bucket ([deployment](deployment.md#cloudflare-r2-image-storage)). Without them, upload requests return `503 STORAGE_CONFIGURATION_REQUIRED` and the rest of the product works. Preserve private access, cleanup fencing and backup requirements.
6. AI is optional. Set the OpenAI-compatible endpoint/key only when using a supported provider; review provider disclosure, consent and spend controls before enabling it.
7. Leave SMTP/phone readiness flags false until actual delivery and entitlement are verified. Follow `identity.md` for SMS-hook signing and OAuth configuration.

## Processes

Run two processes with different ports. Example development commands in separate terminals:

```sh
PORT=8080 pnpm --filter @workspace/api-server run dev
API_INTERNAL_ORIGIN=http://127.0.0.1:8080 PORT=3000 pnpm --filter @workspace/proofstack run dev
```

The optional server-only `API_INTERNAL_ORIGIN` lets Next.js proxy `/api/*` to Express in a local or standalone setup. It must be an exact HTTP(S) origin and must be set before `next build` for production output. It is not a browser credential. Leave it unset when the hosting platform already routes the API.

For local development, set `API_INTERNAL_ORIGIN` to the Express API origin. For deployment, configure that variable on the Cloudflare build so its Next.js rewrite sends `/api/*` to the Render API. Set exact HTTPS `AUTH_APP_ORIGIN` and matching CORS origins. GitHub hosts source and CI; it does not host the dynamic application.

Production build commands:

```sh
pnpm check
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/proofstack run build
```

Production process commands, with secrets supplied by the deployment platform:

```sh
NODE_ENV=production PORT=8080 pnpm --filter @workspace/api-server run start
NODE_ENV=production PORT=3000 pnpm --filter @workspace/proofstack run serve
```

## Release gates

- Run `pnpm test:all` against a disposable PostgreSQL instance with migrations applied; require green CI.
- Verify `/api/healthz` and `/api/readyz` using the actual routes in `docs/api.md` before routing traffic.
- Test the Phase 3 exit criteria in `roadmap.md` with real staging provider accounts and storage.
- Review the production schema diff, take a backup, and test restore and rollback. Never reset a production database to make tests pass.
- Review proxy trust and edge rate limits. Current API deliberately trusts no forwarded IPs; behind a proxy users can share a rate bucket. An allowlist must match the actual deployed network, not an arbitrary hop count.
- Uploads write each image once to a key reserved in SQL under `ready/`; there is no `uploads/` quarantine object. Never apply an expiry rule to `ready/`. A failure after the R2 write but before commit can leave an unreferenced ready object at the reserved key; reconciliation must check database references before deletion.
- Capture latency/query-count/load baselines, logs and alerts. Remaining per-item community reads must be batched before claiming high-scale readiness.

No live credentials, production database access, deployment or hosted CI result were supplied for this review.

## Careers checkpoint

The tracked migration sequence now includes `0005_faithful_pepper_potts.sql`. Apply it in a disposable development/staging database using the existing migration runner before starting this version. The module uses existing identity, organization permissions and PostgreSQL; no new external service credentials are needed. Read `careers.md` for role setup, privacy rules and staging acceptance.

## Phase 4 native repositories

Apply tracked migration `0006_handy_starbolt.sql` through the migration runner after reviewing it in staging. Git must be installed. Set `REPOSITORY_ROOT` to a private, durable, dedicated absolute directory owned by the API service user. Never use the ephemeral local filesystem of the existing Replit autoscale deployment: keep this feature disabled there, or provision a dedicated durable Git/API service. Every API replica serving repositories must share the same volume and database.

`SESSION_SECRET` is required for Git endpoint rate protection, including public clone. Route `/api/git/*` to Express without stripping Authorization headers or altering the Git request body. Use HTTPS. Clone/fetch uses repo-scoped 30-day read tokens for private access; feature-branch push requires a 30-day write token and never updates the protected default branch. See `repositories.md` for exact bounds, recovery and backup requirements.

## Phase 5 collaboration

Apply `0007_sharp_krista_starr.sql` after the earlier tracked migrations. Pull requests and releases require the same Git installation, durable REPOSITORY_ROOT and configured identity/MFA as Phase 4. They add no external service credentials. Direct web writes to the default branch are now blocked; use a working branch and an independently approved pull request.

This release performs a fixed Git patch whitespace check only. Do not mount deployment credentials or execute repository scripts inside the API process. Review `pull-requests.md` for merge guarantees, release retention and the remaining CI/CD work.

## Phase 6 intelligence

Apply `0008_previous_vargas.sql` after the earlier migrations. Read [intelligence.md](intelligence.md) for private recommendation/scan flows, durable leases, limits and provider consent. Set `INTELLIGENCE_ENABLED=true` only when an always-on worker has been provisioned. Build the API and start a separate `pnpm --filter @workspace/api-server run worker:intelligence` process with the same database; it is not automatically started by the API or current Replit workflow. Git scans need the same durable repository volume.

Opportunity matching and static scans use no AI provider. Optional learning plans require the existing server-side AI integration variables and an explicit `INTELLIGENCE_AI_MODEL`. Optional input/output USD-per-million rates enable approximate cost estimates. Live provider acceptance and spend controls remain deployment requirements.
