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

export const permissionsTable = pgTable(
  "permissions",
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
    uniqueIndex("permissions_key_unique").on(table.key),
    index("permissions_name_idx").on(table.name),
  ],
);

export const insertPermissionSchema = createInsertSchema(permissionsTable)
  .omit({ id: true, createdAt: true })
  .extend({
    key: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-z][a-z0-9_.:-]*$/),
    name: z.string().trim().min(1).max(160),
    description: z.union([z.string().max(1000), z.null()]).optional(),
  });

export type InsertPermission = z.infer<typeof insertPermissionSchema>;
export type Permission = typeof permissionsTable.$inferSelect;
