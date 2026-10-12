import { createInsertSchema } from "drizzle-zod";
import {
  index,
  pgTable,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const sessionsTable = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    providerSessionId: text("provider_session_id").notNull(),
    handleHash: text("handle_hash"),
    encryptedCredentials: text("encrypted_credentials"),
    deviceHash: text("device_hash"),
    deviceLabel: text("device_label"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastMfaAt: timestamp("last_mfa_at", { withTimezone: true }),
    passwordRecovery: boolean("password_recovery").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("sessions_provider_session_id_unique").on(
      table.providerSessionId,
    ),
    index("sessions_user_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
    uniqueIndex("sessions_handle_hash_unique").on(table.handleHash),
  ],
);

export const insertSessionSchema = createInsertSchema(sessionsTable)
  .omit({ id: true, createdAt: true })
  .extend({
    providerSessionId: z.string().trim().min(1).max(512),
  });

export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessionsTable.$inferSelect;
