# ProofStack

ProofStack includes a Phase 1 foundation and Phase 2 identity/account implementation: Next.js, Express, existing Replit PostgreSQL/Drizzle, Supabase Auth and a signed MSG91 delivery hook. It is not launch-ready; SMS, Google/GitHub and public email delivery still require provider configuration and real delivery checks. No product-domain business CRUD is exposed.

## Run and operate

- Workspace package manager: pnpm; runtime: Node.js 24.
- The Next app is `artifacts/proofstack`, package `@workspace/proofstack`. It is a real Next.js 16 App Router application (dynamic Node server, not a Vite app or static export). Its scripts are `dev`, `build`, and `serve`; `PORT` is required.
- The API is `artifacts/api-server`, package `@workspace/api-server`, an Express 5 service mounted at `/api`. Its `dev` script builds and starts the service; `PORT` is required.
- Replit's shared proxy routes public `/api/*` calls to the API artifact. Keep browser API requests same-origin at `/api`.
- Root checks: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm test:all`; production web build: `pnpm --filter @workspace/proofstack run build`.
- To regenerate API client and Zod code after editing OpenAPI: `pnpm --filter @workspace/api-spec run codegen`.
- Database development migrations are explicit: `pnpm --filter @workspace/db run generate`, inspect and track the migration, then `pnpm --filter @workspace/db run migrate:dev`. This is not a production migration or startup hook. Replit Publish manages the Replit production schema.
- Required server environment includes `PORT`; validated settings include `NODE_ENV`, `DATABASE_URL`, `LOG_LEVEL`, `CORS_ALLOWED_ORIGINS`, `RATE_LIMIT_WINDOW_SECONDS` (default 60), and `RATE_LIMIT_MAX` (default 120). Store database/provider credentials in Replit Secrets, never in git or `NEXT_PUBLIC_*`.

## Stack and structure

- `artifacts/proofstack/app/` — Next App Router pages/layouts/styles; `/`, `/foundation`, `/design-system`, loading/error/404.
- `artifacts/proofstack/components/` and `hooks/` — application shell and status UI; reusable scaffold UI is in `artifacts/proofstack/src/components/ui/`.
- `artifacts/proofstack/proxy.ts`, `lib/security.ts`, `next.config.ts` — per-request CSP nonce/request ID and web security headers.
- `artifacts/api-server/src/` — Express app, API routes, middleware and logging.
- `lib/api-spec/openapi.yaml` — API contract; generated output is in `lib/api-client-react/` and `lib/api-zod/`. Edit the spec, regenerate; do not hand-edit generated files.
- `lib/db/src/schema/` and `lib/db/drizzle/` — Drizzle schema and tracked migrations.
- `docs/architecture.md`, `security.md`, `api.md`, `testing.md`, `roadmap.md`, `database.md` — source of truth for boundaries and operations. `docs/database.md` is database-owned; keep it synchronized only through its owner.

## Security and architecture rules

- The frontend never establishes identity. Supabase verifies credentials, OTP and native MFA. Use `requireManagedIdentity` before existing tenant permission checks. Only verified provider identity with satisfied MFA may supply a principal; never trust a decoded JWT alone.
- Never trust client identity/role/permission headers or an organization ID by itself. Tenant access requires active user + active organization membership + a permission grant on every operation.
- Validate API input, use parameterized Drizzle queries, return the documented safe error envelope, and keep request bodies/query strings and secrets out of logs.
- The API uses an atomic PostgreSQL fixed-window rate limiter for non-probe routes (default 120/60 seconds, fail closed); liveness/readiness are exempt. Reassess proxy IP trust and policy before launch.
- Audit logging is application-level and append-oriented, not tamper-proof. The schema does not enable RLS or audit immutability triggers. Do not claim those protections.
- Do not add production migrations to build/start. Never use a production database for local or CI tests.
- The foundation and account implementation are not production-launch approval. Provider delivery/OAuth settings, deployment-origin configuration, production permissions/backups/rate policies and domain/edge configuration require explicit setup and review. GitHub Actions, repository, Cloudflare zone and production domain must not be assumed authorized or configured.

## Identity operations

- Read `docs/identity.md` for routes, session/MFA/recovery boundaries, safe first-Super-Admin bootstrap and deferred configuration.
- Developer/Company/Recruiter are self-declared profile kinds, never privileged roles. Organization grants and Moderator/Admin/Super Admin are controlled on the server.
- Provider credentials and PKCE state are encrypted at rest. Browsers receive only opaque HttpOnly handles; do not move Supabase credentials into localStorage.
- The user explicitly deferred remaining environment-variable/template setup until the implementation is finished. Do not block coding on provider setup questions.

## Collaboration pointers

Read the relevant docs before changing a boundary. Add API operations through OpenAPI and regenerate hooks/schemas. Add persistence through Drizzle schema plus reviewed tracked migration. Add protected tenant features only with verified provider identity, server-side permission enforcement, audit requirements and cross-tenant tests. Do not invent future product features, seeded users, or security/coverage/uptime metrics.