import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./users";
import { organizationsTable } from "./organizations";
export const communityProjectsTable = pgTable(
  "community_projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(
      () => organizationsTable.id,
      { onDelete: "cascade" },
    ),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    technologies: jsonb("technologies").$type<string[]>().notNull().default([]),
    screenshots: jsonb("screenshots").$type<string[]>().notNull().default([]),
    demoUrl: text("demo_url").notNull().default(""),
    repositoryUrl: text("repository_url").notNull().default(""),
    visibility: text("visibility").notNull().default("public"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("community_projects_slug_unique").on(t.slug),
    index("community_projects_created_idx").on(t.createdAt, t.id),
    index("community_projects_owner_idx").on(t.ownerId),
    index("community_projects_org_idx").on(t.organizationId),
  ],
);
export const insertCommunityProjectSchema = createInsertSchema(
  communityProjectsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type CommunityProject = typeof communityProjectsTable.$inferSelect;
