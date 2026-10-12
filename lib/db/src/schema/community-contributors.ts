import {
  pgTable,
  uuid,
  text,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./users";
import { communityProjectsTable } from "./community-projects";
export const communityContributorsTable = pgTable(
  "community_contributors",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => communityProjectsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] })],
);
export const insertContributorSchema = createInsertSchema(
  communityContributorsTable,
);
