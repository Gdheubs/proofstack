# ProofStack

A developer community built with Next.js, Express, PostgreSQL/Drizzle and managed identity. Profiles, projects, organizations, social activity, project task boards, opt-in talent discovery, opportunity listings, private applications, hiring stages and conversations are implemented. Native Git repositories, source browsing, web commits and read-only clone/fetch are now implemented as a Phase 4 milestone. Pull requests, commit-specific reviews, guarded merges, patch checks, and immutable releases/tags are implemented in Phase 5. Phase 6 adds a private intelligence workspace with explainable opportunity matches, consent-based AI practice plans, bounded static repository scans, and metered durable jobs. Phase 7 adds request hardening, dependency fixes, batched project reads, an MFA-protected operations dashboard, worker heartbeats and deployment checks. External push and executable CI/CD remain future work.

Start with [the seven-phase roadmap](docs/roadmap.md), [setup](docs/setup.md) and [the latest review report](docs/review-phase7-2026-10-12.md).

See [careers and collaboration](docs/careers.md) for the new product flows and permissions.

See [repository setup and limits](docs/repositories.md) before enabling native Git storage.

See [reviewed collaboration and releases](docs/pull-requests.md) for the Phase 5 workflow.

See [intelligence setup and limits](docs/intelligence.md) before enabling Phase 6 jobs.

## Requirements

- Node.js 24 and pnpm 11.25.0 (pinned in package.json and CI).
- A disposable PostgreSQL database for development and integration tests.
- Replit for the existing same-origin routing and App Storage integration.
- Managed identity configuration for real accounts. Credentials belong in deployment secrets.

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run migrate:dev
pnpm check
pnpm test:embedded
pnpm test:all
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/proofstack run build
```

Set DATABASE_URL before migrations. Only run test:all against a disposable test database. No production migrations run at startup.

## Local full-stack development

Use the root `pnpm dev` command rather than starting Next alone. Configure ignored
`.env.local` from `.env.example`: a **local-only** database with migrations already
applied, the selected identity provider, an exact HTTPS `AUTH_APP_ORIGIN`, and
external `DEV_TLS_KEY_FILE`/`DEV_TLS_CERT_FILE`. Reference the existing stable API
session key through `SESSION_SECRET_FILE`; do not put secret values in source.

Run `pnpm dev:check` first, then `pnpm dev`. The launcher builds/starts the API,
verifies database/schema/auth/CSRF readiness, and only then starts HTTPS Next.
It stops its own stack if a child fails and refuses production/remote databases.
The default ports are web 3011 and API 8089. Certificate trust is user-managed;
the launcher never modifies the OS trust store or disables TLS verification.
See [setup](docs/setup.md) for provider/storage requirements and production's
separate supervised web/API/worker topology.

See the [current evidence-backed audit](docs/production-audit.md) for executed
checks and outstanding release blockers; a working local login is not production
approval. Run `pnpm test:coverage` for the measured unit coverage/policy gate,
in addition to isolated database integration and browser tests.

See [operations and recovery](docs/operations.md) for deployment checks, maintenance, monitoring, backup and rollback procedures.
