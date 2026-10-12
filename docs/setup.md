# Setup and release runbook

## Existing deployment architecture

Retain the Replit workspace: Next.js handles web routes; Express handles `/api/*`; PostgreSQL stores application data; Supabase verifies identity; Replit App Storage stores images. This application requires running servers and cannot be deployed to GitHub Pages as a static export.

## Install and configure

1. Install Node.js 24 and pnpm 11.25.0. Run `pnpm install --frozen-lockfile` at the repository root. The workspace explicitly permits esbuild's installation script.
2. Configure secrets using `.env.example` as the inventory. A copied `.env` is documentation unless your process manager explicitly loads it; the API does not automatically load dotenv files.
3. Set `DATABASE_URL` to the development PostgreSQL database. Apply reviewed tracked migrations with `pnpm --filter @workspace/db run migrate:dev`. This command intentionally refuses production mode; Replit Publish owns production schema review.
4. For accounts, set `AUTH_APP_ORIGIN` to the exact HTTPS browser origin, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and a random `SESSION_SECRET` of at least 32 characters. Follow `identity.md` for provider callbacks, MFA and operator bootstrap. Never place server secrets in browser variables.
5. Configure Replit App Storage and its `PRIVATE_OBJECT_DIR`. The existing adapter depends on Replit's local credential sidecar; copying this code to another host does not provision a working storage service.
6. AI is optional. Configure the existing Replit AI integration and `COMMUNITY_AI_MODEL` only when enabled. AI credentials missing or provider failure produce a controlled error; manual community features remain available. AI requests may consume Replit credits.
7. Leave SMTP/phone readiness flags false until actual delivery and entitlement are verified. Follow `identity.md` for SMS-hook signing and OAuth configuration.

## Processes

Run two processes with different ports. Example development commands in separate terminals:

```sh
PORT=8080 pnpm --filter @workspace/api-server run dev
API_INTERNAL_ORIGIN=http://127.0.0.1:8080 PORT=3000 pnpm --filter @workspace/proofstack run dev
```

The optional server-only `API_INTERNAL_ORIGIN` lets Next.js proxy `/api/*` to Express in a local or standalone setup. It must be an exact HTTP(S) origin and must be set before `next build` for production output. It is not a browser credential. Leave it unset when the hosting platform already routes the API.

Configure Replit's application router to send `/api/*` to port 8080 and all other requests to port 3000. The browser uses relative `/api` URLs. The ZIP alone does not prove that your Replit router/workflow is configured. Use HTTPS for real account journeys because session cookies are secure and the authentication origin validator requires HTTPS.

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
- Set storage lifecycle cleanup for abandoned `uploads/` objects older than one day. Completed images now live under `ready/`; never apply that expiry rule to `ready/`. A failed transaction can leave an unreferenced ready object, so reconciliation must check database references before deletion.
- Capture latency/query-count/load baselines, logs and alerts. Remaining per-item community reads must be batched before claiming high-scale readiness.

No live credentials, production database access, deployment or hosted CI result were supplied for this review.

## Careers checkpoint

The tracked migration sequence now includes `0005_faithful_pepper_potts.sql`. Apply it in a disposable development/staging database using the existing migration runner before starting this version. The module uses existing identity, organization permissions and PostgreSQL; no new external service credentials are needed. Read `careers.md` for role setup, privacy rules and staging acceptance.

## Phase 4 native repositories

Apply tracked migration `0006_handy_starbolt.sql` through the migration runner after reviewing it in staging. Git must be installed. Set `REPOSITORY_ROOT` to a private, durable, dedicated absolute directory owned by the API service user. Never use the ephemeral local filesystem of the existing Replit autoscale deployment: keep this feature disabled there, or provision a dedicated durable Git/API service. Every API replica serving repositories must share the same volume and database.

`SESSION_SECRET` is required for Git endpoint rate protection, including public clone. Route `/api/git/*` to Express without stripping Authorization headers or altering the Git request body. Use HTTPS. Clone/fetch uses repo-scoped 30-day read tokens for private access; external Git push is disabled. See `repositories.md` for exact bounds, recovery and backup requirements.

## Phase 5 collaboration

Apply `0007_sharp_krista_starr.sql` after the earlier tracked migrations. Pull requests and releases require the same Git installation, durable REPOSITORY_ROOT and configured identity/MFA as Phase 4. They add no external service credentials. Direct web writes to the default branch are now blocked; use a working branch and an independently approved pull request.

This release performs a fixed Git patch whitespace check only. Do not mount deployment credentials or execute repository scripts inside the API process. Review `pull-requests.md` for merge guarantees, release retention and the remaining CI/CD work.

## Phase 6 intelligence

Apply `0008_previous_vargas.sql` after the earlier migrations. Read [intelligence.md](intelligence.md) for private recommendation/scan flows, durable leases, limits and provider consent. Set `INTELLIGENCE_ENABLED=true` only when an always-on worker has been provisioned. Build the API and start a separate `pnpm --filter @workspace/api-server run worker:intelligence` process with the same database; it is not automatically started by the API or current Replit workflow. Git scans need the same durable repository volume.

Opportunity matching and static scans use no AI provider. Optional learning plans require the existing server-side AI integration variables and an explicit `INTELLIGENCE_AI_MODEL`. Optional input/output USD-per-million rates enable approximate cost estimates. Live provider acceptance and spend controls remain deployment requirements.
