# ProofStack API

## Contract and routing

The shared Express 5 service lives in `artifacts/api-server/src`. Its public API base path is `/api`, routed by the shared Replit proxy to the API artifact. Web code calls same-origin `/api/...`; it must not hard-code a separate host. `lib/api-spec/openapi.yaml` is the source of truth. Generated React Query hooks/client are in `lib/api-client-react`, and generated Zod response schemas are in `lib/api-zod`.

The Phase 1 health/readiness API is unchanged. Phase 2 adds protected account operations and server-owned identity endpoints; see `identity.md` and the current OpenAPI contract. `/foundation` consumes live health/readiness and authentication capability state. Product-domain CRUD is still not exposed.

| Method and path    | Result                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/healthz` | `200` with `{ "status": "ok" }`. Liveness indicates that the API process can answer.                                                                                                                    |
| `GET /api/readyz`  | `200` with `{ "status": "ready", "checks": { "database": "ready" } }` when required dependencies are usable; otherwise `503` with `{ "status": "not_ready", "checks": { "database": "unavailable" } }`. |

Liveness/readiness probes are exempt from the database-backed rate limiter. Do not use liveness alone to decide whether the database-backed application is ready.

## Response and middleware conventions

- Each API request receives a server-generated UUID `X-Request-ID`. Include it in error responses and operational logs; do not accept a caller-provided identity or request ID as trusted authorization data.
- Errors have the safe JSON shape `{ "error": { "code": "stable_code", "message": "safe explanation" }, "requestId": "uuid" }`. Use appropriate HTTP status codes. Do not disclose stack traces, SQL/driver text, secrets, or authorization internals.
- API middleware includes structured Pino request logging with sensitive fields redacted and request body/query text excluded, Helmet security headers, configured CORS, request parsing and rate limiting. CORS origins are exact HTTP(S) origins from `CORS_ALLOWED_ORIGINS`; the default denies cross-origin browser requests.
- Validate untrusted input at the route boundary. Keep responses and request schemas in OpenAPI; map invalid input to a safe client error.

## Adding a route safely

1. Define operation ID, method/path, request/response schemas, status codes and error cases in `lib/api-spec/openapi.yaml`.
2. Implement the handler and any route-specific middleware under `artifacts/api-server/src/routes/`. Parse path, query, and body inputs using strict Zod schemas; impose reasonable size and pagination bounds.
3. For protected work, require a server-verified provider `Principal`. Do not infer identity from request-controlled IDs or headers. For tenant operations, derive scope from that principal and verify active user, active organization membership, and the required `role_permissions` grant for every operation.
4. Put domain policy in server-side services and use parameterized Drizzle queries from the shared `@workspace/db` package. Scope tenant reads and writes in the query itself; a UUID is not authorization.
5. For security-relevant writes, write a validated audit event in the same database transaction as the mutation where possible. Keep metadata free of secrets and unnecessary personal data. The audit table is not inherently tamper-proof.
6. Return the documented safe error envelope and status. Avoid returning private fields or details the caller is not authorized to see.
7. Regenerate generated outputs and review the diff:

   ```sh
   pnpm --filter @workspace/api-spec run codegen
   ```

8. Add tests for schema rejection, successful behavior, unauthenticated/unauthorized denial, cross-tenant isolation, transaction/audit behavior, and relevant failure responses. See [testing.md](testing.md).

Do not add business routes that rely on placeholder identities or synthetic users. Until a provider supplies verified context, protected operations must deny access.

## Client usage

The Next app imports generated hooks from `@workspace/api-client-react`; the foundation status hook demonstrates health/readiness polling. Prefer those generated hooks and shared schemas over handwritten duplicate fetch/types. After changing OpenAPI, regenerate before consuming new operations. Keep frontend error rendering useful but do not expose server diagnostics.

## Configuration

The API requires `PORT`; it reads validated `NODE_ENV`, `DATABASE_URL`, and `LOG_LEVEL`. `CORS_ALLOWED_ORIGINS` is a comma-separated exact HTTP(S) allowlist, default deny. `RATE_LIMIT_WINDOW_SECONDS` defaults to 60 and `RATE_LIMIT_MAX` to 120 for non-probe routes. See [security.md](security.md) for safe secret handling, proxy trust and launch checks.
