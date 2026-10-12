import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
  primaryKey,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { repositoriesTable } from "./repositories";
export const intelligenceJobsTable = pgTable(
  "intelligence_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    requestKey: uuid("request_key").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("queued"),
    repositoryId: uuid("repository_id").references(() => repositoriesTable.id, {
      onDelete: "cascade",
    }),
    input: jsonb("input").notNull(),
    result: jsonb("result"),
    attempts: integer("attempts").notNull().default(0),
    leaseId: uuid("lease_id"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    providerStartedAt: timestamp("provider_started_at", { withTimezone: true }),
    model: text("model"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    estimatedCostMicros: integer("estimated_cost_micros"),
    error: text("error"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("intelligence_request_unique").on(t.userId, t.requestKey),
    index("intelligence_owner_created_idx").on(t.userId, t.createdAt, t.id),
    index("intelligence_finished_idx").on(t.status, t.finishedAt),
    index("intelligence_queue_idx").on(t.status, t.availableAt, t.createdAt),
    index("intelligence_lease_idx").on(t.status, t.leaseUntil),
    check(
      "intelligence_kind_check",
      sql`${t.kind} in ('opportunities','career-plan','security-scan')`,
    ),
    check(
      "intelligence_status_check",
      sql`${t.status} in ('queued','running','succeeded','failed','cancelled')`,
    ),
    check("intelligence_attempt_check", sql`${t.attempts} between 0 and 3`),
    check(
      "intelligence_repository_check",
      sql`(${t.kind}='security-scan') = (${t.repositoryId} is not null)`,
    ),
    check(
      "intelligence_usage_check",
      sql`coalesce(${t.promptTokens},0)>=0 and coalesce(${t.completionTokens},0)>=0 and coalesce(${t.estimatedCostMicros},0)>=0`,
    ),
  ],
);
export const intelligenceBudgetsTable = pgTable(
  "intelligence_budgets",
  {
    scope: text("scope").notNull(),
    day: text("day").notNull(),
    used: integer("used").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.scope, t.day] }),
    check("intelligence_budget_check", sql`${t.used} >= 0`),
  ],
);
