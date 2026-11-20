import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "../schema/organizations";
import { usersTable } from "../schema/users";

// Migration 0023_media_social. Media bytes stay in R2 or the hosted video
// service; these tables contain manifests and provider references only.
export const mediaObjectsTable = pgTable(
  "media_objects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").references(() => usersTable.id, {
      onDelete: "cascade",
    }),
    contentOwnerKind: text("content_owner_kind"),
    contentOrgId: uuid("content_org_id").references(
      () => organizationsTable.id,
      { onDelete: "set null" },
    ),
    createdBy: uuid("created_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(),
    purpose: text("purpose").notNull(),
    storage: text("storage").notNull(),
    namespace: text("namespace").notNull(),
    objectPath: text("object_path"),
    externalId: text("external_id"),
    state: text("state").notNull(),
    contentType: text("content_type").notNull(),
    declaredBytes: bigint("declared_bytes", { mode: "number" }).notNull(),
    bytes: bigint("bytes", { mode: "number" }),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    sha256: text("sha256"),
    thumbhash: text("thumbhash"),
    scan: text("scan").notNull().default("pending"),
    moderation: text("moderation").notNull().default("pending"),
    uploadExpiresAt: timestamp("upload_expires_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("media_objects_owner_created_idx").on(t.ownerId, t.createdAt),
    index("media_objects_content_org_idx").on(t.contentOrgId),
    index("media_objects_created_by_idx").on(t.createdBy),
    index("media_objects_state_expiry_idx").on(t.state, t.uploadExpiresAt),
    uniqueIndex("media_objects_external_id_unique")
      .on(t.externalId)
      .where(sql`${t.externalId} IS NOT NULL`),
    uniqueIndex("media_objects_object_path_unique")
      .on(t.objectPath)
      .where(sql`${t.objectPath} IS NOT NULL`),
    check(
      "media_objects_content_owner_check",
      sql`${t.contentOwnerKind} IS NULL OR ${t.contentOwnerKind} IN ('platform','organization')`,
    ),
    check(
      "media_objects_kind_check",
      sql`${t.kind} IN ('image','video','audio')`,
    ),
    check(
      "media_objects_purpose_check",
      sql`${t.purpose} IN ('post','answer','interview','question','anchor')`,
    ),
    check(
      "media_objects_content_owner_id_check",
      sql`((${t.purpose} IN ('question','anchor')) = (${t.ownerId} IS NULL))`,
    ),
    check(
      "media_objects_storage_check",
      sql`${t.storage} IN ('r2_social','r2_evidence','stream')`,
    ),
    check(
      "media_objects_object_path_check",
      sql`${t.objectPath} IS NULL OR ${t.objectPath} ~ '^/objects/ready/[0-9a-f-]{36}$'`,
    ),
    check(
      "media_objects_stream_external_check",
      sql`(${t.storage} = 'stream') = (${t.externalId} IS NOT NULL)`,
    ),
    check(
      "media_objects_storage_path_check",
      sql`(${t.storage} <> 'stream') = (${t.objectPath} IS NOT NULL)`,
    ),
    check(
      "media_objects_state_check",
      sql`${t.state} IN ('reserved','uploading','processing','ready','failed','deleting')`,
    ),
    check(
      "media_objects_declared_bytes_check",
      sql`${t.declaredBytes} BETWEEN 1 AND 314572800`,
    ),
    check(
      "media_objects_scan_check",
      sql`${t.scan} IN ('pending','clean','infected')`,
    ),
    check(
      "media_objects_moderation_check",
      sql`${t.moderation} IN ('pending','clear','held','removed')`,
    ),
  ],
);

export const mediaUploadsTable = pgTable(
  "media_uploads",
  {
    mediaId: uuid("media_id")
      .primaryKey()
      .references(() => mediaObjectsTable.id, { onDelete: "cascade" }),
    encryptedPayload: text("encrypted_payload").notNull(),
    partBytes: integer("part_bytes"),
    maxBytes: bigint("max_bytes", { mode: "number" }),
    parts: jsonb("parts")
      .$type<
        Array<{
          n: number;
          etag: string;
          sha256: string;
          bytes: number;
          at: string;
        }>
      >()
      .notNull()
      .default([]),
    state: text("state").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    check(
      "media_uploads_state_check",
      sql`${t.state} IN ('open','completed','aborted','expired')`,
    ),
  ],
);

export const mediaRenditionsTable = pgTable(
  "media_renditions",
  {
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaObjectsTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    objectPath: text("object_path").notNull(),
    namespace: text("namespace").notNull(),
    contentType: text("content_type").notNull(),
    bytes: bigint("bytes", { mode: "number" }),
    state: text("state").notNull().default("ready"),
  },
  (t) => [
    primaryKey({ name: "media_renditions_pk", columns: [t.mediaId, t.kind] }),
    uniqueIndex("media_renditions_object_path_unique").on(t.objectPath),
    check(
      "media_renditions_kind_check",
      sql`${t.kind} IN ('playback','audio','poster','transcript')`,
    ),
    check(
      "media_renditions_object_path_check",
      sql`${t.objectPath} ~ '^/objects/ready/[0-9a-f-]{36}$'`,
    ),
    check(
      "media_renditions_state_check",
      sql`${t.state} IN ('ready','deleting')`,
    ),
  ],
);

// Intentionally has no user or media FK: provider cleanup must survive both
// user erasure and media row cascades.
export const mediaCleanupJobsTable = pgTable(
  "media_cleanup_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    state: text("state").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseToken: uuid("lease_token"),
    leasedUntil: timestamp("leased_until", { withTimezone: true }),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("media_cleanup_provider_external_unique").on(
      t.provider,
      t.externalId,
    ),
    index("media_cleanup_state_available_idx").on(t.state, t.availableAt),
    check(
      "media_cleanup_provider_check",
      sql`${t.provider} IN ('stream','ai')`,
    ),
    check(
      "media_cleanup_state_check",
      sql`${t.state} IN ('pending','leased','failed','complete')`,
    ),
    check("media_cleanup_attempts_check", sql`${t.attempts} BETWEEN 0 AND 8`),
  ],
);
