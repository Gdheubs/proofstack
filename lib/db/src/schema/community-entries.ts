import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./users";
import { communityProjectsTable } from "./community-projects";
import { organizationsTable } from "./organizations";
export const communityEntriesTable = pgTable(
  "community_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => communityProjectsTable.id, {
      onDelete: "cascade",
    }),
    organizationId: uuid("organization_id").references(
      () => organizationsTable.id,
      { onDelete: "cascade" },
    ),
    kind: text("kind").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("community_entries_user_idx").on(t.userId),
    index("community_entries_project_idx").on(t.projectId),
    index("community_entries_org_idx").on(t.organizationId),
  ],
);
export const insertCommunityEntrySchema = createInsertSchema(
  communityEntriesTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type CommunityEntry = typeof communityEntriesTable.$inferSelect;
