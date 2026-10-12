import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";

export const notificationsTable = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(
      () => organizationsTable.id,
      {
        onDelete: "set null",
      },
    ),
    title: text("title").notNull(),
    body: text("body").notNull(),
    href: text("href").notNull().default("/account"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notifications_user_created_idx").on(table.userId, table.createdAt),
    index("notifications_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    index("notifications_user_unread_idx")
      .on(table.userId, table.createdAt)
      .where(sql`read_at IS NULL`),
  ],
);

export const insertNotificationSchema = createInsertSchema(notificationsTable)
  .omit({ id: true, createdAt: true })
  .extend({
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(10_000),
  });

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
