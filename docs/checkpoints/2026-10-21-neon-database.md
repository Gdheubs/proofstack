# Neon application database — October 21, 2026

Parent: `6ee06dc` (Cloudflare Workers frontend). Hosted [ProofStack CI](https://github.com/Gdheubs/proofstack/actions/runs/39518635816) and [ProofStack Security](https://github.com/Gdheubs/proofstack/actions/runs/39518635803) passed on `6ee06dc`; the hosted Worker size gate reported 2,636 of 3,072 KiB.

## Decisions (owner, 2026-10-21)

- **Database: Neon** serverless PostgreSQL replaces Supabase Postgres for application data.
- **Auth: keep Supabase Auth.** Clerk was evaluated: its free plan has no MFA, no SMS and at most 3 social connections (Pro is $25/month; $0.02 per retained user beyond 50,000), while Supabase Auth Free covers the required providers and authenticator MFA (50,000 MAU; Pro includes 100,000 then $0.00325/MAU). Supabase is now used only for Auth, with Resend as its custom SMTP.
- Frontend stays on Cloudflare **Workers** (Pages cannot run Next.js 16).

## Changes

- `lib/db/src/pool-options.ts` (new, side-effect free) and `lib/db/src/index.ts`: `DATABASE_POOL_MAX` (1–50, default 10); `connectionTimeoutMillis` 10 s so a scaled-to-zero compute can resume; `enableChannelBinding` when the URL says `channel_binding=require` (node-postgres parses but otherwise ignores that parameter); malformed URLs are rejected without echoing them.
- `lib/db/scripts/migrate-release.mjs` / `migrate:release` (new): release-time migration for deployed databases. There was previously **no** production migration command (`migrate:dev` refuses production). It requires `MIGRATION_TARGET_HOST` to equal the URL host, refuses pooled endpoints (`-pooler`, port 6543), uses a 10 s lock timeout and 300 s statement timeout, and reports before/applied/total counts. CI runs it against the already-migrated CI database.
- `artifacts/api-server/scripts/preflight.mjs`: new checks `Direct database endpoint` and `Database TLS required`.
- Backups: `scripts/backup-database.sh` takes `BACKUP_SCHEMAS`, `BACKUP_REQUIRED_TABLES`, `BACKUP_MIN_TABLES`, `BACKUP_NAME`; `restore-database.sh` replaces `public` only when the archive contains it and tolerates archives without the migration ledger. `operations.yml` backs up Neon `public`/`drizzle`, plus an optional Supabase `auth` identity backup (`IDENTITY_BACKUP_ENABLED`, `IDENTITY_BACKUP_DATABASE_URL`). The CI drill adds an identity-mode round trip.
- Docs/config: `docs/deployment.md` (Neon and Supabase Auth sections, including the uptime-monitor warning), `docs/operations.md`, `.env.example`, `render.yaml` (`DATABASE_POOL_MAX=5`), `README.md`, `docs/setup.md`, `docs/production-plan.md`.

## Validation (local)

- `tests/database-connection.test.ts` (new, 18): pool defaults, size bounds, channel binding, no URL echo; release-target guard (missing/mismatched confirmation, Neon pooler, port 6543, non-PostgreSQL URL); preflight direct-endpoint and TLS checks.
- `tests/preflight-checks.test.ts`, `tests/ci-workflows.test.ts` passed; workflows parse (CI 20 steps, operations 6/4).
- `pnpm run typecheck`, `pnpm lint`, Prettier on changed files passed. Unit tests: 740 passed (53 files). Embedded integration: 190 passed, 2 skipped. `bash -n` on both scripts.
- **Not verified:** a connection to a real Neon project (none exists yet), Neon cold-start latency, and the identity backup against a real Supabase project. `migrate:release` and the identity-mode drill first execute in hosted CI for this commit.

## Hosted CI

- `c114c10`: [ProofStack Security](https://github.com/Gdheubs/proofstack/actions/runs/39519998457) passed; [ProofStack CI](https://github.com/Gdheubs/proofstack/actions/runs/39519998534) **failed** in the drill. `migrate:release` ran first and reported `14 previously applied, 0 applied now, 14 total`; the main backup/restore matched (`50|14|22`) and the identity backup was written, but restoring it failed: the migration-count query referenced `drizzle.__drizzle_migrations` inside a `CASE` branch, and PostgreSQL resolves table names even in branches that never run. Repair: check `to_regclass` first, count separately. Hosted result for the repair is recorded in the next checkpoint.

## Remaining risks

- Supabase Free still pauses after a week of inactivity, which would stop sign-in; low-traffic launches need real usage or Supabase Pro.
- Neon Free's 100 CU-hours/month assume scale-to-zero; any always-on database traffic (monitors, frequent cron) can exhaust it.

## Next step

Create the Neon project and Supabase Auth project, run `migrate:release` and preflight, then deploy staging (Render API, Cloudflare Worker) and run the social-login smoke check.
