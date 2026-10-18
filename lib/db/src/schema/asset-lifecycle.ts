import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const assetStorageObjectsTable = pgTable(
  "asset_storage_objects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull(),
    bucket: text("bucket").notNull(),
    objectKey: text("object_key").notNull(),
    state: text("state").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
  },
  (t) => [
    unique("asset_storage_objects_identity_unique").on(
      t.provider,
      t.bucket,
      t.objectKey,
    ),
    check(
      "asset_storage_objects_state_check",
      sql`${t.state} IN ('pending','active','deleting','deleted','failed')`,
    ),
    check(
      "asset_storage_objects_key_check",
      sql`${t.provider} ~ '^[a-z][a-z0-9_-]{1,31}$' AND ${t.bucket} ~ '^[a-z0-9][a-z0-9._-]*$' AND ${t.objectKey} ~ '^[A-Za-z0-9._/-]+$' AND ${t.objectKey} !~ '(^|/)\.{1,2}(/|$)'`,
    ),
  ],
);

export const assetUploadAttemptsTable = pgTable(
  "asset_upload_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assetId: uuid("asset_id").notNull(),
    userId: uuid("user_id").notNull(),
    objectId: uuid("object_id").notNull(),
    readyObjectId: uuid("ready_object_id").notNull(),
    expectedSize: integer("expected_size").notNull(),
    contentType: text("content_type").notNull(),
    state: text("state").notNull().default("reserved"),
    fenceToken: integer("fence_token").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    verificationDigest: text("verification_digest"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (t) => [
    unique("asset_upload_attempts_asset_unique").on(t.assetId),
    check("asset_upload_attempts_size_check", sql`${t.expectedSize} >= 0`),
    check(
      "asset_upload_attempts_state_check",
      sql`${t.state} IN ('reserved','uploaded','verified','promoting','ready','failed','expired','deleting','deleted')`,
    ),
    check("asset_upload_attempts_fence_check", sql`${t.fenceToken} >= 0`),
  ],
);

export const assetLifecycleJobsTable = pgTable(
  "asset_lifecycle_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    objectId: uuid("object_id").notNull(),
    attemptId: uuid("attempt_id"),
    kind: text("kind").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    state: text("state").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    fenceToken: integer("fence_token").notNull().default(0),
    leaseToken: uuid("lease_token"),
    leasedUntil: timestamp("leased_until", { withTimezone: true }),
    availableAt: timestamp("available_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("asset_lifecycle_jobs_idempotency_unique").on(t.idempotencyKey),
    index("asset_lifecycle_jobs_poll_idx").on(t.state, t.availableAt),
    check(
      "asset_lifecycle_jobs_kind_check",
      sql`${t.kind} IN ('promotion','reconcile','cleanup')`,
    ),
    check(
      "asset_lifecycle_jobs_state_check",
      sql`${t.state} IN ('pending','leased','complete','failed')`,
    ),
    check(
      "asset_lifecycle_jobs_lease_check",
      sql`(${t.state} = 'leased') = (${t.leaseToken} IS NOT NULL AND ${t.leasedUntil} IS NOT NULL)`,
    ),
    check("asset_lifecycle_jobs_fence_check", sql`${t.fenceToken} >= 0`),
  ],
);
