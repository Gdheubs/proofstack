# ProofStack architecture

Current identity/account implementation is documented in `identity.md`; the Phase 1 scope below describes the original foundation. Supabase now owns verification, with encrypted server-side sessions in the existing Replit database. Provider delivery and OAuth configuration remain pending.

## Phase 1 scope

ProofStack is a web application foundation for a future multi-tenant product. Phase 1 delivers a server-rendered web shell, a shared API, a managed PostgreSQL/Drizzle schema, API contracts and generated React Query hooks, and baseline security and operational controls. It does **not** implement product-domain CRUD, local authentication, or a configured identity provider.

The selected web stack is **Next.js 16 App Router**, not Vite. `artifacts/proofstack` is built and served as a dynamic Node application; it is not a static export. The repository is a pnpm workspace using TypeScript, React, Tailwind CSS v4, `next-themes`, and scaffolded shadcn/ui components.

## System shape

```text
Browser
  ├── /, /foundation, /design-system ──> Next.js 16 (ProofStack)
  └── /api/* ──> shared Replit proxy ──> Express 5 API
                                           └── PostgreSQL via Drizzle
```

The browser consumes the API through same-origin `/api` URLs. The shared Replit proxy routes that path to the API artifact, so the web app does not need a browser-visible API origin. Next middleware (`proxy.ts`) adds a per-request nonce CSP and request ID to web responses. The API independently creates its own request ID for each API request; do not assume those IDs represent a single end-to-end trace across the proxy.

### Workspace map

| Location                                                             | Responsibility                                                                                                                                                                                                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `artifacts/proofstack/app/`                                          | App Router routes, global styles, loading/error/not-found UI. `/` is the landing page, `/foundation` reports live API health/readiness and clearly identifies authentication as not configured, and `/design-system` showcases components. |
| `artifacts/proofstack/components/`, `hooks/`                         | Product-level layout and UI components; foundation status is read with generated React Query hooks.                                                                                                                                        |
| `artifacts/proofstack/src/components/ui/`                            | Reusable shadcn/ui scaffold. `src/lib/utils.ts` and `src/hooks/` contain scaffold utilities.                                                                                                                                               |
| `artifacts/proofstack/proxy.ts`, `lib/security.ts`, `next.config.ts` | Web response security headers, nonce CSP, and Next configuration.                                                                                                                                                                          |
| `artifacts/api-server/src/`                                          | Express application, API routes and structured logging. Add API middleware/services here, not in the web app.                                                                                                                              |
| `lib/api-spec/openapi.yaml`                                          | Source of truth for the public API contract, rooted at `/api`.                                                                                                                                                                             |
| `lib/api-client-react/`, `lib/api-zod/`                              | Generated React Query hooks/client and Zod response schemas. Regenerate; do not hand-edit generated output.                                                                                                                                |
| `lib/db/src/schema/`                                                 | Drizzle table definitions, schemas and exports.                                                                                                                                                                                            |
| `lib/db/drizzle/`                                                    | Tracked SQL migrations and Drizzle snapshots. See [database lifecycle](database.md).                                                                                                                                                       |
| `docs/`                                                              | Architecture, security, API, testing, roadmap and database operating guidance.                                                                                                                                                             |

## Request and data flow

1. A browser page uses generated hooks from `@workspace/api-client-react`; generated API calls use the same-origin `/api` path.
2. The shared proxy routes `/api` to the Express service. Express applies request logging, security/CORS/body middleware, route-level validation and authorization, then responds with JSON.
3. Routes use the shared `@workspace/db` Drizzle schema and PostgreSQL connection. Tenant access must be derived from a verified principal and an active membership, never from an organization ID supplied by the browser alone.
4. API responses and operations are described in `lib/api-spec/openapi.yaml`. After contract changes, run `pnpm --filter @workspace/api-spec run codegen` and review the generated client/schemas.

API errors use `{ "error": { "code": "...", "message": "..." }, "requestId": "..." }`. Do not expose stack traces, SQL errors, secrets, or internal configuration in that envelope.

## Identity and authorization boundary

No local sign-in, password store, or client-trusted identity mechanism is part of Phase 1. A future managed identity provider must verify credentials on the server and supply the API with a trusted `Principal` containing the stable provider subject and corresponding user ID. `requireAuthenticated` denies when that verified context is absent. Permission checks require an active user, an active organization membership, and a matching `role_permissions` grant. Client headers, request bodies, UUIDs, and unverified cookies are never proof of identity.

The database has role/permission and provider-session-reference tables, but no seeded users or fake role assignments. See [database.md](database.md) for authoritative table, migration, and managed database details.

## Runtime configuration

Configuration is validated from environment variables at service startup. `PORT` is required. `NODE_ENV` selects runtime mode; `DATABASE_URL` is the Replit-managed PostgreSQL connection string; `LOG_LEVEL` sets structured logging verbosity. `CORS_ALLOWED_ORIGINS` is a comma-separated list of exact `http(s)` origins and defaults to denying cross-origin browser access. Rate limiting uses `RATE_LIMIT_WINDOW_SECONDS` (default `60`) and `RATE_LIMIT_MAX` (default `120`). Treat `DATABASE_URL` as a secret and never commit credentials or put server-only values in `NEXT_PUBLIC_*`.

The web and API run as separate services. The Next package provides `dev`, `build`, and `serve` scripts; the API package provides `dev`, `build`, and `start`. Use the root checks and test commands listed in [testing.md](testing.md). Replit-managed development PostgreSQL is the development database; production schema changes are managed through Replit Publish, not app startup.

## Design constraints

- Keep web presentation, API policy, shared contracts, and persistence in their owning packages.
- Change the OpenAPI source before regenerating clients; do not let generated code become a second contract.
- Add domain writes only behind server-side validation, verified identity, tenant-scoped permission checks, and an audit entry where the operation is security-relevant.
- Use explicit Drizzle migrations for development and reviewed Replit Publish schema changes for managed production. Do not add deploy/startup DDL.
- No future product behavior should be inferred from the presence of foundation tables or UI components.
