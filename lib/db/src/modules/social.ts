import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { communityPostsTable } from "../schema/community-posts";
import { usersTable } from "../schema/users";
import { mediaObjectsTable } from "./media";

export const communityPostDetailsTable = pgTable(
  "community_post_details",
  {
    postId: uuid("post_id")
      .primaryKey()
      .references(() => communityPostsTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    quotePostId: uuid("quote_post_id").references(
      () => communityPostsTable.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("community_post_details_kind_created_idx").on(
      t.kind,
      t.createdAt,
      t.postId,
    ),
    index("community_post_details_quote_post_idx").on(t.quotePostId),
    check(
      "community_post_details_kind_check",
      sql`${t.kind} IN ('post','routine','short','video')`,
    ),
  ],
);

export const communityPostMediaTable = pgTable(
  "community_post_media",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => communityPostsTable.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaObjectsTable.id, { onDelete: "cascade" }),
    alt: text("alt"),
  },
  (t) => [
    primaryKey({
      name: "community_post_media_pk",
      columns: [t.postId, t.position],
    }),
    uniqueIndex("community_post_media_media_unique").on(t.mediaId),
    check(
      "community_post_media_position_check",
      sql`${t.position} BETWEEN 0 AND 3`,
    ),
    check(
      "community_post_media_alt_check",
      sql`${t.alt} IS NULL OR char_length(${t.alt}) <= 500`,
    ),
  ],
);

export const communityRepostsTable = pgTable(
  "community_reposts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => communityPostsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ name: "community_reposts_pk", columns: [t.userId, t.postId] }),
    index("community_reposts_post_idx").on(t.postId),
    index("community_reposts_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export const communityTopicsTable = pgTable(
  "community_topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("community_topics_slug_unique").on(t.slug),
    check(
      "community_topics_slug_check",
      sql`${t.slug} ~ '^[a-z0-9][a-z0-9_]{1,49}$'`,
    ),
    check(
      "community_topics_status_check",
      sql`${t.status} IN ('active','blocked')`,
    ),
  ],
);

export const communityPostTopicsTable = pgTable(
  "community_post_topics",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => communityPostsTable.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => communityTopicsTable.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({
      name: "community_post_topics_pk",
      columns: [t.postId, t.topicId],
    }),
    index("community_post_topics_topic_post_idx").on(t.topicId, t.postId),
  ],
);

export const communityRoutinesTable = pgTable(
  "community_routines",
  {
    postId: uuid("post_id")
      .primaryKey()
      .references(() => communityPostsTable.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    items: jsonb("items")
      .$type<Array<{ label: string; done: boolean }>>()
      .notNull(),
    minutes: integer("minutes").notNull(),
  },
  (t) => [
    uniqueIndex("community_routines_author_day_unique").on(t.authorId, t.day),
    check(
      "community_routines_items_size_check",
      sql`octet_length(${t.items}::text) <= 4096`,
    ),
    check(
      "community_routines_items_array_check",
      sql`jsonb_typeof(${t.items}) = 'array' AND jsonb_array_length(${t.items}) <= 12`,
    ),
    check(
      "community_routines_minutes_check",
      sql`${t.minutes} BETWEEN 0 AND 1440`,
    ),
  ],
);

export const communityBlocksTable = pgTable(
  "community_blocks",
  {
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({
      name: "community_blocks_pk",
      columns: [t.blockerId, t.blockedId],
    }),
    index("community_blocks_blocked_idx").on(t.blockedId),
    check(
      "community_blocks_not_self_check",
      sql`${t.blockerId} <> ${t.blockedId}`,
    ),
  ],
);

export const contentReportsTable = pgTable(
  "content_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: uuid("reporter_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    reason: text("reason").notNull(),
    details: text("details"),
    state: text("state").notNull().default("open"),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    handledBy: uuid("handled_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("content_reports_open_reporter_target_unique")
      .on(t.reporterId, t.targetType, t.targetId)
      .where(sql`${t.state} = 'open'`),
    index("content_reports_reporter_idx").on(t.reporterId),
    index("content_reports_handler_idx").on(t.handledBy),
    index("content_reports_state_due_idx").on(t.state, t.dueAt),
    index("content_reports_target_idx").on(t.targetType, t.targetId),
    check(
      "content_reports_target_type_check",
      sql`${t.targetType} IN ('post','comment','media','profile','job','job_check')`,
    ),
    check(
      "content_reports_reason_check",
      sql`${t.reason} IN ('illegal','sexual','child_safety','harassment','hate','violence','spam','impersonation','privacy','intellectual_property','cheating','other')`,
    ),
    check(
      "content_reports_details_check",
      sql`${t.details} IS NULL OR char_length(${t.details}) <= 2000`,
    ),
    check(
      "content_reports_state_check",
      sql`${t.state} IN ('open','triaged','actioned','dismissed')`,
    ),
  ],
);

export const contentRestrictionsTable = pgTable(
  "content_restrictions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    action: text("action").notNull(),
    reasonCode: text("reason_code").notNull(),
    actorId: uuid("actor_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    reportId: uuid("report_id").references(() => contentReportsTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    liftedAt: timestamp("lifted_at", { withTimezone: true }),
    liftedBy: uuid("lifted_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    uniqueIndex("content_restrictions_active_target_unique")
      .on(t.targetType, t.targetId)
      .where(sql`${t.liftedAt} IS NULL`),
    index("content_restrictions_target_idx").on(t.targetType, t.targetId),
    index("content_restrictions_actor_idx").on(t.actorId),
    index("content_restrictions_report_idx").on(t.reportId),
    index("content_restrictions_lifted_by_idx").on(t.liftedBy),
    check(
      "content_restrictions_action_check",
      sql`${t.action} IN ('hidden','removed')`,
    ),
  ],
);

export const contentSuspensionsTable = pgTable(
  "content_suspensions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    reasonCode: text("reason_code").notNull(),
    actorId: uuid("actor_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    startsAt: timestamp("starts_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("content_suspensions_user_ends_idx").on(t.userId, t.endsAt),
    index("content_suspensions_actor_idx").on(t.actorId),
  ],
);
