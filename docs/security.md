# ProofStack security

## Status and limits

The Phase 7 checkpoint includes implemented account, community, careers, Git collaboration, intelligence and operations APIs. It is **not a security certification or production-launch approval**. Supabase verifies identity and native MFA; MSG91 transports signed provider codes. Live delivery/OAuth configuration and identity boundaries are in `identity.md`. See `review-phase7-2026-10-12.md` for verified controls and remaining launch gates. Do not claim compliance, tamper-proof audit records, guaranteed availability, or protection from every attack.

## Identity, sessions, and authorization

- There is no local authentication or client-header identity. Never accept a user ID, role, permission, or identity assertion from a request header/body as verified identity.
- Supabase `getUser()` verifies the exact provider credential before claims are interpreted or a subject maps to `users.auth_subject`. Browser-bound PKCE protects callbacks. `requireManagedIdentity` establishes the principal only after required native MFA. Do not introduce a local password store, browser OTP bypass, or unverified-JWT principal.
- `requireAuthenticated` denies requests without verified principal context. `requirePermission` checks the active user, active organization membership, and the role-to-permission grant. A submitted organization UUID does not establish tenant access.
- Apply the membership/permission check to every tenant read and mutation, within the same server-side decision path. Add authorization and cross-tenant denial tests before exposing tenant data.
- Encrypted provider credentials, HttpOnly production Secure cookies, server-side session revocation, CSRF/origin checks, disabled-user checks and fresh native MFA protect account operations. Live provider renewal, recovery, delivery and outage acceptance still require staging verification; see `identity.md`.

## Request, response, and browser protections

- API requests receive a server-generated UUID in `X-Request-ID`. Errors use the safe envelope `{ "error": { "code": "...", "message": "..." }, "requestId": "..." }`; never send stack traces, database details, tokens, or secrets to clients.
- Helmet headers protect API responses. Web responses receive a fresh nonce-based Content Security Policy. Production disallows inline/eval scripts; development permits `unsafe-eval` for tooling. Inline styles are allowed for the shadcn/React style-prop use case. Framing is same-origin in production; Replit frame ancestors are allowed in development. Production enables HSTS; the web app also configures `nosniff`, a restrictive referrer policy and a permissions policy.
- The `/api` CORS allowlist is configured by `CORS_ALLOWED_ORIGINS` using comma-separated, exact `http(s)` origins. The default denies requests with an unapproved Origin header. Same-origin GET probes do not need cross-origin access. Do not use wildcard origins for authenticated APIs.
- Express defaults to `trust proxy=false`. `TRUST_PROXY_CIDRS` accepts only explicit IPs/non-universal CIDRs. Configure it from the real deployment proxy topology and ensure that proxy overwrites untrusted forwarding headers. Behind the web tier, the API uses a browser address only when the web proxy presents `PROXY_SHARED_SECRET` (constant-time comparison); client-sent copies of those headers are stripped at both tiers, and IPv6 addresses are bucketed by /64. Without the secret, clients behind the shared proxy share a bucket. The default forged-X-Forwarded-For regression passes; actual proxy topology must be tested before launch.
- Validate all request parameters, body fields and query values with explicit Zod schemas. Bound payloads and pagination; reject unexpected input where appropriate. Use parameterized Drizzle queries and never interpolate client values into SQL.
- Request logging is structured with Pino. Sensitive fields are redacted; request bodies and query strings are excluded. Do not add credentials, authorization headers, session values, or personal payloads to logs. Keep request IDs in support references, not as a substitute for authorization.

## Abuse controls and persistence

- Limiting runs before body parsing, including malformed/oversized bodies. Compressed request bodies are rejected; payload sizes remain bounded. HTTP headers, request duration and per-socket requests are limited. Product responses and errors use private no-store. These controls do not replace edge DDoS protection.
- Non-probe API routes use an atomic PostgreSQL fixed-window limiter backed by `rate_limit_buckets`: defaults are 120 requests per 60 seconds, keyed by a hash of the client IP. Health and readiness are exempt; obsolete buckets are pruned.
- Limiting fails closed if the database operation fails, so database availability affects API request availability. Revisit limits, trusted proxy/IP handling, shared-network behavior, and denial-of-service capacity for the actual deployment before launch. A fixed window is not a global edge WAF.
- Audit service input is strictly validated and secret-like metadata keys are rejected. It writes append-oriented audit entries and can use a caller-provided transaction executor to couple the record with a mutation. This is an application service, not tamper-proof storage: database privileges, retention, backups, and privileged-operator risks remain.
- The PostgreSQL schema does not enable row-level security or install audit immutability triggers. Keep access through authorized server code; design and test database grants/RLS separately if required. Do not claim database-enforced tenant isolation.
- Never store plaintext tokens or credentials in session/audit metadata. Define retention, archival, privacy deletion and legal-hold policy for audit/event/session/rate-limit records before production scale.

## Configuration and secrets

| Variable                    | Handling                                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                      | Required service port; supply through the runtime environment.                                                                                |
| `NODE_ENV`                  | Runtime mode; production behavior must be verified in the deployed service.                                                                   |
| `DATABASE_URL`              | Secret connection string for the Replit-managed database. Store in Replit Secrets/environment; do not commit, log, or expose to browser code. |
| `LOG_LEVEL`                 | Structured logger threshold. Avoid verbose sensitive diagnostics in production.                                                               |
| `CORS_ALLOWED_ORIGINS`      | Exact comma-separated HTTP(S) origins; defaults to deny cross-origin requests.                                                                |
| `RATE_LIMIT_WINDOW_SECONDS` | Positive fixed-window duration; defaults to `60`.                                                                                             |
| `RATE_LIMIT_MAX`            | Positive per-window hit limit; defaults to `120`.                                                                                             |

Validate configuration at service startup and fail explicitly for invalid or missing required values. Keep dev and production credentials separate and least-privileged. No provider secret, production database credential, GitHub secret, or Cloudflare credential belongs in source control or a browser bundle.

## Launch review checklist

Before accepting real users or sensitive data:

1. Verify the implemented managed identity, session lifecycle, CSRF protections and failure behavior against the dedicated staging provider.
2. Run the included feature-level authorization and tenant-isolation tests on native PostgreSQL and complete authenticated browser acceptance for every role.
3. Review Replit production database access privileges, backups/restore procedure, schema Publish diff, connection limits, retention and operational access. Restrict who can manage production secrets and database access.
4. Re-evaluate rate policy and trusted proxy/client-IP behavior under real traffic; use edge protections for volumetric abuse.
5. Configure the authorized GitHub repository and required CI checks. CI credentials must be scoped and must not grant production publishing access by default.
6. If Cloudflare is selected, explicitly configure and validate DNS to the Replit custom domain, TLS certificate and strict origin TLS, proxy behavior, WAF rules, and edge rate limits. Confirm the Replit origin cannot be unintentionally exposed and that forwarded headers are trusted only from the intended proxy. None of these Cloudflare controls is currently simulated or assumed active.
7. Test production CSP, headers, cookies, CORS, readiness, backups, alerts and incident response on the actual deployment. No public domain or Cloudflare zone is authorized/configured by this foundation.

For database schema and migration lifecycle details, see [database.md](database.md); for API contract and route conventions, see [api.md](api.md).
