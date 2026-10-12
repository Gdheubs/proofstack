# ProofStack database foundation

Phase 2 adds verification/profile-kind fields, encrypted session credentials and device handles, browser-bound flow state, identifier failures, recovery hashes and signed-hook receipts. Supabase Auth owns development identity; it does not replace this database. See `identity.md` for current behavior. The Phase 1 notes below describe the original foundation.

ProofStack Phase 1 uses the Replit-managed PostgreSQL database through `DATABASE_URL` and Drizzle ORM in `lib/db`. No local authentication system, sample users, organizations, sessions, or synthetic metrics are created. Roles and permissions are system definitions; this foundation does not seed them.

## Schema

Every identity is a PostgreSQL `uuid` with a database-generated default, except `rate_limit_buckets.key`, which is the bucket's text primary key. All instants and lifecycle timestamps use `timestamptz`. User-supplied insert schemas are exported with the table definitions and apply basic validation; authorization and business policy must still be enforced in server code.

| Table                  | Purpose and columns                                                                                                                                                                                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                | Provider-backed identity: `id`, unique `auth_subject`, unique case-insensitive `email`, `status` (`active` / `disabled`), `created_at`, `updated_at`. `auth_subject` is the stable subject from the configured identity provider, not a locally issued credential.                                             |
| `profiles`             | Optional application profile keyed by `user_id` (also its primary key), `display_name`, nullable `avatar_url`, `created_at`, `updated_at`. Deleting the user cascades to its profile.                                                                                                                          |
| `organizations`        | Tenant: `id`, `name`, unique `slug`, `created_at`, `updated_at`.                                                                                                                                                                                                                                               |
| `organization_members` | Tenant membership with UUID `id`, `organization_id`, `user_id`, `role_id`, `status` (`active` / `inactive`), `created_at`, `updated_at`. An organization/user pair is unique. Organization and user deletion cascade; a referenced role cannot be deleted.                                                     |
| `roles`                | Global system role definitions: `id`, unique `key`, `name`, nullable `description`, `created_at`. Roles are not organization-owned.                                                                                                                                                                            |
| `permissions`          | Global system permission definitions: `id`, unique `key`, `name`, nullable `description`, `created_at`.                                                                                                                                                                                                        |
| `role_permissions`     | Role-to-permission mapping with composite primary key `(role_id, permission_id)` and `created_at`. Both FKs cascade on deletion.                                                                                                                                                                               |
| `audit_logs`           | Append-oriented audit record: `id`, nullable `organization_id`, nullable `actor_user_id`, `action`, `resource_type`, nullable `resource_id`, `request_id`, JSONB `metadata`, `created_at`. Deleting an organization or actor nulls that reference rather than deleting the record. It has no update timestamp. |
| `sessions`             | Provider-session reference only: `id`, `user_id`, unique `provider_session_id`, `expires_at`, nullable `revoked_at`, `created_at`. It stores no plaintext tokens, password credentials, or locally-authenticated session secrets. User deletion cascades.                                                      |
| `events`               | Append-oriented event data: `id`, nullable `organization_id`, nullable `actor_user_id`, `type`, JSONB `payload`, `created_at`. Organization/actor deletion nulls the corresponding reference.                                                                                                                  |
| `notifications`        | User notification: `id`, `user_id`, nullable `organization_id`, `title`, `body`, nullable `read_at`, `created_at`. User deletion cascades; organization deletion nulls the organization reference.                                                                                                             |
| `rate_limit_buckets`   | Atomic fixed-window counter: text primary key `key`, `window_start`, nonnegative `hits`. API code should use one atomic `INSERT ... ON CONFLICT ... DO UPDATE` per hit, resetting at the fixed-window boundary; do not implement a read-then-write counter.                                                    |

### Relationships and tenant boundaries

