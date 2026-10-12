import { createInsertSchema } from "drizzle-zod";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const rolesTable = pgTable(
  "roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("roles_key_unique").on(table.key),
    index("roles_name_idx").on(table.name),
  ],
);

export const insertRoleSchema = createInsertSchema(rolesTable)
  .omit({ id: true, createdAt: true })
  .extend({
    key: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9:_-]+$/),
    name: z.string().trim().min(1).max(160),
    description: z.union([z.string().max(1000), z.null()]).optional(),
  });

export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Role = typeof rolesTable.$inferSelect;
