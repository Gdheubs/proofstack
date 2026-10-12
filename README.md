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

Set DATABASE_URL before migrations. Only run test:all against a disposable test database. No production migrations run at startup. See setup for separate web/API processes and provider requirements.

See [operations and recovery](docs/operations.md) for deployment checks, maintenance, monitoring, backup and rollback procedures.
