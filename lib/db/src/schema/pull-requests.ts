import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { repositoriesTable } from "./repositories";
import { usersTable } from "./users";
import { projectIssuesTable } from "./careers";
export const pullRequestsTable = pgTable(
  "repository_pull_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositoriesTable.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    authorId: uuid("author_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    sourceBranch: text("source_branch").notNull(),
    targetBranch: text("target_branch").notNull(),
    status: text("status").notNull().default("open"),
    issueId: uuid("issue_id").references(() => projectIssuesTable.id, {
      onDelete: "set null",
    }),
    sourceHead: text("source_head").notNull(),
    targetHead: text("target_head").notNull(),
    mergeHead: text("merge_head"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("pull_request_number_unique").on(t.repositoryId, t.number),
    index("pull_request_repo_status_idx").on(
      t.repositoryId,
      t.status,
      t.createdAt,
    ),
    check(
      "pull_request_status_check",
      sql`${t.status} in ('draft','open','closed','merged')`,
    ),
    check(
      "pull_request_distinct_branches",
      sql`${t.sourceBranch}<>${t.targetBranch}`,
    ),
  ],
);
export const pullReviewsTable = pgTable(
  "repository_pull_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pullRequestId: uuid("pull_request_id")
      .notNull()
      .references(() => pullRequestsTable.id, { onDelete: "cascade" }),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    sourceHead: text("source_head").notNull(),
    targetHead: text("target_head").notNull(),
    decision: text("decision").notNull(),
    body: text("body").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("pull_review_latest_idx").on(
      t.pullRequestId,
      t.reviewerId,
      t.createdAt,
    ),
    check(
      "pull_review_decision_check",
      sql`${t.decision} in ('approved','changes-requested')`,
    ),
  ],
);
export const pullCommentsTable = pgTable(
  "repository_pull_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pullRequestId: uuid("pull_request_id")
      .notNull()
      .references(() => pullRequestsTable.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("pull_comment_created_idx").on(t.pullRequestId, t.createdAt)],
);
export const pullChecksTable = pgTable(
  "repository_pull_checks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pullRequestId: uuid("pull_request_id")
      .notNull()
      .references(() => pullRequestsTable.id, { onDelete: "cascade" }),
    sourceHead: text("source_head").notNull(),
    targetHead: text("target_head").notNull(),
    status: text("status").notNull(),
    details: text("details").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("pull_check_snapshot_unique").on(
      t.pullRequestId,
      t.sourceHead,
      t.targetHead,
    ),
    check("pull_check_status_check", sql`${t.status} in ('passed','failed')`),
  ],
);
export const repositoryReleasesTable = pgTable(
  "repository_releases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositoriesTable.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    tag: text("tag").notNull(),
    title: text("title").notNull(),
    notes: text("notes").notNull(),
    commit: text("commit").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("repository_release_tag_unique").on(t.repositoryId, t.tag),
    index("repository_release_created_idx").on(t.repositoryId, t.createdAt),
  ],
);
