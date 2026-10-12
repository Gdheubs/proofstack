import { createInsertSchema } from "drizzle-zod";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";

export const eventsTable = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").references(
      () => organizationsTable.id,
      {
        onDelete: "set null",
      },
    ),
    actorUserId: uuid("actor_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("events_organization_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    index("events_actor_created_idx").on(table.actorUserId, table.createdAt),
    index("events_type_created_idx").on(table.type, table.createdAt),
  ],
);

export const insertEventSchema = createInsertSchema(eventsTable)
  .omit({ id: true, createdAt: true })
  .extend({ type: z.string().trim().min(1).max(150) });

export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof eventsTable.$inferSelect;
