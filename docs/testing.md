# ProofStack testing and CI

Phase 2 adds cryptographic-envelope, strict unprivileged-signup input, assurance/freshness, recovery restriction, and role/last-owner protection tests. Real password/MFA/device-account journeys must additionally be verified against native Supabase, using temporary development fixtures and deleting them afterward. Email/SMS delivery and social callbacks cannot be considered verified while their provider setup is deferred.

## Local developer checks

Use Node.js 24, pnpm, and the workspace's managed development PostgreSQL configuration. Do not use a production database for development or tests. The root commands for routine checks are:

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm test:all
pnpm --filter @workspace/proofstack run build
```

`pnpm test` runs unit tests. `pnpm test:all` runs unit plus database integration tests with `RUN_DB_TESTS=1`; it requires a disposable development/test database with the tracked migrations applied. Check command output and target environment before running database tests. They are not safe to point at production. The ProofStack build is a dynamic Next.js production build, not a static export.

When an OpenAPI contract changes, regenerate dependent code and check resulting types:

```sh
pnpm --filter @workspace/api-spec run codegen
pnpm typecheck
```

For database schema changes, use the tracked Drizzle workflow in [database.md](database.md): generate and review a migration, then explicitly apply it to the development database with `pnpm --filter @workspace/db run migrate:dev`. CI must start from a clean disposable database and apply tracked migrations before database integration tests.

## What to cover

- **Contracts and validation:** API response/schema conformance, malformed input rejection, stable error envelope/status and generated client compatibility.
- **Authorization:** absent or invalid principal denial, disabled-user denial, inactive membership denial, missing permission denial, and cross-organization isolation for every future tenant feature. Never count UUID unpredictability as an access control.
- **Mutations and audit:** atomic business write plus audit event where required, rollback behavior, metadata validation and safe handling of database failures.
- **Abuse and operations:** rate-limit boundary, atomic concurrent increments, fail-closed database errors, probe exemption, CORS allowlist, security headers, request-ID behavior and readiness failure when PostgreSQL is unavailable.
- **Web behavior:** landing page/routes, real health/readiness states, explicit auth-not-configured status, loading/error/404 boundaries, theme behavior and generated hook error states.
- **Database:** constraints, uniqueness, foreign keys, tenant relationships, indexes and migration compatibility. Use transaction rollback fixtures against disposable databases.

Add tests alongside the owning package. `lib/db/tests/*.integration.test.ts` are opt-in; the test script is `pnpm --filter @workspace/db run test:integration`, and it requires `RUN_DB_TESTS=1`, a disposable `DATABASE_URL` and applied tracked migration. These tests do not by themselves prove authorization or production database security.

## CI and launch gaps

The GitHub Actions configuration in `.github/workflows/ci.yml` uses an ephemeral PostgreSQL service, applies development/test migrations, then runs code generation, lint, formatting checks, typecheck, unit/integration tests and both application builds. Its isolated CI database uses trust authentication without production credentials and is discarded with the job. It never automatically publishes production. Require its checks on protected branches after the repository is connected.

Do not treat intended workflow configuration as evidence that a hosted run passed. No GitHub repository, CI result, Cloudflare zone, production domain, or production deployment has been authorized or confirmed here. Before launch, connect the intended GitHub repository, configure and verify Actions permissions/secrets and branch protection, then review successful clean CI runs. Configure Cloudflare DNS/TLS/WAF separately if selected; see the launch checklist in [security.md](security.md).

No coverage percentage, uptime figure, pen-test result or security guarantee is asserted by this documentation.

## Isolated SQL checks without a database installation

Run `pnpm test:embedded` for the four SQL regression suites. This creates a new in-memory PGlite engine for each suite, applies every tracked SQL migration in journal order, and tests real SQL constraints, rollback, permissions, visibility transitions, last-owner protection and bounded feed reads.

Only this alternate Vitest configuration replaces the `pg` transport with a test adapter. Production code and `pnpm test:all` continue to use native node-postgres. The adapter does not validate the PostgreSQL wire protocol, TLS, connection pooling or concurrent transactions. The native PostgreSQL CI job remains mandatory before release. No existing DATABASE_URL is used by the embedded adapter, and fixtures never reach a live database.

A 21-post fixture with distinct authors, comments, mentions, bookmarks and reactions asserts no more than seven feed queries while checking results and anonymous access. This is a regression limit, not a production throughput benchmark.
