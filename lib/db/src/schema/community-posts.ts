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
export const communityPostsTable = pgTable(
  "community_posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => communityProjectsTable.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    mentions: jsonb("mentions").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("community_posts_created_idx").on(t.createdAt),
    index("community_posts_author_idx").on(t.authorId),
  ],
);
export const insertCommunityPostSchema = createInsertSchema(
  communityPostsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type CommunityPost = typeof communityPostsTable.$inferSelect;
