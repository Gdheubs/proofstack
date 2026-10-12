import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  primaryKey,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { communityProjectsTable } from "./community-projects";
import { usersTable } from "./users";
export const repositoriesTable = pgTable(
  "repositories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => communityProjectsTable.id, { onDelete: "cascade" }),
    defaultBranch: text("default_branch").notNull().default("main"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    quotaBytes: bigint("quota_bytes", { mode: "number" })
      .notNull()
      .default(52428800),
  },
  (t) => [
    uniqueIndex("repository_project_unique").on(t.projectId),
    check("repository_quota_positive", sql`${t.quotaBytes}>0`),
  ],
);
export const repositoryBranchesTable = pgTable(
  "repository_branches",
  {
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositoriesTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    head: text("head").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.repositoryId, t.name] }),
    check("repository_head_sha", sql`${t.head} ~ '^[0-9a-f]{40}$'`),
  ],
);
export const repositoryTokensTable = pgTable(
  "repository_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositoriesTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("repository_token_hash_unique").on(t.tokenHash),
    index("repository_token_user_idx").on(t.userId, t.repositoryId),
  ],
);
