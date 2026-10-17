import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
export const assessmentAttemptsTable = pgTable(
  "assessment_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    assessmentId: text("assessment_id").notNull(),
    questionVersion: integer("question_version").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    answers: jsonb("answers"),
    result: jsonb("result"),
  },
  (t) => [
    index("assessment_results_user_idx").on(
      t.userId,
      t.assessmentId,
      t.completedAt,
    ),
    uniqueIndex("assessment_open_attempt_unique")
      .on(t.userId, t.assessmentId)
      .where(sql`${t.completedAt} IS NULL`),
    check("assessment_version_check", sql`${t.questionVersion} > 0`),
    check(
      "assessment_completion_check",
      sql`(${t.completedAt} IS NULL AND ${t.answers} IS NULL AND ${t.result} IS NULL) OR (${t.completedAt} IS NOT NULL AND ${t.answers} IS NOT NULL AND ${t.result} IS NOT NULL)`,
    ),
  ],
);
