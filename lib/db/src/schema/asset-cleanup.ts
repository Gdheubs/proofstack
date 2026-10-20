import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Deliberately no user/asset FK: committed cleanup must survive account cascades.
export const assetCleanupJobsTable = pgTable(
  "asset_cleanup_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assetId: uuid("asset_id").notNull().unique(),
    objectPath: text("object_path").notNull(),
    bucket: text("bucket").notNull(),
    namespace: text("namespace").notNull(),
    objectName: text("object_name").notNull(),
    generation: text("generation"),
    state: text("state").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseToken: uuid("lease_token"),
    leasedUntil: timestamp("leased_until", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("asset_cleanup_jobs_poll_idx").on(t.state, t.availableAt),
    check(
      "asset_cleanup_state_check",
      sql`${t.state} IN ('pending','leased','failed','complete')`,
    ),
    check("asset_cleanup_attempts_check", sql`${t.attempts} BETWEEN 0 AND 8`),
    check(
      "asset_cleanup_lease_check",
      sql`(${t.state} = 'leased') = (${t.leaseToken} IS NOT NULL AND ${t.leasedUntil} IS NOT NULL)`,
    ),
    check(
      "asset_cleanup_target_check",
      sql`${t.bucket} ~ '^[a-z0-9][a-z0-9._-]*$' AND ${t.namespace} ~ '^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$' AND ${t.namespace} !~ '(^|/)\\.{1,2}(/|$)' AND ${t.objectPath} ~ '^/objects/(ready|uploads)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND ${t.objectName} = ${t.namespace} || '/' || substring(${t.objectPath} from 10)`,
    ),
    // A numeric object generation or an R2/S3 ETag (single or multipart).
    check(
      "asset_cleanup_generation_check",
      sql`${t.generation} IS NULL OR ${t.generation} ~ '^([1-9][0-9]{0,29}|[0-9a-f]{32}(-[1-9][0-9]{0,4})?)$'`,
    ),
  ],
);
