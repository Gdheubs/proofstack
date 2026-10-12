import { createInsertSchema } from "drizzle-zod";
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  jsonb,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const profileKindEnum = pgEnum("profile_kind", [
  "developer",
  "company",
  "recruiter",
]);

export const profilesTable = pgTable(
  "profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    kind: profileKindEnum("kind").notNull().default("developer"),
    avatarUrl: text("avatar_url"),
    handle: text("handle"),
    bio: text("bio").notNull().default(""),
    location: text("location").notNull().default(""),
    skills: jsonb("skills").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("profiles_display_name_idx").on(table.displayName),
    uniqueIndex("profiles_handle_unique").on(table.handle),
  ],
);

export const insertProfileSchema = createInsertSchema(profilesTable)
  .omit({ createdAt: true, updatedAt: true })
  .extend({
    displayName: z.string().trim().min(1).max(160),
    avatarUrl: z.union([z.url(), z.null()]).optional(),
  });

export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profilesTable.$inferSelect;