- `profiles.user_id` references `users.id`.
- `organization_members.organization_id` and `.user_id` reference organizations and users; `.role_id` references the global role catalog.
- `role_permissions.role_id` and `.permission_id` reference global roles and permissions.
- Audit logs, events, and notifications carry optional organization references; audit/event actor references are optional user references.
- Sessions and notifications belong to a user.
- Tenant-owned records must be queried and mutated with an organization scope derived from the authenticated user's active membership. A UUID is not authorization. Check membership status and the role's permission mapping on every tenant operation; do not rely on a client-provided organization id alone.
- The schema does not yet enable PostgreSQL row-level security. Add database policies only as a separately designed, tested change.

### Indexes and constraints

The schema defines primary keys and FKs for all relationships, unique indexes on user auth subject and case-insensitive email, organization slug, provider session id, role key, and permission key. Membership uniqueness is `(organization_id, user_id)`; RBAC mapping uniqueness is its composite primary key. Supporting indexes cover users by status; membership lookups by user, role and status; profiles by display name; organizations by name; role/permission names and reverse permission mapping; audit organization/actor chronology, request ID and resource; sessions by user and expiry; events by organization/actor/type chronology; notifications by user/organization chronology and unread user feed; and rate-limit window cleanup. `rate_limit_buckets.hits` has a nonnegative check constraint.

## Authentication and integrations

This schema is ready to associate application users with provider-backed identities using a provider's stable subject and to reference opaque provider session IDs. It does not configure an identity provider or implement sign-in, callback verification, token refresh, or session revocation with that provider; those integrations must verify provider credentials before using these records.

Supabase is **not configured**. Although the schema uses PostgreSQL types, it does not set up Supabase Auth, Storage, client libraries, RLS policies, grants, or external project connection settings. Do not point `DATABASE_URL` at Supabase and assume Replit Publish will migrate it: the managed Publish schema flow applies only to Replit-managed PostgreSQL. An external PostgreSQL deployment needs an explicitly documented migration and security workflow and must be separately validated.

Audit/event tables are designed for append-oriented service use. The current schema does not install immutability triggers or restrict database grants; application services should expose insert-only audit operations, never update/delete existing audit rows, and production database privileges should enforce that boundary where available.

## Schema lifecycle and commands

Drizzle schema source lives in `lib/db/src/schema/`, one table per file, and is re-exported by `lib/db/src/schema/index.ts`. Generated migrations and their Drizzle snapshots live in the tracked `lib/db/drizzle/` directory.

```sh
# Edit schema source, then generate and review a tracked SQL migration/snapshot.
pnpm --filter @workspace/db run generate

# Explicitly apply tracked migrations to the Replit-managed development DB.
pnpm --filter @workspace/db run migrate:dev
```

`migrate:dev` requires `DATABASE_URL` and fails when `NODE_ENV=production`. It is an explicit developer command, not a startup hook or build/deploy step. Do not use schema push, custom production migration scripts, or startup/build DDL. The production schema is applied **only by Replit Publish**, which compares the development schema with managed production and applies the reviewed schema diff; review any rename/destructive warnings in that flow. Replit's managed database workflow is distinct from running migrations against an external database.

Integration tests are in `lib/db/tests/*.integration.test.ts` and use the package's exported `pool`. They are skipped unless `RUN_DB_TESTS=1`; when enabled, they require `DATABASE_URL` pointing to a disposable development database with the tracked migration already applied. Fixtures run inside a transaction and roll back; the test closes the pool. Example invocation after Vitest is available in the workspace:

```sh
RUN_DB_TESTS=1 pnpm --filter @workspace/db run test:integration
```

### Rollback and retention

Generated migration history is forward-only; do not edit an already-applied migration to reverse it. Correct schema changes with a new migration. Replit's development database supports its own rollback/restore workflow; use that facility for an unwanted development migration rather than dropping data manually. Production rollback remains a deliberate Replit Publish/schema-change operation, with backups and compatibility review; never run this development migration command against production.

Audit logs, events, notifications, provider session references, and rate-limit buckets can grow indefinitely. Define retention, archival, privacy deletion, and legal-hold policies before production scale. Expired/revoked session records and old rate-limit windows are cleanup candidates; audit/event deletion or archival must preserve applicable compliance and investigation needs. No automatic cleanup or data-retention job is installed by this foundation.
